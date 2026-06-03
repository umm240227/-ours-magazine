#!/usr/bin/env node
// IndexNow(네이버·Bing 동시) + Google Indexing API 색인 제출
// 사용:
//   node --env-file=.env script/index-submit.mjs setup           첫 실행: IndexNow 키 생성 + GCP OAuth 설정
//   node --env-file=.env script/index-submit.mjs <URL>           특정 URL 제출
//   node --env-file=.env script/index-submit.mjs sitemap         sitemap.xml 전체 URL 제출
//   node script/index-submit.mjs sitemap-diff                    빌드 후 변경된 URL만 제출 (Amplify CI용)

import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { exec } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CREDENTIALS_DIR = path.join(ROOT, '.credentials');
const TOKEN_PATH = path.join(CREDENTIALS_DIR, 'gsc-token.json');
const ENV_PATH = path.join(ROOT, '.env');
const PREV_SITEMAP_PATH = path.join(ROOT, '.astro', 'prev-sitemap.xml');
const NEW_SITEMAP_PATH = path.join(ROOT, 'dist', 'sitemap-0.xml');

const SITE_HOST = 'helpsns.com';
const SITE_URL = `https://${SITE_HOST}`;
const OAUTH_PORT = 3737;
const REDIRECT_URI = `http://localhost:${OAUTH_PORT}/callback`;
// GSC URL Inspection API(/gsc-inspect)를 함께 쓰려면 webmasters.readonly scope 추가:
//   'https://www.googleapis.com/auth/indexing https://www.googleapis.com/auth/webmasters.readonly'
// scope 변경 후 .credentials/gsc-token.json 삭제 → setup 재실행 → Amplify env 갱신 필요
const INDEXING_SCOPE = 'https://www.googleapis.com/auth/indexing https://www.googleapis.com/auth/webmasters.readonly';

const INDEXNOW_KEY = process.env.INDEXNOW_KEY;
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
// CI 모드: GOOGLE_REFRESH_TOKEN 환경변수가 있으면 브라우저 없이 토큰 갱신
const REFRESH_TOKEN_ENV = process.env.GOOGLE_REFRESH_TOKEN;

const [mode] = process.argv.slice(2);

if (mode === 'setup') {
  await runSetup();
} else if (mode === 'sitemap-diff') {
  await runSitemapDiff();
} else if (mode === 'sitemap') {
  await runSitemap();
} else if (mode?.startsWith('http')) {
  await runSubmit([mode]);
} else {
  printUsage();
  process.exit(1);
}

// --- setup ---

async function runSetup() {
  console.log('\n[1/3] IndexNow 키 설정');
  await setupIndexNow();

  console.log('\n[2/3] Google OAuth2 설정');
  await setupGoogleOAuth();

  console.log('\n[3/3] 완료');
  console.log('이제 URL 제출 가능: node --env-file=.env script/index-submit.mjs <URL>');
}

async function setupIndexNow() {
  if (INDEXNOW_KEY) {
    console.log(`✓ INDEXNOW_KEY 이미 설정됨: ${INDEXNOW_KEY}`);
    return;
  }

  const key = randomUUID().replace(/-/g, '');
  const keyFile = path.join(ROOT, 'public', `${key}.txt`);

  await writeFile(keyFile, key, 'utf-8');
  console.log(`✓ 키 파일 생성: public/${key}.txt`);

  let envContent = '';
  try { envContent = await readFile(ENV_PATH, 'utf-8'); } catch {}

  if (!envContent.includes('INDEXNOW_KEY')) {
    await writeFile(ENV_PATH, `${envContent.trimEnd()}\nINDEXNOW_KEY=${key}\n`, 'utf-8');
    console.log(`✓ .env에 INDEXNOW_KEY 추가됨`);
  }

  console.log(`\n⚠ 주의: public/${key}.txt 를 git 커밋 후 배포해야`);
  console.log(`  https://${SITE_HOST}/${key}.txt 로 접근 가능해야 검증됩니다.`);
}

async function setupGoogleOAuth() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.log('\nGoogle Indexing API OAuth2 설정 필요:');
    console.log('1. https://console.cloud.google.com 접속 (기존 PSI 프로젝트 선택)');
    console.log('2. APIs & Services → Library → "Web Search Indexing API" 활성화');
    console.log('3. APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID');
    console.log('   Application type: Desktop app');
    console.log('4. 다운로드한 JSON에서 client_id, client_secret을 .env에 추가:');
    console.log('   GOOGLE_CLIENT_ID=...');
    console.log('   GOOGLE_CLIENT_SECRET=...');
    console.log('5. OAuth 동의 화면에서 테스트 사용자에 본인 Google 계정 추가');
    console.log('6. Search Console에서 해당 계정에 소유자 권한 확인');
    console.log('\n💡 GSC 상태 확인(/gsc-inspect)도 함께 쓰려면:');
    console.log('   - APIs & Services Library → "Google Search Console API" 추가 활성화');
    console.log('   - 이 파일(script/index-submit.mjs) 상단 INDEXING_SCOPE 주석 참조');
    console.log('\n설정 후 다시 실행: node --env-file=.env script/index-submit.mjs setup');
    return;
  }

  if (existsSync(TOKEN_PATH)) {
    const token = JSON.parse(await readFile(TOKEN_PATH, 'utf-8'));
    if (token.refresh_token) {
      console.log('✓ Google OAuth2 토큰 이미 저장됨');
      printAmplifyGuide(token.refresh_token);
      return;
    }
  }

  await fetchAndSaveToken();
}

