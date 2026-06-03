#!/usr/bin/env node
// Google Search Console URL Inspection API로 페이지 색인 상태 확인
// 사용:
//   node --env-file=.env script/gsc-inspect.mjs setup           GSC scope 추가 안내
//   node --env-file=.env script/gsc-inspect.mjs <URL>           단건 검사
//   node --env-file=.env script/gsc-inspect.mjs sitemap         sitemap 전체 일괄 검사
//   node --env-file=.env script/gsc-inspect.mjs recent [days]   최근 N일 발행 글만 (기본 7)
//   node --env-file=.env script/gsc-inspect.mjs not-indexed     sitemap 검사 후 미색인만 출력

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CREDENTIALS_DIR = path.join(ROOT, '.credentials');
const TOKEN_PATH = path.join(CREDENTIALS_DIR, 'gsc-token.json');
const TMP_DIR = path.join(ROOT, 'tmp');
const BLOG_MODIFIED_MAP_PATH = path.join(ROOT, '.astro', 'blog-modified-map.json');

const SITE_HOST = 'helpsns.com';
const SITE_URL = `https://www.${SITE_HOST}`;
const SITEMAP_URL = `${SITE_URL}/sitemap-0.xml`;

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN_ENV = process.env.GOOGLE_REFRESH_TOKEN;

// URL Inspection API rate limit: 분당 600, 일 2000
// 분당 300 (URL당 200ms)로 안전 마진 확보
const SLEEP_MS = 200;
const DAILY_LIMIT = 2000;

const [mode, ...rest] = process.argv.slice(2);

if (mode === 'setup') {
  printSetupGuide();
} else if (mode === 'sitemap') {
  await runSitemap();
} else if (mode === 'recent') {
  const days = parseInt(rest[0], 10) || 7;
  await runRecent(days);
} else if (mode === 'not-indexed') {
  await runSitemap({ filterNotIndexed: true });
} else if (mode?.startsWith('http')) {
  await runSingle(mode);
} else {
  printUsage();
  process.exit(1);
}

// --- setup 안내 ---

function printSetupGuide() {
  console.log(`
GSC URL Inspection API setup
============================

기존 \`GOOGLE_REFRESH_TOKEN\`은 Indexing API 전용 scope만 가지고 있어 GSC API 호출 시 401이 납니다.
다음 단계로 scope를 추가하여 refresh token을 재발급하세요.

1. GCP Console (https://console.cloud.google.com) → 기존 프로젝트 선택
2. APIs & Services → Library → "Google Search Console API" 검색 → 활성화
3. \`script/index-submit.mjs\`의 \`INDEXING_SCOPE\` 라인을 찾아 GSC scope 추가:

   기존:
     const INDEXING_SCOPE = 'https://www.googleapis.com/auth/indexing';

   변경:
     const INDEXING_SCOPE = 'https://www.googleapis.com/auth/indexing https://www.googleapis.com/auth/webmasters.readonly';

4. \`.credentials/gsc-token.json\` 삭제 (기존 token 무효화)
5. \`node --env-file=.env script/index-submit.mjs setup\` 재실행
   → 브라우저 OAuth 동의 화면에서 Search Console 권한 추가 확인 후 승인
6. 새 refresh token이 출력되면 Amplify Console 환경변수 \`GOOGLE_REFRESH_TOKEN\`도 갱신
7. 검증: \`node --env-file=.env script/gsc-inspect.mjs ${SITE_URL}/\`

필수 권한
---------
- 본인 Google 계정이 Search Console에서 \`${SITE_HOST}\` 속성의 소유자(Owner) 또는 전체 사용자(Full User) 권한이어야 합니다.
`);
}

// --- OAuth (index-submit.mjs 패턴 재사용) ---

async function refreshAccessToken(refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'refresh_token',
    }).toString(),
  });

  if (!res.ok) throw new Error(`토큰 갱신 실패: ${await res.text()}`);
  return (await res.json()).access_token;
}

