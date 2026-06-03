#!/usr/bin/env node
// JP 발행 글 본문 이미지 전수 audit (GFM 마크다운 기준).
// 정본: .ai-rules/jp-site-config.md §2(경로)·§3(본문=순수 GFM)·§4(frontmatter)·§6(이미지)·§11(YAML frontmatter).
//
// KR(snshelp-astro) 원본은 WordPress/Gutenberg HTML(`<figure class="wp-block-image">`·
// `<img width=.. height=..>`·`<figcaption>`·`wp-image-NNNN`)·S3(`assets.helpsns.com`)·
// `/saved-images/` codex 일러스트·n8n 레거시 식별자·JSON frontmatter를 가정했다.
// JP는 본문이 순수 GFM(`![alt](path)`)이고 frontmatter는 YAML(gray-matter)이며 이미지는
// `/images/articles/<slug>/` 로컬 경로(또는 Vercel prod URL)이다. → KR 전용 신호를 JP 등가
// 결함으로 교체하되, 23개 결함 카테고리 골격은 보존한다(보고서 스키마 호환).
//
// usage:
//   node script/audit-body-images.mjs                                   # 전수
//   node script/audit-body-images.mjs --all                             # 전수(명시)
//   node script/audit-body-images.mjs --post=post-instagram-algorithm   # 단일 slug
//   node script/audit-body-images.mjs --mismatch-only --dry-run [--post=<slug>] [--json] [--out=tmp/...]
//
// flags:
//   --all            전수 (기본 동작과 동일, 명시용)
//   --post=<slug>    특정 slug만 검사 (JP는 숫자 id 아님 → slug 기준, §2)
//   --mismatch-only  내부경로 mismatch만 출력
//   --dry-run        외부 HTTP HEAD/SIZE 호출 skip, 보고서만 생성 (자동 수정 안 함)
//   --json           stdout으로 JSON 출력
//   --out=PATH       지정 경로에 JSON 저장 (기본: tmp/audit-body-images-raw-{TS}.json)

import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import matter from 'gray-matter';
// 경로는 jp-paths에서만 import (하드코딩 금지, §2·§12).
import { ROOT, POSTS_DIR, postFile, listSlugs } from './lib/jp-paths.mjs';

// JP 내부 이미지 경로 정본 (§2·§4): /images/articles/<slug>/...
const INTERNAL_IMG_PREFIX = '/images/articles/';
// JP 검증 타깃(prod 실물): Vercel preview/prod (§6). KR assets.helpsns.com 대체.
const PROD_HOSTS = ['www.ours-magazine.jp', 'ours-magazine.jp', 'ours-magazine.vercel.app'];
// 의도적 placeholder(더미) 호스트는 외부 hotlink/non-webp 검사에서 제외.
const PLACEHOLDER_RE = /picsum\.photos|placeholder|example\.com|dummyimage/i;

// === CLI 인자 파싱 ===
const argv = process.argv.slice(2);
const FLAGS = {
  all: argv.includes('--all'),
  mismatchOnly: argv.includes('--mismatch-only'),
  dryRun: argv.includes('--dry-run'),
  json: argv.includes('--json'),
  post: argv.find((a) => a.startsWith('--post='))?.split('=')[1] || null,
  out: null,
};
for (const a of argv) {
  if (a.startsWith('--out=')) FLAGS.out = a.slice('--out='.length);
}

// === slug 목록 (readdir 가드: listSlugs가 POSTS_DIR 부재 시 [] + 경고, 크래시 금지) ===
let slugs;
try {
  slugs = listSlugs(POSTS_DIR).filter((s) => !FLAGS.post || s === FLAGS.post);
} catch (err) {
  console.error(`[audit-body-images] 기사 디렉터리 읽기 실패: ${err.message} — 빈 결과로 종료`);
  slugs = [];
}