function printAmplifyGuide(refreshToken) {
  console.log('\n--- Amplify 자동 색인 설정 ---');
  console.log('Amplify Console → 앱 → 환경 변수에 아래 값들을 추가하세요:');
  console.log(`  INDEXNOW_KEY       = ${INDEXNOW_KEY ?? '(로컬 .env 값 복사)'}`);
  console.log(`  GOOGLE_CLIENT_ID   = ${CLIENT_ID}`);
  console.log(`  GOOGLE_CLIENT_SECRET = ${CLIENT_SECRET}`);
  console.log(`  GOOGLE_REFRESH_TOKEN = ${refreshToken}`);
  console.log('-------------------------------');
}

// --- Google OAuth2 ---

async function fetchAndSaveToken() {
  await mkdir(CREDENTIALS_DIR, { recursive: true });

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: INDEXING_SCOPE,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
  });
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;

  console.log('\n브라우저에서 Google 계정으로 인증하세요:');
  console.log(authUrl);

  const openCmd = process.platform === 'win32' ? `start "${authUrl}"` : `open "${authUrl}"`;
  exec(openCmd);

  const code = await waitForOAuthCode();
  const tokens = await exchangeCode(code);

  await writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2), 'utf-8');
  console.log(`✓ 토큰 저장됨: .credentials/gsc-token.json`);

  printAmplifyGuide(tokens.refresh_token);
}

