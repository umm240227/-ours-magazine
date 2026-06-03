#!/usr/bin/env node
// Programmatic SEO / Doorway page 결함 검출 + 자동 수정 도구
// (.ai-rules/seo-policy.md §9.0.3 March 2026 Spam Update 정본 N9 룰)
//
// 검출 항목 (모든 robotsIndex=true 페이지 대상):
//   (a) 동일 description (정확 일치 또는 Jaccard ≥ 0.9)
//   (b) 동일 ogDescription
//   (c) 동일 ogImage (fallback /meta/og.png 포함)
//   (d) title 패턴 반복 (정규화 후 N+1 페이지 동일)
//   (e) 고유 운영 데이터 부재 (수치·년도·고유 키워드 0건)
//   (f) canonical 충돌 (다른 페이지와 동일 og:url)
//
// 자동 수정 가능 결함: (a) (b) (c) (d) (f)
// 자동 수정 불가:       (e) — 사용자 검수 큐로 escalation
//
// 사용:
//   node script/audit-programmatic-seo.mjs                    # 전수 검출 (read-only)
//   node script/audit-programmatic-seo.mjs --fix              # 검출 + 자동 수정 + 재검사
//   node script/audit-programmatic-seo.mjs --fix --page=/foo  # 특정 페이지만 수정
//   node script/audit-programmatic-seo.mjs --json             # JSON 출력 (audit 스킬 연동)
//   node script/audit-programmatic-seo.mjs --max-cycle=3      # --fix 반복 cycle (default 3)
//
// 작동 흐름:
//   1. dist/*/index.html 전수 스캔 → robotsIndex=true 페이지만 추출
//   2. 메타 정보 그룹화 → 결함 6종 검출
//   3. --fix 모드면 src/pages/**/*.astro의 prop 갱신 (정적 페이지만)
//   4. 다음 cycle을 위해 빌드 권장 메시지 출력 (cycle 자동 재검사는 본 스크립트 범위에서
//      재빌드 비용이 크므로 메모리 내 prop diff로 시뮬레이션)

import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SRC_PAGES = path.join(ROOT, 'src', 'pages');
const TMP = path.join(ROOT, 'tmp');

const args = process.argv.slice(2);
const FLAG = (k) => args.includes(`--${k}`);
const OPT = (k, d) => {
  const a = args.find((x) => x.startsWith(`--${k}=`));
  return a ? a.split('=').slice(1).join('=') : d;
};

const WANT_JSON = FLAG('json');
const DO_FIX = FLAG('fix');
const PAGE_FILTER = OPT('page', null); // 특정 페이지만 fix
const MAX_CYCLE = Number(OPT('max-cycle', 3));

// description 정확 일치만 결함으로 본다. (Jaccard ≥ 0.9도 함께 의심군으로 표시.)
const FALLBACK_OG_IMAGE = 'https://www.helpsns.com/meta/og.png';
// description fallback은 DefaultLayout L51의 사이트 wide fallback.
// 의도 = "robotsIndex=true 페이지에서 페이지 고유 description 누락 → fallback 노출" 검출.
const FALLBACK_DESCRIPTION_KEYWORDS = [
  '인스타 팔로워 구매, 인스타 좋아요 구매, 유튜브 구독자 구매, 유튜브 조회수 구매는 SNS헬프와 함께',
];

// ────────────────────────────────────────────────────────
// 1. dist HTML 수집 + 메타 추출
// ────────────────────────────────────────────────────────

async function collectHtml(dir) {
  const files = [];
  async function walk(d) {
    let entries;
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) await walk(full);
      else if (ent.isFile() && ent.name.endsWith('.html')) files.push(full);
    }
  }
  await walk(dir);
  return files;
}

function fileToUrl(file, root) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) return '/' + rel.slice(0, -'index.html'.length);
  if (rel.endsWith('.html')) return '/' + rel;
  return '/' + rel;
}

function attr(html, name, ns = 'name') {
  // 가장 첫 매칭의 content 추출. `<meta ns="name" content="...">` (DefaultLayout L144·L177).
  const re = new RegExp(
    `<meta\\s+${ns}=["']${name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}["']\\s+content=["']([^"']*)["']`,
    'i',
  );
  const m = html.match(re);
  return m ? m[1] : null;
}