async function getAccessToken() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET 환경변수 없음');
  }

  // CI 모드: 환경변수에 refresh_token 있으면 직접 갱신
  if (REFRESH_TOKEN_ENV) {
    return await refreshAccessToken(REFRESH_TOKEN_ENV);
  }

  // 로컬 모드: .credentials/gsc-token.json 사용
  if (!existsSync(TOKEN_PATH)) {
    throw new Error('Google 토큰 없음. `node --env-file=.env script/index-submit.mjs setup`을 먼저 실행하세요.');
  }

  const tokens = JSON.parse(await readFile(TOKEN_PATH, 'utf-8'));

  if (tokens.expiry_date && Date.now() < tokens.expiry_date - 5 * 60 * 1000) {
    return tokens.access_token;
  }

  const newAccessToken = await refreshAccessToken(tokens.refresh_token);
  const merged = {
    ...tokens,
    access_token: newAccessToken,
    expiry_date: Date.now() + 3600 * 1000,
  };
  await writeFile(TOKEN_PATH, JSON.stringify(merged, null, 2), 'utf-8');
  return newAccessToken;
}

// --- URL Inspection API ---

async function inspectUrl(url, accessToken) {
  const res = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inspectionUrl: url,
      siteUrl: `${SITE_URL}/`,
      languageCode: 'ko-KR',
    }),
  });

  if (res.status === 401) {
    throw new Error(
      '401 Unauthorized — refresh token에 GSC scope 없음. `node script/gsc-inspect.mjs setup` 안내 따르세요.',
    );
  }

  if (res.status === 403) {
    const body = await res.text();
    if (body.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT')) {
      throw new Error(
        '403 ACCESS_TOKEN_SCOPE_INSUFFICIENT — refresh token에 webmasters.readonly scope 없음.\n' +
        '해결 절차:\n' +
        '  1. rm .credentials/gsc-token.json\n' +
        '  2. .env의 GOOGLE_REFRESH_TOKEN 줄 임시 주석 처리 (있으면)\n' +
        '  3. node --env-file=.env script/index-submit.mjs setup\n' +
        '     → 브라우저에서 OAuth 동의 시 "Search Console" 권한 체크박스 확인 후 승인\n' +
        '  4. 출력된 새 refresh token을 .env GOOGLE_REFRESH_TOKEN 및 Amplify env에 갱신\n' +
        '  5. 재시도: node --env-file=.env script/gsc-inspect.mjs <URL>',
      );
    }
    throw new Error(`403 Forbidden — GSC 소유자 권한 또는 Search Console API 활성화 확인 필요\n${body}`);
  }

  if (res.status === 429) {
    throw new Error('429 Rate limit — 일일 한도 초과 또는 분당 한도 초과');
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} — ${await res.text()}`);
  }

  return await res.json();
}

// --- 응답 파싱 ---

function summarizeInspection(url, response) {
  const result = response?.inspectionResult || {};
  const idx = result.indexStatusResult || {};
  const mob = result.mobileUsabilityResult || {};
  const rich = result.richResultsResult || {};

  return {
    url,
    verdict: idx.verdict || '-',
    coverageState: idx.coverageState || '-',
    indexingState: idx.indexingState || '-',
    robotsTxtState: idx.robotsTxtState || '-',
    pageFetchState: idx.pageFetchState || '-',
    userCanonical: idx.userCanonical || '-',
    googleCanonical: idx.googleCanonical || '-',
    lastCrawlTime: idx.lastCrawlTime || '-',
    crawledAs: idx.crawledAs || '-',
    referringUrls: idx.referringUrls || [],
    sitemap: idx.sitemap || [],
    mobileVerdict: mob.verdict || '-',
    richVerdict: rich.verdict || '-',
    richItems: (rich.detectedItems || []).map((d) => d.richResultType).filter(Boolean),
    inspectionResultLink: result.inspectionResultLink || '-',
  };
}

function isIndexed(summary) {
  // languageCode 'ko-KR' 응답이 한국어이므로 영문/한국어 둘 다 매칭
  // 색인됨: "Submitted and indexed", "Indexed, not submitted in sitemap" / "제출되고 색인이 생성되었습니다"
  // 미색인: "Discovered - currently not indexed" / "발견됨 - 현재 색인이 생성되지 않음", "URL is unknown to Google" / "Google에는 아직 알려지지 않은 URL입니다"
  const s = summary.coverageState || '';
  if (s.includes('알려지지 않')) return false;
  if (s.includes('발견됨')) return false;
  if (s.includes('색인이 생성되지')) return false;
  if (s.includes('색인이 생성되었')) return true;
  // 영문 폴백
  const low = s.toLowerCase();
  if (low.includes('not indexed') || low.includes('unknown')) return false;
  return low.includes('indexed');
}

// --- 출력 포맷 ---

function printSummary(summary) {
  const indexed = isIndexed(summary);
  const icon = indexed ? '✓' : '✗';
  console.log(`