function waitForOAuthCode() {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${OAUTH_PORT}`);
      const code = url.searchParams.get('code');
      if (code) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>인증 완료! 이 탭을 닫아도 됩니다.</h1>');
        server.close();
        resolve(code);
      } else {
        res.writeHead(400);
        res.end('code 파라미터 없음');
        server.close();
        reject(new Error('OAuth code 없음'));
      }
    });
    server.listen(OAUTH_PORT, () => {
      console.log(`\n로컬 OAuth 서버 대기 중 (포트 ${OAUTH_PORT})...`);
    });
    server.on('error', reject);
  });
}

async function exchangeCode(code) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }).toString(),
  });

  if (!res.ok) throw new Error(`토큰 교환 실패: ${await res.text()}`);

  const tokens = await res.json();
  tokens.expiry_date = Date.now() + (tokens.expires_in ?? 3600) * 1000;
  return tokens;
}

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
  // CI 모드: 환경변수에 refresh_token이 있으면 파일 없이 직접 갱신
  if (REFRESH_TOKEN_ENV) {
    return await refreshAccessToken(REFRESH_TOKEN_ENV);
  }

  // 로컬 모드: .credentials/gsc-token.json 사용
  if (!existsSync(TOKEN_PATH)) {
    throw new Error('Google 토큰 없음. 먼저 setup을 실행하세요.');
  }

  const tokens = JSON.parse(await readFile(TOKEN_PATH, 'utf-8'));

  // 만료 5분 전이면 갱신
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

// --- IndexNow ---

async function submitIndexNow(urls) {
  if (!INDEXNOW_KEY) {
    console.log('⚠ INDEXNOW_KEY 없음 — IndexNow 건너뜀 (setup 실행 필요)');
    return;
  }

  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: SITE_HOST,
      key: INDEXNOW_KEY,
      keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
      urlList: urls,
    }),
  });

  if (res.status === 200 || res.status === 202) {
    console.log(`✓ IndexNow: ${urls.length}개 URL 제출 완료 (HTTP ${res.status})`);
    console.log('  → 네이버·Bing·Yandex 동시 전달됨');
  } else {
    console.log(`✗ IndexNow: HTTP ${res.status} — ${await res.text()}`);
  }
}

// --- Google Indexing API ---

async function submitGoogle(urls) {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.log('⚠ Google OAuth 설정 없음 — Google 색인 건너뜀 (setup 실행 필요)');
    return;
  }

  let accessToken;
  try {
    accessToken = await getAccessToken();
  } catch (e) {
    console.log(`⚠ Google 토큰 오류: ${e.message}`);
    return;
  }

  let ok = 0;
  let fail = 0;
  for (const url of urls) {
    const res = await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url, type: 'URL_UPDATED' }),
    });

    if (res.ok) {
      ok++;
    } else {
      const body = await res.text();
      console.log(`  ✗ Google: ${url} → HTTP ${res.status} ${body}`);
      fail++;
    }

    // Google Indexing API: 분당 200개 제한
    if (urls.length > 1) await sleep(300);
  }

  console.log(`✓ Google Indexing API: ${ok}개 성공, ${fail}개 실패`);
}

// --- sitemap-diff (Amplify CI용) ---

function parseSitemap(xml) {
  return [...xml.matchAll(/<url>[\s\S]*?<\/url>/g)].reduce((map, m) => {
    const loc = m[0].match(/<loc>(https?:\/\/[^<]+)<\/loc>/)?.[1];
    const lastmod = m[0].match(/<lastmod>([^<]+)<\/lastmod>/)?.[1] ?? '';
    if (loc) map.set(loc, lastmod);
    return map;
  }, new Map());
}

function diffSitemaps(prevXml, newXml) {
  const prevMap = parseSitemap(prevXml);
  const newMap = parseSitemap(newXml);

  const added = [];
  const updated = [];
  for (const [loc, lastmod] of newMap) {
    if (!prevMap.has(loc)) {
      added.push(loc);
    } else if (prevMap.get(loc) !== lastmod) {
      updated.push(loc);
    }
  }
  return { added, updated };
}

async function runSitemapDiff() {
  let newXml;
  try {
    newXml = await readFile(NEW_SITEMAP_PATH, 'utf-8');
  } catch {
    console.log('dist/sitemap-0.xml 없음 — 건너뜀 (빌드 완료 후 실행해야 합니다)');
    return;
  }

  const newMap = parseSitemap(newXml);
  let added;
  let updated;

  if (!existsSync(PREV_SITEMAP_PATH)) {
    // 최초 배포: 전부 신규로 간주하되, Google API 한도(200/day) 보호 위해 IndexNow만 사용
    console.log('이전 sitemap 없음 — 최초 배포로 간주');
    console.log('  → IndexNow에만 전체 제출 (Google API 한도 보호)');
    added = [];
    updated = [...newMap.keys()];
  } else {
    const prevXml = await readFile(PREV_SITEMAP_PATH, 'utf-8');
    ({ added, updated } = diffSitemaps(prevXml, newXml));
    console.log(
      `변경된 URL: 신규 ${added.length}개 / 업데이트 ${updated.length}개 / 전체 ${newMap.size}개`,
    );
  }

  // 다음 빌드 비교용으로 현재 sitemap 저장 (.astro/ = Amplify 캐시에 포함됨)
  await copyFile(NEW_SITEMAP_PATH, PREV_SITEMAP_PATH);
  console.log(`prev-sitemap.xml 저장 완료`);

  const allChanged = [...added, ...updated];
  if (allChanged.length === 0) {
    console.log('변경된 URL 없음 — 색인 요청 건너뜀');
    return;
  }

  // IndexNow는 신규+업데이트 모두 전달 (한도 없음)
  // Google Indexing API는 신규만 — 일일 한도 200 보호 + 일반 페이지 URL_UPDATED 효과 거의 없음
  await submitIndexNow(allChanged);
  if (added.length > 0) {
    await submitGoogle(added);
  } else {
    console.log('Google Indexing API: 신규 URL 없음 — 호출 건너뜀');
  }
}

// --- sitemap 전체 (수동용) ---

async function runSitemap() {
  const sitemapUrl = `${SITE_URL}/sitemap-0.xml`;
  console.log(`sitemap 가져오는 중: ${sitemapUrl}`);

  let xml;
  try {
    const res = await fetch(sitemapUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    xml = await res.text();
  } catch (e) {
    console.error(`sitemap 가져오기 실패: ${e.message}`);
    console.error('배포된 사이트가 접근 가능한지 확인하세요.');
    process.exit(1);
  }

  const urls = [...parseSitemap(xml).keys()];
  if (urls.length === 0) {
    console.error('sitemap에서 URL을 찾을 수 없습니다.');
    process.exit(1);
  }

  console.log(`총 ${urls.length}개 URL 발견`);
  await runSubmit(urls);
}

// --- 제출 공통 ---

async function runSubmit(urls) {
  console.log(`\n제출 대상: ${urls.length}개`);
  if (urls.length <= 10) urls.forEach((u) => console.log(`  - ${u}`));

  await Promise.all([submitIndexNow(urls), submitGoogle(urls)]);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function printUsage() {
  console.log(`
사용법:
  node --env-file=.env script/index-submit.mjs setup           첫 실행: IndexNow 키 생성 + GCP OAuth 설정
  node --env-file=.env script/index-submit.mjs <URL>           특정 URL 제출
  node --env-file=.env script/index-submit.mjs sitemap         sitemap.xml 전체 URL 제출
  node script/index-submit.mjs sitemap-diff                    변경된 URL만 제출 (Amplify CI용)

필요한 환경변수 (.env / Amplify Console):
  INDEXNOW_KEY            IndexNow 키 (setup으로 자동 생성)
  GOOGLE_CLIENT_ID        GCP OAuth2 클라이언트 ID
  GOOGLE_CLIENT_SECRET    GCP OAuth2 클라이언트 Secret
  GOOGLE_REFRESH_TOKEN    CI용 갱신 토큰 (setup 완료 후 출력되는 값)
`);
}