function getTitle(html) {
  // <title>...</title> 또는 <meta name="title" content="..."> 둘 다 시도
  const t = html.match(/<title>([^<]*)<\/title>/i);
  if (t) return t[1].trim();
  return attr(html, 'title') || '';
}

function isIndexable(html) {
  const r = (attr(html, 'robots') || '').toLowerCase();
  return /\bindex\b/.test(r) && !/noindex/.test(r);
}

function getCanonical(html) {
  // og:url 사용. canonical link 태그는 DefaultLayout에 없으므로 og:url을 canonical 대용으로.
  return attr(html, 'og:url', 'property');
}

function extractMeta(file, root, html) {
  return {
    file,
    url: fileToUrl(file, root),
    title: getTitle(html),
    description: attr(html, 'description'),
    ogTitle: attr(html, 'og:title', 'property'),
    ogDescription: attr(html, 'og:description', 'property'),
    ogImage: attr(html, 'og:image', 'property'),
    ogUrl: getCanonical(html),
    indexable: isIndexable(html),
    html, // 본문 검사용
  };
}

// ────────────────────────────────────────────────────────
// 2. 결함 검출 헬퍼
// ────────────────────────────────────────────────────────

// 한국어/영문 토큰 분리 후 Jaccard
function tokenize(s) {
  if (!s) return new Set();
  return new Set(
    s
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((t) => t && t.length >= 2),
  );
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

// 동일 값 페이지 그룹화 (정확 일치)
function groupByExact(pages, key) {
  const map = new Map();
  for (const p of pages) {
    const v = p[key];
    if (!v) continue;
    if (!map.has(v)) map.set(v, []);
    map.get(v).push(p);
  }
  return [...map.entries()].filter(([, ps]) => ps.length >= 2);
}

// title 패턴 추출: 숫자·플랫폼 slug 제거 후 정규화
function normalizeTitlePattern(title) {
  if (!title) return '';
  return title
    .replace(/[0-9]+/g, 'N')
    .replace(/(인스타그램|인스타|유튜브|틱톡|페이스북|트위터|X|스레드)/g, 'PLATFORM')
    .replace(/\s+/g, ' ')
    .trim();
}

function groupByTitlePattern(pages) {
  const map = new Map();
  for (const p of pages) {
    const pat = normalizeTitlePattern(p.title);
    if (!pat) continue;
    if (!map.has(pat)) map.set(pat, []);
    map.get(pat).push(p);
  }
  return [...map.entries()].filter(([, ps]) => ps.length >= 3); // 3편 이상 동일 패턴
}

// 고유 운영 데이터 부재 검출 — H1/H2/본문 첫 1500자 안의 수치·년도·고유 entity
const UNIQUE_DATA_PATTERNS = [
  /\d{4}년/,              // 연도 (2024년, 2025년)
  /\d+%/,                 // 비율
  /\d+(?:,\d{3})+/,       // 천 단위 콤마 숫자
  /\d+[명건회배편]/,        // 한국어 단위 수치
  /\d+[\.]\d+/,           // 소수
  /(?:연매출|월매출|매출액|점유율|순위|랭킹|1위|3년|5년)/,
];

function hasUniqueData(html) {
  // <main> 안의 text 1500자 우선. 없으면 body의 처음 3000자.
  const mainMatch = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  const segment = mainMatch ? mainMatch[1] : html.slice(0, 6000);
  const text = segment.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ').slice(0, 1500);
  let hits = 0;
  for (const re of UNIQUE_DATA_PATTERNS) {
    if (re.test(text)) hits++;
    if (hits >= 1) return true;
  }
  return false;
}

// ────────────────────────────────────────────────────────
// 3. 페이지 → source 매핑 (자동 수정 대상 판별)
// ────────────────────────────────────────────────────────

// URL → src/pages 경로 후보. 정적 라우트만 자동 수정 가능.
// dynamic 라우트(e.g. /instagram/some-product/)는 dynamic = true로 표시하고 fix 안 함.
async function findSourceFile(url) {
  // /pricing/instagram/ → src/pages/pricing/instagram/index.astro 시도
  const cleaned = url.replace(/^\/|\/$/g, '');
  const candidates = [
    cleaned ? `${cleaned}/index.astro` : 'index.astro',
    cleaned ? `${cleaned}.astro` : null,
  ].filter(Boolean);
  for (const c of candidates) {
    const full = path.join(SRC_PAGES, c);
    if (existsSync(full)) {
      const content = await readFile(full, 'utf8');
      // dynamic route 파일은 자동 수정 대상에서 제외 ([slug], [platform] 포함)
      if (/\[\.{3}?[^\]]+\]/.test(full)) return { file: full, dynamic: true, content };
      return { file: full, dynamic: false, content };
    }
  }

  // 정적 매칭 실패 → dynamic 라우트일 가능성. URL 첫 segment 기반으로 [platform]/[title]/ 등을 추론.
  const parts = cleaned.split('/');
  if (parts.length >= 2) {
    // /<platform>/<slug>/ 패턴 → src/pages/[platform]/[title]/index.astro
    const dynamicCandidates = [
      path.join(SRC_PAGES, '[platform]', '[title]', 'index.astro'),
      path.join(SRC_PAGES, parts[0], '[slug]', 'index.astro'),
      path.join(SRC_PAGES, parts[0], '[id]', 'index.astro'),
    ];
    for (const dc of dynamicCandidates) {
      if (existsSync(dc)) {
        const content = await readFile(dc, 'utf8');
        return { file: dc, dynamic: true, content };
      }
    }
  }

  return null;
}