${icon} ${summary.url}
  Coverage:        ${summary.coverageState}
  Verdict:         ${summary.verdict}
  Indexing State:  ${summary.indexingState}
  Robots:          ${summary.robotsTxtState}
  Page Fetch:      ${summary.pageFetchState}
  User Canonical:  ${summary.userCanonical}
  Google Canonical:${summary.googleCanonical}
  Last Crawl:      ${summary.lastCrawlTime}
  Crawled As:      ${summary.crawledAs}
  Mobile:          ${summary.mobileVerdict}
  Rich Result:     ${summary.richVerdict}${summary.richItems.length ? ` (${summary.richItems.join(', ')})` : ''}
  GSC Link:        ${summary.inspectionResultLink}
`);
}

function buildMarkdownReport(summaries) {
  const total = summaries.length;
  const indexedCount = summaries.filter(isIndexed).length;
  const notIndexed = summaries.filter((s) => !isIndexed(s));

  const lines = [];
  lines.push(`# GSC URL Inspection 결과`);
  lines.push('');
  lines.push(`- 검사 시각: ${new Date().toISOString()}`);
  lines.push(`- 전체: **${total}개**`);
  lines.push(`- 색인됨: **${indexedCount}개** (${total ? ((indexedCount / total) * 100).toFixed(1) : 0}%)`);
  lines.push(`- 미색인: **${total - indexedCount}개**`);
  lines.push('');

  if (notIndexed.length > 0) {
    lines.push(`## 미색인 URL (${notIndexed.length}개)`);
    lines.push('');
    lines.push('| URL | Coverage | Verdict | Last Crawl |');
    lines.push('|-----|----------|---------|------------|');
    for (const s of notIndexed) {
      lines.push(`| ${s.url} | ${s.coverageState} | ${s.verdict} | ${s.lastCrawlTime} |`);
    }
    lines.push('');
  }

  lines.push(`## 전체 결과`);
  lines.push('');
  lines.push('| URL | Status | Coverage | Last Crawl |');
  lines.push('|-----|--------|----------|------------|');
  for (const s of summaries) {
    const icon = isIndexed(s) ? '✓' : '✗';
    lines.push(`| ${s.url} | ${icon} | ${s.coverageState} | ${s.lastCrawlTime} |`);
  }

  return lines.join('\n');
}