// 빈 경로에서 조용히 통과시키지 않는다 (가드 + 경고).
if (slugs.length === 0) {
  if (FLAGS.post) {
    console.error(`[audit-body-images] slug "${FLAGS.post}" 에 해당하는 발행본이 없습니다 (${path.relative(ROOT, POSTS_DIR)}).`);
  } else {
    console.error(`[audit-body-images] 검사 대상 글 0건 — ${path.relative(ROOT, POSTS_DIR)} 가 비었거나 부재 (false-pass 방지 경고).`);
  }
}

const allImages = []; // { slug, src, alt, hasAlt, isInternal, isExternal, isPlaceholder, position, ... }
const postStats = []; // { slug, title, bodyImgCount, heroImage }
const postMetas = new Map(); // slug → frontmatter meta
const postBodies = new Map(); // slug → body string
const postImages = new Map(); // slug → 본문 이미지 배열

for (const slug of slugs) {
  let raw;
  try {
    raw = readFileSync(postFile(slug), 'utf-8');
  } catch (err) {
    console.error(`[audit-body-images] ${slug}: 파일 읽기 실패 — ${err.message}`);
    continue;
  }

  // YAML frontmatter(gray-matter) + GFM 본문 분리 (§11). JSON.parse 폐기.
  let meta = {};
  let body = raw;
  try {
    const parsed = matter(raw);
    meta = parsed.data || {};
    body = parsed.content || '';
  } catch (err) {
    console.error(`[audit-body-images] ${slug}: YAML frontmatter 파싱 실패 — ${err.message}`);
    continue;
  }

  postMetas.set(slug, meta);

  // === 본문 이미지 추출 (GFM화): ![alt](src) ===
  // KR Gutenberg <figure>/<img>/<figcaption>은 JP 본문에 부재(§3) → 마크다운 이미지만 수집.
  // 만약 KR 잔여 Gutenberg <img>가 본문에 남아 있으면 별도 결함(legacyGutenberg)으로 검출.
  const imgs = [];
  const imgRe = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let m;
  while ((m = imgRe.exec(body)) !== null) {
    const alt = m[1];
    const src = m[2].trim();
    const altStripped = alt.trim();

    const isExternal = /^https?:\/\//i.test(src);
    const isPlaceholder = PLACEHOLDER_RE.test(src);
    const isInternal = src.startsWith(INTERNAL_IMG_PREFIX);
    let host = null;
    if (isExternal) {
      try { host = new URL(src).host; } catch {}
    }

    imgs.push({
      slug,
      src,
      alt: altStripped,
      hasAltAttr: altStripped.length > 0,
      isExternal,
      isPlaceholder,
      isInternal,
      host,
      position: m.index,
    });
  }

  // KR 잔여 Gutenberg <img> / <figure> 태그 검출 (JP에선 결함 — §3 금지)
  const legacyGutenbergCount =
    (body.match(/<img\b/gi) || []).length + (body.match(/<figure\b/gi) || []).length;

  // hero(featured)는 본문에 넣지 않음 — frontmatter image:로만 (§3·§26)
  const heroImage = typeof meta.image === 'string' ? meta.image : null;

  postStats.push({
    slug,
    title: meta.title || null,
    bodyImgCount: imgs.length,
    heroImage,
    legacyGutenbergCount,
  });

  postBodies.set(slug, body);
  postImages.set(slug, imgs);
  for (const img of imgs) allImages.push(img);
}

if (!FLAGS.json) {
  console.log(`총 발행 글: ${postStats.length}`);
  console.log(`총 본문 이미지: ${allImages.length}`);
}

// === _image_exempt 헬퍼 (frontmatter YAML 마커): src endsWith filename 또는 정확 매칭 ===
function isExemptImage(img) {
  const meta = postMetas.get(img.slug);
  const exempt = meta?._image_exempt;
  if (!exempt) return false;
  const list = Array.isArray(exempt) ? exempt : [exempt];
  return list.some((entry) => {
    if (typeof entry !== 'string') return false;
    if (img.src === entry) return true;
    if (img.src.endsWith(entry)) return true;
    const base = entry.split('/').pop();
    if (base && img.src.endsWith('/' + base)) return true;
    if (base && img.src.endsWith(base)) return true;
    return false;
  });
}