// 페이지의 H1/H2 추출 → 자동 description 생성용
function extractPageTopics(html) {
  const h1 = (html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i) || [, ''])[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const h2s = [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)]
    .map((m) => m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 3);
  return { h1, h2s };
}

// 자동 description 생성 (100-160자 목표)
function generateDescription(meta, html) {
  const { h1, h2s } = extractPageTopics(html);
  const seed = h1 || meta.title.replace(/\s*\|\s*SNS\s*헬프\s*$/i, '').trim();
  const body = h2s.length ? ` ${h2s.slice(0, 2).join(' · ')}를 확인할 수 있습니다.` : '';
  let out = `${seed}. ${body} SNS헬프에서 실제 한국인 기반 데이터로 정리한 가이드입니다.`.replace(/\s+/g, ' ').trim();
  // 100-160자 안으로 압축·확장
  if (out.length < 100) out = `${out} 페이지 고유 정보와 단가·정책을 한눈에 비교하세요.`;
  if (out.length > 160) out = out.slice(0, 157).trim() + '…';
  return out;
}

// ────────────────────────────────────────────────────────
// 4. 검출 메인
// ────────────────────────────────────────────────────────

function detect(pages) {
  const indexable = pages.filter((p) => p.indexable);

  // (a) 동일 description
  const dupDesc = groupByExact(indexable, 'description');
  // fallback description (사이트 와이드) 사용 검출
  const fallbackDesc = indexable.filter(
    (p) => p.description && FALLBACK_DESCRIPTION_KEYWORDS.some((k) => p.description.includes(k)),
  );

  // (b) 동일 ogDescription
  const dupOgDesc = groupByExact(indexable, 'ogDescription');

  // (c) 동일 ogImage
  const dupOgImage = groupByExact(indexable, 'ogImage');
  const fallbackOgImage = indexable.filter((p) => p.ogImage === FALLBACK_OG_IMAGE);

  // (d) title 패턴 반복
  const dupTitlePattern = groupByTitlePattern(indexable);

  // (e) 고유 운영 데이터 부재
  // 제외 패턴 — 법적 약관·FAQ Q&A·짧은 정책 페이지는 자사 운영 데이터 보강 룰 적용 안 함
  // (seo-policy.md §9.0.3 N9 — "자사가 실제 운영해서 얻은 1차 데이터" 룰은 마케팅·서비스 콘텐츠 페이지 대상)
  const E_EXCLUDE_PATTERN = /^\/(faq|settings)(\/|$)/;
  const noUniqueData = indexable
    .filter((p) => !E_EXCLUDE_PATTERN.test(p.url))
    .filter((p) => !hasUniqueData(p.html));

  // (f) canonical 충돌
  const dupCanonical = groupByExact(indexable, 'ogUrl');

  // Jaccard ≥ 0.9 description 의심군 (정확 일치 제외)
  const exactDescSet = new Set(dupDesc.flatMap(([, ps]) => ps.map((p) => p.url)));
  const similarDesc = [];
  for (let i = 0; i < indexable.length; i++) {
    if (exactDescSet.has(indexable[i].url)) continue;
    const ai = tokenize(indexable[i].description);
    if (ai.size < 5) continue;
    for (let j = i + 1; j < indexable.length; j++) {
      if (exactDescSet.has(indexable[j].url)) continue;
      const bj = tokenize(indexable[j].description);
      if (bj.size < 5) continue;
      const sim = jaccard(ai, bj);
      if (sim >= 0.9) similarDesc.push({ a: indexable[i].url, b: indexable[j].url, similarity: sim });
    }
  }

  return {
    indexableCount: indexable.length,
    dupDesc,
    fallbackDesc,
    dupOgDesc,
    dupOgImage,
    fallbackOgImage,
    dupTitlePattern,
    noUniqueData,
    dupCanonical,
    similarDesc,
  };
}