async function saveReport(summaries, rawResponses) {
  await mkdir(TMP_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const jsonPath = path.join(TMP_DIR, `gsc-inspect-${ts}.json`);
  const mdPath = path.join(TMP_DIR, `gsc-inspect-${ts}.md`);

  await writeFile(
    jsonPath,
    JSON.stringify(
      {
        inspectedAt: new Date().toISOString(),
        total: summaries.length,
        summaries,
        rawResponses,
      },
      null,
      2,
    ),
    'utf-8',
  );
  await writeFile(mdPath, buildMarkdownReport(summaries), 'utf-8');

  console.log(`\n결과 저장됨:`);
  console.log(`  - ${path.relative(ROOT, jsonPath)}`);
  console.log(`  - ${path.relative(ROOT, mdPath)}`);
}

// --- 모드: 단건 ---

async function runSingle(url) {
  const accessToken = await getAccessToken();
  const response = await inspectUrl(url, accessToken);
  const summary = summarizeInspection(url, response);
  printSummary(summary);
  await saveReport([summary], [{ url, response }]);
}

// --- 모드: sitemap 전체 ---

async function runSitemap(opts = {}) {
  const accessToken = await getAccessToken();
  const urls = await fetchSitemapUrls();

  if (urls.length > DAILY_LIMIT) {
    console.log(`⚠ sitemap URL ${urls.length}개 / 일일 한도 ${DAILY_LIMIT}개 초과 — 처음 ${DAILY_LIMIT}개만 검사`);
  }
  const targets = urls.slice(0, DAILY_LIMIT);

  console.log(`총 ${targets.length}개 URL 검사 시작 (예상 소요: ${Math.ceil((targets.length * SLEEP_MS) / 60000)}분)\n`);

  const summaries = [];
  const rawResponses = [];
  let processed = 0;

  for (const url of targets) {
    try {
      const response = await inspectUrl(url, accessToken);
      const summary = summarizeInspection(url, response);
      summaries.push(summary);
      rawResponses.push({ url, response });
      processed++;

      const icon = isIndexed(summary) ? '✓' : '✗';
      console.log(`[${processed}/${targets.length}] ${icon} ${url} — ${summary.coverageState}`);
    } catch (e) {
      console.error(`[${processed + 1}/${targets.length}] ✗ ${url} — ${e.message}`);
      summaries.push({ url, error: e.message });
      if (e.message.includes('401') || e.message.includes('403')) {
        console.error('인증/권한 에러로 중단');
        break;
      }
      if (e.message.includes('429')) {
        console.error('Rate limit 도달로 중단. 결과 저장 후 종료');
        break;
      }
    }

    if (processed < targets.length) await sleep(SLEEP_MS);
  }

  console.log('');
  const validSummaries = summaries.filter((s) => !s.error);

  if (opts.filterNotIndexed) {
    const notIndexed = validSummaries.filter((s) => !isIndexed(s));
    console.log(`\n=== 미색인 URL ${notIndexed.length}개 ===\n`);
    notIndexed.forEach((s) => console.log(`  ${s.url}\n    ${s.coverageState}`));
  }

  await saveReport(summaries, rawResponses);
}

// --- 모드: recent (최근 N일 발행 글) ---

async function runRecent(days) {
  if (!existsSync(BLOG_MODIFIED_MAP_PATH)) {
    console.error(`${path.relative(ROOT, BLOG_MODIFIED_MAP_PATH)} 없음. \`npm run build\` 또는 prefetch-blog-modified.mjs 먼저 실행하세요.`);
    process.exit(1);
  }

  const map = JSON.parse(await readFile(BLOG_MODIFIED_MAP_PATH, 'utf-8'));
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  const recentSlugs = Object.entries(map).filter(([, modifiedGmt]) => {
    const ms = new Date(`${modifiedGmt}Z`).getTime();
    return !isNaN(ms) && ms >= cutoff;
  });

  if (recentSlugs.length === 0) {
    console.log(`최근 ${days}일 내 발행/수정된 글 없음`);
    return;
  }

  const urls = recentSlugs.map(([slug]) => `${SITE_URL}/blog/${encodeURIComponent(slug)}/`);
  console.log(`최근 ${days}일 발행/수정 글 ${urls.length}개 검사 시작\n`);

  const accessToken = await getAccessToken();
  const summaries = [];
  const rawResponses = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    try {
      const response = await inspectUrl(url, accessToken);
      const summary = summarizeInspection(url, response);
      summaries.push(summary);
      rawResponses.push({ url, response });
      const icon = isIndexed(summary) ? '✓' : '✗';
      console.log(`[${i + 1}/${urls.length}] ${icon} ${url} — ${summary.coverageState}`);
    } catch (e) {
      console.error(`[${i + 1}/${urls.length}] ✗ ${url} — ${e.message}`);
      summaries.push({ url, error: e.message });
      if (e.message.includes('401') || e.message.includes('403') || e.message.includes('429')) break;
    }
    if (i < urls.length - 1) await sleep(SLEEP_MS);
  }

  await saveReport(summaries, rawResponses);
}

// --- 헬퍼 ---

async function fetchSitemapUrls() {
  console.log(`sitemap 가져오는 중: ${SITEMAP_URL}`);
  const res = await fetch(SITEMAP_URL);
  if (!res.ok) throw new Error(`sitemap fetch 실패: HTTP ${res.status}`);
  const xml = await res.text();
  const urls = [...xml.matchAll(/<loc>(https?:\/\/[^<]+)<\/loc>/g)].map((m) => m[1]);
  if (urls.length === 0) throw new Error('sitemap에서 URL 없음');
  return urls;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function printUsage() {
  console.log(`
사용법:
  node --env-file=.env script/gsc-inspect.mjs setup               GSC scope 추가 안내
  node --env-file=.env script/gsc-inspect.mjs <URL>               단건 검사
  node --env-file=.env script/gsc-inspect.mjs sitemap             sitemap 전체 일괄 검사
  node --env-file=.env script/gsc-inspect.mjs recent [days]       최근 N일 발행 글만 (기본 7)
  node --env-file=.env script/gsc-inspect.mjs not-indexed         sitemap 검사 후 미색인만 강조

필요한 환경변수 (.env / Amplify Console):
  GOOGLE_CLIENT_ID        GCP OAuth2 클라이언트 ID (Indexing API와 공용)
  GOOGLE_CLIENT_SECRET    GCP OAuth2 클라이언트 Secret
  GOOGLE_REFRESH_TOKEN    CI용 갱신 토큰 (GSC scope 포함 필요)

처음 사용 시 \`setup\` 모드를 먼저 실행하여 scope 추가 절차를 확인하세요.
`);
}