// === 결함 검출 (23개 카테고리 골격 보존, KR→JP 등가 교체) ===
const findings = {
  missingAlt: [],                // alt 부재 또는 빈 alt ![](src)
  genericAlt: [],                // alt가 slug/generic 패턴
  legacyGutenberg: [],           // [JP] KR Gutenberg <figure>/<img> 잔여 (§3 금지) ← KR nestedFigure 대체
  missingDimensions: [],         // [JP] GFM엔 width/height 없음 → 항상 N/A(0). 카테고리 보존.
  nonWebp: [],                   // 내부 이미지 확장자 PNG/JPG (§6 webp 권장)
  hotlinkExternal: [],           // [JP] 외부 hotlink (prod host·placeholder 외) ← KR assets.helpsns.com 대체
  noBodyImage: [],               // body images = 0
  subWidth1200: [],              // [JP] GFM 본문엔 width 속성 없음 → N/A(0). 카테고리 보존.
  aiIllustration: [],            // [JP] codex 일러스트 경로 제거(§6) → /saved-images/·codex 잔여 검출
  internalPathMismatch: [],      // [JP] 내부 이미지가 /images/articles/ 규약 밖 ← KR figcaptionMismatch 대체
  belowMinImgCount: [],          // hero+본문 < 3 (§6)
  legacyIdentifier: [],          // [JP] n8n/wp-content/snshelp/naver 등 KR·레거시 식별자 0건 검증
  placeholderAlt: [],            // alt가 placeholder("본문 인포그래픽" 등) generic
  missingFigcaption: [],         // [JP] GFM엔 figcaption 없음 → N/A(0). 카테고리 보존.
  duplicateSrcInPost: [],        // 한 글 안 src 중복
  duplicateAltInPost: [],        // [JP] 한 글 안 alt ≥10자 동일 ← KR duplicateFigcaption 대체
  altJaccardHigh: [],            // 한 글 안 alt 자카드 ≥ 0.8 쌍
  adjacentImagesClose: [],       // 인접 이미지 본문 텍스트 < 100자 ← KR adjacentFigures 대체
  topClusterImages: [],          // body 시작 500자 안 이미지 ≥ 2개 ← KR topClusterFigures 대체
  shortAlt: [],                  // alt < 15자
  longAlt: [],                   // [JP] alt > 80자 (§audit-post-html alt-length 상한)
  placeholderSrc: [],            // [JP] picsum/placeholder 더미 이미지 잔존 (발행본엔 실물 권장)
  brokenInternalFile: [],        // [JP] 내부 이미지 public/ 파일 부재 ← KR brokenUrls 일부 대체
};