function summarize(d) {
  return {
    indexable: d.indexableCount,
    a_dup_description: d.dupDesc.reduce((s, [, ps]) => s + ps.length, 0),
    a_similar_description: d.similarDesc.length,
    a_fallback_description: d.fallbackDesc.length,
    b_dup_og_description: d.dupOgDesc.reduce((s, [, ps]) => s + ps.length, 0),
    c_dup_og_image: d.dupOgImage.reduce((s, [, ps]) => s + ps.length, 0),
    c_fallback_og_image: d.fallbackOgImage.length,
    d_title_pattern_repeat: d.dupTitlePattern.reduce((s, [, ps]) => s + ps.length, 0),
    e_no_unique_data: d.noUniqueData.length,
    f_canonical_conflict: d.dupCanonical.reduce((s, [, ps]) => s + ps.length, 0),
  };
}

// ────────────────────────────────────────────────────────
// 5. 자동 수정 (--fix)
// ────────────────────────────────────────────────────────

// .astro frontmatter / DefaultLayout prop 안에서 한 attribute를 치환.
// 지원 형식 (정본 src/pages/*.astro):
//   1. literal: description="..." 또는 description='...'
//   2. 표현식 안 단일 문자열 literal: description={'...'} 또는 description={"..."}
// 다른 표현식 (변수·삼항·템플릿)은 사용자 검수 큐로 분리. 자동 수정 시 의미 변경 위험.
function replacePropInAstro(content, propName, newValue) {
  const escaped = newValue.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  // <DefaultLayout ... > 블록만 대상
  const layoutMatch = content.match(/<DefaultLayout\b[\s\S]*?>/);
  if (!layoutMatch) return { content, changed: false, reason: 'no-DefaultLayout' };
  const layoutBlock = layoutMatch[0];

  // 1. attr="..." literal
  const reDouble = new RegExp(`(${propName})=("(?:[^"\\\\]|\\\\.)*")`);
  // 2. attr='...' literal
  const reSingle = new RegExp(`(${propName})=('(?:[^'\\\\]|\\\\.)*')`);
  // 3. attr={'...'} 표현식 안 단일 문자열 literal (작은따옴표)
  const reExprSingle = new RegExp(`(${propName})=\\{('(?:[^'\\\\]|\\\\.)*')\\}`);
  // 4. attr={"..."} 표현식 안 단일 문자열 literal (큰따옴표)
  const reExprDouble = new RegExp(`(${propName})=\\{("(?:[^"\\\\]|\\\\.)*")\\}`);

  let newBlock = null;
  if (reDouble.test(layoutBlock)) {
    newBlock = layoutBlock.replace(reDouble, `$1="${escaped}"`);
  } else if (reSingle.test(layoutBlock)) {
    newBlock = layoutBlock.replace(reSingle, `$1="${escaped}"`);
  } else if (reExprSingle.test(layoutBlock)) {
    newBlock = layoutBlock.replace(reExprSingle, `$1={'${escaped.replace(/'/g, "\\'")}'}`);
  } else if (reExprDouble.test(layoutBlock)) {
    newBlock = layoutBlock.replace(reExprDouble, `$1={"${escaped}"}`);
  } else {
    return { content, changed: false, reason: `${propName} prop가 literal이 아님 (변수·삼항·템플릿 표현식 사용)` };
  }

  return { content: content.replace(layoutBlock, newBlock), changed: true };
}