for (const img of allImages) {
  const alt = img.alt;
  // 1) missingAlt / genericAlt
  if (!img.hasAltAttr) {
    findings.missingAlt.push(img);
  } else if (/^(画像|イメージ|infographic|インフォグラフィック|チャート|chart|図)$/i.test(alt)) {
    findings.genericAlt.push({ ...img, reason: 'generic-keyword' });
  } else if (img.slug && alt.toLowerCase() === img.slug.toLowerCase()) {
    findings.genericAlt.push({ ...img, reason: 'alt=slug' });
  }

  // 2) shortAlt / longAlt (15-80자 범위, missingAlt는 별도)
  if (img.hasAltAttr) {
    if (alt.length < 15) findings.shortAlt.push(img);
    else if (alt.length > 80) findings.longAlt.push(img);
  }

  // 3) nonWebp — 내부 이미지 확장자 검사 (placeholder/외부 제외)
  if (!img.isPlaceholder) {
    const url = img.src.split('?')[0];
    if (/\.(png|jpg|jpeg)$/i.test(url)) findings.nonWebp.push(img);
  }

  // 4) hotlinkExternal — prod host·placeholder 외 외부 hotlink (§6 prod 타깃)
  if (img.isExternal && !img.isPlaceholder && img.host && !PROD_HOSTS.includes(img.host)) {
    findings.hotlinkExternal.push({ ...img, host: img.host });
  }

  // 5) placeholderSrc — 발행본에 picsum 등 더미 이미지 잔존
  if (img.isPlaceholder) findings.placeholderSrc.push(img);

  // 6) internalPathMismatch — 외부도 아니고 placeholder도 아닌데 /images/articles/ 규약 밖
  if (!img.isExternal && !img.isPlaceholder && !img.isInternal) {
    findings.internalPathMismatch.push({
      ...img,
      reason: `내부 이미지 경로가 ${INTERNAL_IMG_PREFIX}<slug>/ 규약 밖`,
    });
  }

  // 7) aiIllustration — codex/saved-images 잔여 경로 (§6 codex 일러스트 경로 제거)
  if (/\/saved-images\/|codex/i.test(img.src)) {
    findings.aiIllustration.push({ ...img, reason: 'codex/saved-images 잔여 경로(§6 제거 대상)' });
  }

  // 8) placeholderAlt — generic placeholder alt
  if (img.hasAltAttr) {
    const PLACEHOLDER_ALT = [
      /本文\s*インフォグラフィック\s*$/,
      /(主要|核心|重要)\s*(な)?\s*(視覚化|ビジュアル)\s*$/,
      /(메인|본문)\s*(인포그래픽|시각화)\s*$/,
    ];
    if (PLACEHOLDER_ALT.some((re) => re.test(alt))) {
      findings.placeholderAlt.push({ ...img, reason: 'placeholder-alt' });
    }
  }
}

// === per-post 통계 기반 결함 ===
for (const ps of postStats) {
  if (ps.bodyImgCount === 0) findings.noBodyImage.push(ps);
  if (ps.legacyGutenbergCount > 0) {
    findings.legacyGutenberg.push({
      slug: ps.slug,
      count: ps.legacyGutenbergCount,
      reason: 'KR Gutenberg <figure>/<img> 잔여 — 순수 GFM 위반(§3)',
    });
  }
  // hero(frontmatter image) 1 + 본문 이미지 합 < 3 (§6)
  ps.totalImgCount = (ps.heroImage ? 1 : 0) + ps.bodyImgCount;
  if (ps.totalImgCount < 3) findings.belowMinImgCount.push(ps);
}

// === legacyIdentifier — KR·레거시 식별자 0건 검증 (§6 Naver 제거·§2 경로 매핑) ===
// alt, src에 n8n / wp-content / snshelp / naver / s3 / cloudfront 등 단어 검출.
const LEGACY_PATTERNS = [
  /\bn8n\b/i,
  /wp-content/i,
  /snshelp/i,
  /helpsns/i,
  /\bnaver\b/i,
  /cloudfront/i,
  /amazonaws/i,
];
for (const img of allImages) {
  if (isExemptImage(img)) continue;
  const blob = `${img.src}\n${img.alt || ''}`;
  if (LEGACY_PATTERNS.some((re) => re.test(blob))) {
    findings.legacyIdentifier.push({
      slug: img.slug,
      src: img.src,
      alt: img.alt,
      reason: 'KR/레거시 식별자(n8n·wp-content·snshelp·naver·s3·cloudfront) 매칭',
    });
  }
}

// === duplicateSrcInPost — 한 글 안 src 중복 (placeholder 제외) ===
for (const [slug, imgs] of postImages.entries()) {
  const srcCount = new Map();
  for (const f of imgs) {
    if (!f.src || f.isPlaceholder) continue;
    srcCount.set(f.src, (srcCount.get(f.src) || 0) + 1);
  }
  for (const [src, n] of srcCount.entries()) {
    if (n >= 2) findings.duplicateSrcInPost.push({ slug, src, count: n });
  }
}

// === duplicateAltInPost — 한 글 안 alt ≥10자 동일 (KR duplicateFigcaption 대체) ===
for (const [slug, imgs] of postImages.entries()) {
  const altCount = new Map();
  for (const f of imgs) {
    if (!f.alt || f.alt.length < 10) continue;
    altCount.set(f.alt, (altCount.get(f.alt) || 0) + 1);
  }
  for (const [alt, n] of altCount.entries()) {
    if (n >= 2) findings.duplicateAltInPost.push({ slug, alt: alt.slice(0, 120), count: n });
  }
}

// === altJaccardHigh — 한 글 안 alt 자카드 ≥ 0.8 쌍 ===
function tokenizeAlt(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}
function jaccardSim(a, b) {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}
for (const [slug, imgs] of postImages.entries()) {
  const altObjs = imgs
    .filter((f) => f.alt && f.alt.length >= 10)
    .map((f) => ({ alt: f.alt, src: f.src, tokens: new Set(tokenizeAlt(f.alt)) }));
  for (let i = 0; i < altObjs.length; i++) {
    for (let j = i + 1; j < altObjs.length; j++) {
      const sim = jaccardSim(altObjs[i].tokens, altObjs[j].tokens);
      if (sim >= 0.8) {
        findings.altJaccardHigh.push({
          slug,
          similarity: Math.round(sim * 100) / 100,
          altA: altObjs[i].alt.slice(0, 100),
          altB: altObjs[j].alt.slice(0, 100),
          srcA: altObjs[i].src,
          srcB: altObjs[j].src,
        });
      }
    }
  }
}

// === adjacentImagesClose — 인접 이미지 사이 본문 텍스트 < 100자 (KR adjacentFigures 대체) ===
const stripMd = (md) =>
  md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[*_`#>|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
for (const [slug, imgs] of postImages.entries()) {
  const body = postBodies.get(slug) || '';
  for (let i = 1; i < imgs.length; i++) {
    const between = stripMd(body.slice(imgs[i - 1].position, imgs[i].position));
    if (between.length < 100) {
      findings.adjacentImagesClose.push({
        slug,
        between: between.length,
        imgA: imgs[i - 1].src,
        imgB: imgs[i].src,
        position: imgs[i].position,
      });
    }
  }
}

// === topClusterImages — body 시작 500자 안 이미지 ≥ 2개 (KR topClusterFigures 대체) ===
// 단, §3 본문 상단 인포그래픽 1장은 정상 → ≥2장일 때만 경고.
for (const [slug, imgs] of postImages.entries()) {
  const topImgs = imgs.filter((f) => f.position < 500);
  if (topImgs.length >= 2) {
    findings.topClusterImages.push({ slug, count: topImgs.length, srcs: topImgs.map((f) => f.src) });
  }
}

// === brokenInternalFile — 내부 이미지의 public/ 실제 파일 부재 ===
// /images/articles/... → public/images/articles/... 매핑하여 존재 검사.
for (const img of allImages) {
  if (!img.isInternal) continue;
  const rel = img.src.split('?')[0].replace(/^\//, '');
  const filePath = path.join(ROOT, 'public', rel);
  if (!existsSync(filePath)) {
    findings.brokenInternalFile.push({
      slug: img.slug,
      src: img.src,
      expected: path.relative(ROOT, filePath),
      reason: 'public/ 에 실제 이미지 파일 없음',
    });
  }
}

// === N/A 카테고리 (GFM엔 width/height/figcaption 속성 부재) — 카테고리 골격만 보존 ===
// missingDimensions / subWidth1200 / missingFigcaption 는 JP GFM 본문에서 측정 불가 → 0 유지.
findings.missingDimensions = [];
findings.subWidth1200 = [];
findings.missingFigcaption = [];

// === --mismatch-only 모드: 내부경로 mismatch만 출력 후 종료 ===
if (FLAGS.mismatchOnly) {
  const mismatchReport = {
    mode: 'mismatch-only',
    dryRun: FLAGS.dryRun,
    postFilter: FLAGS.post || null,
    totalPosts: postStats.length,
    totalBodyImages: allImages.length,
    mismatchCount: findings.internalPathMismatch.length,
    mismatches: findings.internalPathMismatch,
  };

  await mkdir(path.join(ROOT, 'tmp'), { recursive: true });
  const ts = tsNow();
  const outPath = FLAGS.out || path.join('tmp', `audit-body-images-mismatch-${ts}.json`);
  await writeFile(outPath, JSON.stringify(mismatchReport, null, 2));

  if (FLAGS.json) {
    process.stdout.write(JSON.stringify(mismatchReport, null, 2) + '\n');
  } else {
    console.log(`\n[--mismatch-only] 내부경로 mismatch 검출: ${findings.internalPathMismatch.length}건`);
    console.log(`JSON: ${outPath}`);
    if (FLAGS.dryRun) console.log('(dry-run: HTTP HEAD/SIZE skip, 자동 수정 없음)');
  }
  process.exit(0);
}

// === 외부 URL HTTP HEAD check (placeholder·prod 외 외부만, 병렬 제한) — dry-run 시 skip ===
const externalUrls = [
  ...new Set(allImages.filter((i) => i.isExternal && !i.isPlaceholder).map((i) => i.src)),
];
if (!FLAGS.json) console.log(`\n외부 이미지 URL(검사 대상): ${externalUrls.length}`);

function headCheck(url) {
  try {
    const out = execSync(
      `curl -s -o /dev/null -w '%{http_code}|%{size_download}|%{content_type}' -I -L --max-time 8 '${url.replace(/'/g, "'\\''")}'`,
      { timeout: 10000 },
    ).toString();
    const [code, size, ctype] = out.split('|');
    return { url, code: Number(code), size: Number(size), ctype };
  } catch (e) {
    return { url, code: 0, error: e.message };
  }
}