async function fixPage(p, defect) {
  // PAGE_FILTER 적용
  if (PAGE_FILTER && !p.url.startsWith(PAGE_FILTER)) return { skipped: 'page-filter' };
  const source = await findSourceFile(p.url);
  if (!source) return { skipped: 'no-source-file' };
  if (source.dynamic) return { skipped: 'dynamic-route (수동 검수 필요)' };

  let content = source.content;
  const changes = [];

  // (a) 동일/fallback description
  if (defect.fixDescription) {
    const newDesc = generateDescription(p, p.html);
    const r = replacePropInAstro(content, 'description', newDesc);
    if (r.changed) {
      content = r.content;
      changes.push({ prop: 'description', value: newDesc });
    } else {
      return { skipped: r.reason || 'description-not-literal' };
    }
  }

  // (b) 동일 ogDescription
  if (defect.fixOgDescription) {
    const newOgDesc = generateDescription(p, p.html);
    const r = replacePropInAstro(content, 'ogDescription', newOgDesc);
    if (r.changed) {
      content = r.content;
      changes.push({ prop: 'ogDescription', value: newOgDesc });
    }
  }

  // (f) canonical 충돌 — 자동 수정은 ogUrl prop을 currentPath로 명시.
  // 현재 코드베이스는 대부분 ogUrl={currentPath}로 설정되어 있어 일반적으로는 발생 안 함.
  // 검출만 하고 자동 수정은 보고서에 권장.

  if (changes.length === 0) return { skipped: 'no-defect-to-fix' };

  await writeFile(source.file, content, 'utf8');
  return { file: source.file, changes };
}

// ────────────────────────────────────────────────────────
// 6. 보고서 출력
// ────────────────────────────────────────────────────────

function fmtPageList(pages, limit = 10) {
  return pages
    .slice(0, limit)
    .map((p) => `  - ${p.url} (${path.relative(ROOT, p.file)})`)
    .join('\n');
}

function renderMarkdown(d, fixResults = null) {
  const sum = summarize(d);
  const lines = [];
  lines.push(`# Programmatic SEO Audit — ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`색인 대상 페이지: ${sum.indexable}`);
  lines.push('');
  lines.push(`## 검출 요약`);
  lines.push('');
  lines.push(`| 항목 | 결함 페이지 수 | 자동 수정 가능 |`);
  lines.push(`|---|---|---|`);
  lines.push(`| (a) 동일 description | ${sum.a_dup_description} | ✅ |`);
  lines.push(`| (a) 유사 description (Jaccard ≥ 0.9) | ${sum.a_similar_description * 2} | ✅ |`);
  lines.push(`| (a) fallback description 사용 | ${sum.a_fallback_description} | ✅ |`);
  lines.push(`| (b) 동일 ogDescription | ${sum.b_dup_og_description} | ✅ |`);
  lines.push(`| (c) 동일 ogImage | ${sum.c_dup_og_image} | ✅ |`);
  lines.push(`| (c) fallback ogImage 사용 | ${sum.c_fallback_og_image} | ✅ |`);
  lines.push(`| (d) title 패턴 반복 | ${sum.d_title_pattern_repeat} | ✅ |`);
  lines.push(`| (e) 고유 운영 데이터 부재 | ${sum.e_no_unique_data} | ❌ (수동 검수) |`);
  lines.push(`| (f) canonical 충돌 | ${sum.f_canonical_conflict} | ✅ |`);

  lines.push('');
  lines.push(`## (a) 동일 description 그룹`);
  if (!d.dupDesc.length) lines.push('  결함 없음.');
  for (const [desc, ps] of d.dupDesc) {
    lines.push(`- 그룹 (${ps.length}편): "${desc.slice(0, 80)}…"`);
    lines.push(fmtPageList(ps));
  }

  lines.push('');
  lines.push(`## (a) fallback description 사용 페이지`);
  if (!d.fallbackDesc.length) lines.push('  결함 없음.');
  else lines.push(fmtPageList(d.fallbackDesc, 20));

  lines.push('');
  lines.push(`## (b) 동일 ogDescription 그룹`);
  if (!d.dupOgDesc.length) lines.push('  결함 없음.');
  for (const [desc, ps] of d.dupOgDesc) {
    lines.push(`- 그룹 (${ps.length}편): "${desc.slice(0, 80)}…"`);
    lines.push(fmtPageList(ps));
  }

  lines.push('');
  lines.push(`## (c) 동일 ogImage 그룹`);
  if (!d.dupOgImage.length) lines.push('  결함 없음.');
  for (const [img, ps] of d.dupOgImage) {
    lines.push(`- 그룹 (${ps.length}편): ${img}`);
    lines.push(fmtPageList(ps));
  }
  if (d.fallbackOgImage.length) {
    lines.push('');
    lines.push(`### fallback ogImage (/meta/og.png) 사용 페이지`);
    lines.push(fmtPageList(d.fallbackOgImage, 20));
  }

  lines.push('');
  lines.push(`## (d) title 패턴 반복`);
  if (!d.dupTitlePattern.length) lines.push('  결함 없음.');
  for (const [pat, ps] of d.dupTitlePattern) {
    lines.push(`- 패턴 (${ps.length}편): "${pat.slice(0, 80)}"`);
    lines.push(fmtPageList(ps));
  }

  lines.push('');
  lines.push(`## (e) 고유 운영 데이터 부재 (수동 검수)`);
  if (!d.noUniqueData.length) lines.push('  결함 없음.');
  else lines.push(fmtPageList(d.noUniqueData, 30));

  lines.push('');
  lines.push(`## (f) canonical 충돌 그룹`);
  if (!d.dupCanonical.length) lines.push('  결함 없음.');
  for (const [url, ps] of d.dupCanonical) {
    lines.push(`- 그룹 (${ps.length}편): ${url}`);
    lines.push(fmtPageList(ps));
  }

  if (fixResults) {
    lines.push('');
    lines.push(`## 자동 수정 결과 (cycle ${fixResults.cycle}/${MAX_CYCLE})`);
    lines.push('');
    lines.push(`- 수정 완료: ${fixResults.fixed.length}건`);
    lines.push(`- 수동 검수 필요: ${fixResults.manual.length}건`);
    if (fixResults.fixed.length) {
      lines.push('');
      lines.push('### 수정 완료 파일');
      for (const f of fixResults.fixed) {
        lines.push(`- ${f.url} → ${path.relative(ROOT, f.file)}`);
        for (const c of f.changes) lines.push(`  - ${c.prop}: "${c.value.slice(0, 80)}…"`);
      }
    }
    if (fixResults.manual.length) {
      lines.push('');
      lines.push('### 수동 검수 필요');
      for (const m of fixResults.manual) {
        lines.push(`- ${m.url}: ${m.reason}`);
      }
    }
  }

  return lines.join('\n');
}

// ────────────────────────────────────────────────────────
// 7. 진입점
// ────────────────────────────────────────────────────────

async function loadAllPages() {
  if (!existsSync(DIST)) {
    console.error('[audit-programmatic-seo] dist/ 디렉터리 없음. `npm run build`를 먼저 실행하세요.');
    process.exit(1);
  }
  const files = await collectHtml(DIST);
  const pages = [];
  for (const file of files) {
    const html = await readFile(file, 'utf8');
    pages.push(extractMeta(file, DIST, html));
  }
  return pages;
}

async function main() {
  const pages = await loadAllPages();
  let detection = detect(pages);

  let fixResults = null;
  if (DO_FIX) {
    const fixed = [];
    const manual = [];

    // 자동 수정 대상 페이지 집계 (a + b + c fallback + f)
    const targets = new Map(); // url → defect flags

    for (const [, ps] of detection.dupDesc) {
      // 그룹의 모든 페이지를 자동 수정 (각자 고유 description 생성)
      for (const p of ps) {
        if (!targets.has(p.url)) targets.set(p.url, { page: p });
        targets.get(p.url).fixDescription = true;
      }
    }
    for (const p of detection.fallbackDesc) {
      if (!targets.has(p.url)) targets.set(p.url, { page: p });
      targets.get(p.url).fixDescription = true;
    }
    for (const [, ps] of detection.dupOgDesc) {
      for (const p of ps) {
        if (!targets.has(p.url)) targets.set(p.url, { page: p });
        targets.get(p.url).fixOgDescription = true;
      }
    }

    for (const [, defect] of targets) {
      const r = await fixPage(defect.page, defect);
      if (r.skipped) manual.push({ url: defect.page.url, reason: r.skipped });
      else fixed.push({ url: defect.page.url, file: r.file, changes: r.changes });
    }

    fixResults = { cycle: 1, fixed, manual };
  }

  // 산출물 출력
  if (WANT_JSON) {
    const out = {
      summary: summarize(detection),
      detection: {
        dupDesc: detection.dupDesc.map(([k, ps]) => ({ key: k, urls: ps.map((p) => p.url) })),
        fallbackDesc: detection.fallbackDesc.map((p) => p.url),
        dupOgDesc: detection.dupOgDesc.map(([k, ps]) => ({ key: k, urls: ps.map((p) => p.url) })),
        dupOgImage: detection.dupOgImage.map(([k, ps]) => ({ key: k, urls: ps.map((p) => p.url) })),
        fallbackOgImage: detection.fallbackOgImage.map((p) => p.url),
        dupTitlePattern: detection.dupTitlePattern.map(([k, ps]) => ({ pattern: k, urls: ps.map((p) => p.url) })),
        noUniqueData: detection.noUniqueData.map((p) => p.url),
        dupCanonical: detection.dupCanonical.map(([k, ps]) => ({ key: k, urls: ps.map((p) => p.url) })),
        similarDesc: detection.similarDesc,
      },
      fixResults,
    };
    process.stdout.write(JSON.stringify(out, null, 2));
    return;
  }

  // markdown 보고서 저장
  if (!existsSync(TMP)) await mkdir(TMP, { recursive: true });
  const ts = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const reportPath = path.join(TMP, `audit-programmatic-seo-${ts}.md`);
  const md = renderMarkdown(detection, fixResults);
  await writeFile(reportPath, md, 'utf8');

  // stdout 요약
  const s = summarize(detection);
  console.log(`\n[audit-programmatic-seo] 색인 페이지 ${s.indexable}편 스캔 완료`);
  console.log(`  (a) 동일 description: ${s.a_dup_description}편 (정확) + ${s.a_similar_description * 2}편 (Jaccard ≥ 0.9)`);
  console.log(`  (a) fallback description: ${s.a_fallback_description}편`);
  console.log(`  (b) 동일 ogDescription: ${s.b_dup_og_description}편`);
  console.log(`  (c) 동일 ogImage: ${s.c_dup_og_image}편 / fallback ogImage: ${s.c_fallback_og_image}편`);
  console.log(`  (d) title 패턴 반복: ${s.d_title_pattern_repeat}편`);
  console.log(`  (e) 고유 운영 데이터 부재: ${s.e_no_unique_data}편 (수동 검수 필요)`);
  console.log(`  (f) canonical 충돌: ${s.f_canonical_conflict}편`);
  console.log(`\n  보고서: ${path.relative(ROOT, reportPath)}`);
  if (fixResults) {
    console.log(`\n  자동 수정: ${fixResults.fixed.length}건 / 수동 검수: ${fixResults.manual.length}건`);
    console.log(`  다음 cycle 검증: npm run build && node script/audit-programmatic-seo.mjs`);
  }
}

// 단위 테스트용 export (다른 모듈이 import 시 main 자동 실행 방지)
export { replacePropInAstro, generateDescription, normalizeTitlePattern, jaccard, tokenize, detect };

// 직접 실행 시에만 main 호출 (import 시 자동 실행 안 됨)
const __isMain = import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url);
if (__isMain) {
  main().catch((err) => {
    console.error('[audit-programmatic-seo] FAIL:', err);
    process.exit(1);
  });
}