const httpResults = new Map();
if (!FLAGS.dryRun) {
  for (const url of externalUrls) httpResults.set(url, headCheck(url));
} else if (!FLAGS.json) {
  console.log('(dry-run: HTTP HEAD skip)');
}

const brokenUrls = [];
if (!FLAGS.dryRun) {
  for (const [url, r] of httpResults.entries()) {
    if (!(r.code >= 200 && r.code < 400)) brokenUrls.push({ url, code: r.code });
  }
}

// === Output ===
function buildCounts() {
  const out = {};
  for (const k of Object.keys(findings)) out[k] = findings[k].length;
  out.brokenUrls = brokenUrls.length;
  return out;
}

const report = {
  mode: FLAGS.dryRun ? 'dry-run' : 'full',
  postFilter: FLAGS.post || null,
  totalPosts: postStats.length,
  totalBodyImages: allImages.length,
  externalUrls: externalUrls.length,
  findings: buildCounts(),
  detail: { ...findings, brokenUrls },
  postStats,
};

await mkdir(path.join(ROOT, 'tmp'), { recursive: true });
const outPath = FLAGS.out || path.join('tmp', `audit-body-images-raw-${tsNow()}.json`);
await writeFile(outPath, JSON.stringify(report, null, 2));

if (FLAGS.json) {
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
} else {
  console.log(`\nJSON: ${outPath}`);
  console.log(`\n결함 카운트:`, report.findings);
  if (FLAGS.dryRun) console.log('(dry-run: HTTP HEAD skip, 자동 수정 없음)');
}

function tsNow() {
  return new Date()
    .toISOString()
    .replace(/[-:T]/g, '')
    .replace(/\..+/, '')
    .replace(/(\d{8})(\d{6})/, '$1-$2');
}
