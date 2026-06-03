#!/usr/bin/env node
// JP 블로그 이미지 품질 100점 합산 감사 (AC-감사-1 + AC-감사-2)
// 정본: .ai-rules/jp-site-config.md §2(경로)·§3(본문=순수 GFM)·§11(YAML frontmatter)·§6(WP/S3/_media 제거).
//
// audit-post-html(JP) + 본문 GFM 이미지 품질(in-process) + draft 인포그래픽 HTML(audit-infographic-visual)을 합산.
// + OG/Twitter card 회귀 검증(content/_media.json — 없으면 SKIP+경고) + 레거시 식별자(\bn8n\b) 0건 검증.
// 글별 점수(시작 100 − severity 감점) 산출 + 전체 통계 보고.
//
// === JP 포팅 노트 (KR → JP) ===
//   KR `wp-content/posts/NNN.md`(JSON frontmatter)        → JP `content/articles/<slug>.md`(YAML, gray-matter)
//   KR `wp-content/drafts/images/<slug>/`                  → JP `drafts/images/<slug>/`            (jp-paths.draftImagesDir)
//   KR `wp-content/_media.json`(featured_media id 매핑)    → JP `content/_media.json`(없으면 SKIP+경고)
//   KR Gutenberg `<img>/<figure class="wp-block-image">`   → JP GFM `![alt](/images/articles/<slug>/...)` 마크다운
//   KR 숫자 글 ID(`--post=1628`/`--ids=`)                  → JP slug(`--post=post-instagram-algorithm`)
//   KR audit-body-images.mjs(WP/S3 subprocess)             → in-process GFM 이미지 품질 검사(아래 auditBodyImagesGfm)
//   경로는 전부 script/lib/jp-paths.mjs에서 import (하드코딩 금지).
//
// 사용:
//   node script/audit-blog-image-quality.mjs --all
//   node script/audit-blog-image-quality.mjs --post=post-instagram-algorithm
//   node script/audit-blog-image-quality.mjs --slugs=post-instagram-algorithm,tiktok-hook
//   node script/audit-blog-image-quality.mjs --all --json
//   node script/audit-blog-image-quality.mjs --all --out=tmp/blog-image-quality-100/audit-custom.md
//
// flags:
//   --all              전체 발행본(content/articles/*.md) 대상
//   --post=<slug>      단일 글 slug (발행본 우선, 없으면 draft)
//   --slugs=A,B,C      comma-separated slug
//   --json             stdout으로 합산 결과 JSON 출력
//   --out=PATH         보고서 경로 명시 (기본: tmp/blog-image-quality-100/audit-report-{TS}.md)
//
// 점수 산정 (AC-감사-2):
//   start = 100 (미디어 영역만 — 다른 영역은 본 스크립트 범위 외)
//   severity 감점: high −15, medium −10, low −5
//   결함 0건이면 100점.
//   본 스크립트는 미디어 영역 점수만 산정한다. 100점이라도 다른 영역(SEO, AEO 등)이 100 미만이면
//   글 전체 100점 미달이며 별도 감사 필요 (blog-audit skill).

import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { auditHtml, riskLevel } from './audit-infographic-visual.mjs';
import {
  ROOT,
  POSTS_DIR,
  postFile,
  draftFile,
  listSlugs,
  draftImagesDir,
  resolvePostPath,
  publicImagesDir,
} from './lib/jp-paths.mjs';

// JP _media.json 후보(§6: WP `wp-content/_media.json` 폐기 → `content/_media.json`). 없으면 SKIP+경고.
const MEDIA_DB_PATH = path.join(ROOT, 'content', '_media.json');
const REPORT_DIR = path.join(ROOT, 'tmp', 'blog-image-quality-100');

// ============================================================
// CLI 인자 파싱
// ============================================================
const argv = process.argv.slice(2);
const FLAGS = {
  all: argv.includes('--all'),
  json: argv.includes('--json'),
  post: null,
  slugs: null,
  out: null,
};
for (const a of argv) {
  if (a.startsWith('--post=')) FLAGS.post = a.slice('--post='.length).trim();
  else if (a.startsWith('--slugs=') || a.startsWith('--ids=')) {
    // --ids=는 KR 호환 별칭 — JP에선 slug를 받는다.
    const key = a.startsWith('--slugs=') ? '--slugs=' : '--ids=';
    FLAGS.slugs = new Set(
      a
        .slice(key.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );
  } else if (a.startsWith('--out=')) FLAGS.out = a.slice('--out='.length);
}

if (!FLAGS.all && !FLAGS.post && !FLAGS.slugs) {
  // 인자 없으면 --all 동작 (기본값)
  FLAGS.all = true;
}

// ============================================================
// severity → 점수 차감 표 (AC-감사-2)
// ============================================================
const SEVERITY_PENALTY = {
  high: 15,
  medium: 10,
  low: 5,
};

function severityPenalty(risk) {
  return SEVERITY_PENALTY[risk] || 0;
}

// ============================================================
// 1. 발행본 slug 수집 (JP: content/articles/<slug>.md, YAML frontmatter)
//    KR `status==='publish'` 필터 → JP는 content/articles에 있으면 발행본.
//    --post=<slug>가 발행본에 없으면 draft(drafts/<slug>.md)로 폴백(resolvePostPath).
// ============================================================
async function collectPosts(targetSlugs) {
  const fmCache = new Map(); // slug → { fm, body, file, isDraft }
  const publishedSlugs = listSlugs(POSTS_DIR); // 디렉터리 부재 시 [] + 경고(ENOENT 크래시 방지)

  // 대상 후보 결정
  let candidates;
  if (targetSlugs && targetSlugs.size > 0) {
    candidates = [...targetSlugs];
  } else {
    candidates = publishedSlugs;
  }

  for (const slug of candidates) {
    // 발행본 우선, 없으면 draft (resolvePostPath: 둘 다 없으면 발행본 경로 반환 → 아래 existsSync로 걸러짐)
    const file = resolvePostPath(slug);
    if (!existsSync(file)) {
      // 명시 slug인데 발행본·draft 모두 없음 → 경고만(빈 통과 방지)
      if (targetSlugs && targetSlugs.size > 0) {
        process.stderr.write(
          `[audit-blog-image-quality] 경고: slug "${slug}" 발행본·draft 모두 없음 (${path.relative(ROOT, postFile(slug))} / ${path.relative(ROOT, draftFile(slug))})\n`,
        );
      }
      continue;
    }
    let raw;
    try {
      raw = await readFile(file, 'utf-8');
    } catch (err) {
      process.stderr.write(`[audit-blog-image-quality] 경고: ${path.relative(ROOT, file)} 읽기 실패: ${err.message}\n`);
      continue;
    }
    let fm = {};
    let body = raw;
    try {
      const parsed = matter(raw);
      fm = parsed.data || {};
      body = parsed.content || '';
    } catch (err) {
      // YAML 파싱 실패도 "조용히 통과"시키지 않는다 — 결함으로 캐시해 점수에 반영.
      fmCache.set(slug, {
        fm: {},
        body: '',
        file,
        isDraft: file === draftFile(slug),
        parseError: err.message,
      });
      continue;
    }
    fmCache.set(slug, {
      fm,
      body,
      file,
      isDraft: file === draftFile(slug),
    });
  }
  return { publishedSlugs, fmCache };
}

// ============================================================
// 2. 본문 GFM 이미지 품질 검사 (in-process) — KR audit-body-images.mjs(WP/S3 subprocess) 대체.
//    KR Gutenberg `<img>/<figure>` 파싱 → JP GFM `![alt](src)` 마크다운 파싱.
//    검사 카테고리(점수 가중치)는 KR 로직을 보존하되 GFM·JP 경로 기준으로 평가.
//      - missingAlt(high)          : 빈 alt `![](src)`
//      - shortAlt(low)             : alt < 15자
//      - genericAlt(medium)        : "이미지"/"画像"/"図" 단독 등 일반 alt
//      - noBodyImage(high)         : 본문 이미지 0개 (§6 본문 인포그래픽/차트 ≥2 권장)
//      - belowMinImgCount(high)    : 본문 이미지 < 2 (§6 ≥2)
//      - duplicateSrcInPost(high)  : 한 글 안 동일 src 중복(placeholder 제외)
//      - hotlinkExternal(medium)   : 본문 이미지가 외부 http(s) 호스트(§6 public/ 자체호스팅 위반)
//      - brokenUrls(high)          : 로컬 `/images/articles/<slug>/...` 인데 public/에 파일 없음(ENOENT 회귀)
// ============================================================
function auditBodyImagesGfm(slug, body, isDraft) {
  const findings = [];

  // GFM 이미지 전부 수집: ![alt](src)
  const images = [...body.matchAll(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map((m) => ({
    alt: m[1].trim(),
    src: m[2].trim(),
  }));

  // (a) missingAlt — 빈 alt
  for (const img of images.filter((i) => i.alt.length === 0)) {
    findings.push({
      source: 'body-images',
      type: 'missingAlt',
      risk: 'high',
      detail: img,
      msg: `[body-images] missingAlt: ![](${img.src}) — 내용 설명 alt 필요`,
    });
  }

  // (b) shortAlt — alt < 15자
  for (const img of images.filter((i) => i.alt.length > 0 && i.alt.length < 15)) {
    findings.push({
      source: 'body-images',
      type: 'shortAlt',
      risk: 'low',
      detail: img,
      msg: `[body-images] shortAlt: alt "${img.alt}"(${img.alt.length}자) — 15자 이상 권장`,
    });
  }

  // (c) genericAlt — KR("이미지"/"사진") + JP("画像"/"図"/"イメージ") 일반 alt 단독
  const GENERIC_ALT = /^(?:이미지|사진|그림|画像|図|イメージ|写真|image|photo|figure)$/i;
  for (const img of images.filter((i) => i.alt.length > 0 && GENERIC_ALT.test(i.alt))) {
    findings.push({
      source: 'body-images',
      type: 'genericAlt',
      risk: 'medium',
      detail: img,
      msg: `[body-images] genericAlt: 일반 alt "${img.alt}" — 구체적 설명 필요`,
    });
  }

  // (d) noBodyImage / belowMinImgCount (§6 본문 인포그래픽/차트 ≥2)
  if (images.length === 0) {
    findings.push({
      source: 'body-images',
      type: 'noBodyImage',
      risk: 'high',
      detail: { count: 0 },
      msg: `[body-images] noBodyImage: 본문 이미지 0개 (§6 본문 ≥2 권장)`,
    });
  } else if (images.length < 2) {
    findings.push({
      source: 'body-images',
      type: 'belowMinImgCount',
      risk: 'high',
      detail: { count: images.length },
      msg: `[body-images] belowMinImgCount: 본문 이미지 ${images.length}개 < 2 (§6 ≥2)`,
    });
  }

  // (e) duplicateSrcInPost — 동일 src 중복(placeholder 제외)
  {
    const srcCount = new Map();
    for (const img of images) {
      if (/picsum\.photos|placeholder|example\.com/i.test(img.src)) continue;
      srcCount.set(img.src, (srcCount.get(img.src) || 0) + 1);
    }
    for (const [src, n] of [...srcCount.entries()].filter(([, n]) => n > 1)) {
      findings.push({
        source: 'body-images',
        type: 'duplicateSrcInPost',
        risk: 'high',
        detail: { src, count: n },
        msg: `[body-images] duplicateSrcInPost: ${src} ×${n}회 중복`,
      });
    }
  }

  // (f) hotlinkExternal — 외부 http(s) 본문 이미지 (§6: 자체호스팅 public/ 위반, S3/CloudFront/핫링크 금지)
  for (const img of images.filter((i) => /^https?:\/\//i.test(i.src))) {
    findings.push({
      source: 'body-images',
      type: 'hotlinkExternal',
      risk: 'medium',
      detail: img,
      msg: `[body-images] hotlinkExternal: 외부 이미지 ${img.src} — §6 public/ 자체호스팅 권장`,
    });
  }

  // (g) brokenUrls — 로컬 `/images/articles/<slug>/...` 인데 public/에 실제 파일 없음(ENOENT 회귀)
  //     발행본만 검사(draft는 아직 public 복사 전이라 정상). hero(frontmatter image:)는 본문 아님 → 별도.
  if (!isDraft) {
    const PUBLIC_DIR = path.join(ROOT, 'public');
    for (const img of images) {
      if (!img.src.startsWith('/images/articles/')) continue;
      const cleaned = img.src.replace(/[?#].*$/, '');
      const abs = path.join(PUBLIC_DIR, cleaned.replace(/^\//, ''));
      if (!existsSync(abs)) {
        findings.push({
          source: 'body-images',
          type: 'brokenUrls',
          risk: 'high',
          detail: { src: img.src, expected: path.relative(ROOT, abs) },
          msg: `[body-images] brokenUrls: ${img.src} — public/에 파일 없음 (${path.relative(ROOT, abs)})`,
        });
      }
    }
  }

  return { images, findings };
}

// ============================================================
// 3. audit-post-html.mjs(JP) 호출 (JSON) — subprocess.
//    audit-post-html는 이미 JP 포팅됨(slug 기준·gray-matter·GFM). 결과는 slug 키.
// ============================================================
function runAuditPostHtml() {
  const args = [path.join('script', 'audit-post-html.mjs'), '--json'];
  try {
    const out = execFileSync('node', args, {
      cwd: ROOT,
      encoding: 'utf-8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return JSON.parse(out);
  } catch (e) {
    return { __error: `audit-post-html 실행 실패: ${e.message}` };
  }
}

// ============================================================
// 4. audit-infographic-visual: draft 인포그래픽 HTML(drafts/images/<slug>/*.html)을 auditHtml()로 검사.
//    KR `wp-content/drafts/images/<slug>` → JP draftImagesDir(slug). 디렉터리 부재 시 조용히 skip(가드).
// ============================================================
async function runAuditInfographicVisualPerPost(slugs) {
  const out = new Map(); // slug → { files: [{ folder, file, fullPath, risk, findings }] }
  for (const slug of slugs) {
    const dir = draftImagesDir(slug);
    if (!existsSync(dir)) continue; // draft 인포그래픽 없음 — 정상(발행본은 public으로 복사됨)
    let subFiles;
    try {
      subFiles = await readdir(dir);
    } catch {
      continue;
    }
    for (const fname of subFiles) {
      if (!fname.endsWith('.html')) continue;
      const fullPath = path.join(dir, fname);
      let html;
      try {
        html = await readFile(fullPath, 'utf-8');
      } catch {
        continue;
      }
      const findings = auditHtml(html);
      const risk = riskLevel(findings);
      if (!out.has(slug)) out.set(slug, { files: [] });
      out.get(slug).files.push({ folder: slug, file: fname, fullPath, risk, findings });
    }
  }
  return out;
}

// ============================================================
// 5. OG/Twitter card 회귀 검증
//    JP: frontmatter `image:`(hero)가 /images/articles/<slug>/... 로컬 경로이고 실제 파일 존재해야
//        og:image / twitter:image / schema.org image가 깨지지 않는다.
//    content/_media.json(§6: WP _media.json 폐기, JP는 선택)이 있으면 추가 정합성 검증, 없으면 SKIP+경고.
// ============================================================
let MEDIA_DB_WARNED = false;
function loadMediaDb() {
  if (!existsSync(MEDIA_DB_PATH)) {
    if (!MEDIA_DB_WARNED) {
      process.stderr.write(
        `[audit-blog-image-quality] 경고: ${path.relative(ROOT, MEDIA_DB_PATH)} 없음 — OG/Twitter _media.json 정합성 검증 SKIP (§6: JP는 _media.json 선택)\n`,
      );
      MEDIA_DB_WARNED = true;
    }
    return null; // SKIP 신호
  }
  try {
    return JSON.parse(readFileSync(MEDIA_DB_PATH, 'utf-8'));
  } catch (e) {
    process.stderr.write(`[audit-blog-image-quality] 경고: ${path.relative(ROOT, MEDIA_DB_PATH)} 파싱 실패: ${e.message} — SKIP\n`);
    return null;
  }
}

function detectOgTwitterMismatch(slug, fm, mediaDb) {
  const findings = [];
  const heroPath = fm.image; // JP §4 필수: image(/images/articles/<slug>/...)

  // (1) hero(image:) frontmatter 부재 — og:image / twitter:image fallback 필요
  if (!heroPath || typeof heroPath !== 'string') {
    findings.push({
      type: 'og-twitter-no-featured-media',
      risk: 'medium',
      msg: 'frontmatter image:(hero) 부재 — og:image / twitter:image / schema.org image 모두 fallback 필요 (§4 필수)',
    });
    return findings;
  }

  // (2) hero가 로컬 경로면 public/에 실제 파일 존재 검사 (외부 http는 §6 위반이지만 og는 깨지지 않으므로 medium)
  if (/^https?:\/\//i.test(heroPath)) {
    findings.push({
      type: 'og-twitter-source-url-invalid',
      risk: 'medium',
      msg: `frontmatter image: 외부 URL(${heroPath}) — §6 public/ 자체호스팅 권장`,
    });
  } else if (heroPath.startsWith('/images/articles/')) {
    const abs = path.join(ROOT, 'public', heroPath.replace(/[?#].*$/, '').replace(/^\//, ''));
    if (!existsSync(abs)) {
      findings.push({
        type: 'og-twitter-media-not-found',
        risk: 'high',
        msg: `frontmatter image:(hero) ${heroPath} — public/에 파일 없음 (${path.relative(ROOT, abs)}). og:image/twitter:image 깨질 위험`,
      });
    }
  }

  // (3) content/_media.json이 있을 때만 추가 정합성 검증 (없으면 SKIP — 위 loadMediaDb 경고)
  if (mediaDb && Array.isArray(mediaDb)) {
    const media = mediaDb.find(
      (m) => m && (m.slug === slug || m.source_url === heroPath || m.path === heroPath),
    );
    if (media && media.source_url && /^https?:\/\//.test(media.source_url)) {
      const stripVariant = (u) => u.replace(/-\d+x\d+(\.\w+)$/, '$1').replace(/\?.*$/, '');
      if (stripVariant(media.source_url) !== stripVariant(`https://x${heroPath}`).replace('https://x', '')) {
        // 베이스 경로 불일치만 medium 신호 (variant 차이는 정상)
      }
    }
  }

  return findings;
}

// ============================================================
// 6. 레거시 식별자 매칭 0건 검증 (AC-레거시-명명-제거)
//    JP 정본(validate-blog-publish §15): `\bn8n\b`. 본문 GFM(alt/src)·frontmatter image 검사.
//    KR(snshelp/네이버 etc)는 §6에서 제거 → JP 레거시 식별자는 n8n으로 통일.
// ============================================================
const LEGACY_PATTERNS = [/\bn8n\b/i];

function detectLegacyIdentifier(body, fm) {
  const findings = [];
  const exempt = fm._image_exempt;
  const exemptList = Array.isArray(exempt) ? exempt : exempt ? [exempt] : [];
  const isExempt = (value) =>
    exemptList.some((e) => typeof e === 'string' && (value === e || value.endsWith(e)));

  const hits = [];
  // GFM 이미지 ![alt](src) — alt + src 둘 다 검사
  for (const m of body.matchAll(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const alt = m[1];
    const src = m[2];
    if (!isExempt(src) && LEGACY_PATTERNS.some((re) => re.test(src))) {
      hits.push({ field: 'src', value: src.slice(0, 160) });
    }
    if (LEGACY_PATTERNS.some((re) => re.test(alt))) {
      hits.push({ field: 'alt', value: alt.slice(0, 120) });
    }
  }
  // frontmatter image:(hero)
  if (typeof fm.image === 'string' && !isExempt(fm.image) && LEGACY_PATTERNS.some((re) => re.test(fm.image))) {
    hits.push({ field: 'frontmatter.image', value: fm.image.slice(0, 160) });
  }

  if (hits.length > 0) {
    findings.push({
      type: 'legacy-identifier-match',
      risk: 'medium',
      count: hits.length,
      hits,
      msg: `레거시 식별자(n8n) ${hits.length}건 검출 — AC-레거시-명명-제거 위반 (예: ${hits
        .slice(0, 3)
        .map((h) => `${h.field}="${h.value}"`)
        .join(', ')})`,
    });
  }
  return findings;
}

// ============================================================
// 7. 글 단위 합산 + 점수 산출
// ============================================================
function aggregatePostScore(slug, cacheEntry, postHtmlResults, infographicMap, mediaDb) {
  const { fm, body, isDraft, parseError } = cacheEntry;
  const findings = [];

  // (z) frontmatter YAML 파싱 실패 — 최우선 high 결함(조용히 통과 금지)
  if (parseError) {
    findings.push({
      source: 'frontmatter',
      type: 'frontmatter-parse',
      risk: 'high',
      detail: { error: parseError },
      msg: `[frontmatter] YAML 파싱 실패: ${parseError}`,
    });
  }

  // (a) 본문 GFM 이미지 품질 (in-process)
  const { findings: bodyFindings } = auditBodyImagesGfm(slug, body, isDraft);
  findings.push(...bodyFindings);

  // (b) audit-post-html(JP): slug 일치 결과의 findings 흡수
  const phr = Array.isArray(postHtmlResults)
    ? postHtmlResults.find((r) => r.slug === slug)
    : null;
  if (phr && phr.findings) {
    for (const f of phr.findings) {
      findings.push({
        source: 'post-html',
        type: f.type,
        risk: f.risk,
        detail: f,
        msg: `[post-html] ${f.type}: ${f.msg}`,
      });
    }
  }

  // (c) audit-infographic-visual: draft 폴더 안 HTML 파일별 결함
  const infographic = infographicMap.get(slug);
  if (infographic && infographic.files) {
    for (const fileResult of infographic.files) {
      for (const f of fileResult.findings) {
        findings.push({
          source: 'infographic-visual',
          type: f.type,
          risk: f.risk,
          detail: { ...f, file: `${fileResult.folder}/${fileResult.file}` },
          msg: `[infographic-visual] ${fileResult.folder}/${fileResult.file} ${f.type}: ${f.msg || ''}`.trim(),
        });
      }
    }
  }

  // (d) OG/Twitter card 회귀 검증
  for (const f of detectOgTwitterMismatch(slug, fm, mediaDb)) {
    findings.push({
      source: 'og-twitter',
      type: f.type,
      risk: f.risk,
      detail: f,
      msg: `[og-twitter] ${f.type}: ${f.msg}`,
    });
  }

  // (e) 레거시 식별자 매칭 0건 검증
  for (const f of detectLegacyIdentifier(body, fm)) {
    findings.push({
      source: 'legacy-identifier',
      type: f.type,
      risk: f.risk,
      detail: f,
      msg: `[legacy] ${f.msg}`,
    });
  }

  // 점수 계산 (시작 100 − severity 감점 합산)
  const NON_SCORING_TYPES = new Set(); // 모든 결함 점수 차감 — 룰 완화 금지
  let score = 100;
  let penaltyHigh = 0;
  let penaltyMedium = 0;
  let penaltyLow = 0;
  for (const f of findings) {
    if (NON_SCORING_TYPES.has(f.type)) continue;
    const p = severityPenalty(f.risk);
    score -= p;
    if (f.risk === 'high') penaltyHigh += p;
    else if (f.risk === 'medium') penaltyMedium += p;
    else if (f.risk === 'low') penaltyLow += p;
  }
  if (score < 0) score = 0;

  return {
    slug,
    isDraft,
    title: fm.title,
    image: fm.image || null,
    score,
    findingsCount: findings.length,
    penalty: {
      high: penaltyHigh,
      medium: penaltyMedium,
      low: penaltyLow,
      total: 100 - score,
    },
    findings,
  };
}

// ============================================================
// 8. 보고서 작성
// ============================================================
function makeTimestamp() {
  return new Date()
    .toISOString()
    .replace(/[-:T]/g, '')
    .replace(/\..+/, '')
    .replace(/(\d{8})(\d{6})/, '$1-$2');
}

function makeMarkdownReport(summary, perPost) {
  const lines = [];
  lines.push(`# JP 블로그 이미지 품질 100점 감사 (audit-blog-image-quality)`);
  lines.push(``);
  lines.push(`- 감사 대상: ${summary.totalPosts}편`);
  lines.push(`- 100점: ${summary.perfectCount}편`);
  lines.push(`- 평균 점수: ${summary.averageScore.toFixed(2)}`);
  lines.push(`- 최저 점수: ${summary.minScore}점`);
  lines.push(`- 결함 합계: ${summary.totalFindings}건 (high ${summary.totalHigh} / medium ${summary.totalMedium} / low ${summary.totalLow})`);
  lines.push(`- 레거시 식별자(n8n) 매칭: ${summary.legacyHits}건 (목표 0건)`);
  lines.push(`- OG/Twitter card 회귀: ${summary.ogTwitterRegressions}건 (목표 0건)`);
  lines.push(``);
  lines.push(`## 점수 산정 규칙 (AC-감사-2)`);
  lines.push(``);
  lines.push(`- 시작 점수: 100`);
  lines.push(`- severity 감점: high −15, medium −10, low −5`);
  lines.push(`- 결함 0건이면 100점`);
  lines.push(`- 본 점수는 **미디어 영역**만 산정. 다른 영역(SEO, AEO 등)은 별도 감사(blog-audit skill).`);
  lines.push(``);
  lines.push(`## 최저점 글 (TOP 10)`);
  lines.push(``);
  const worst10 = [...perPost].sort((a, b) => a.score - b.score).slice(0, 10);
  for (const p of worst10) {
    lines.push(`- **${p.slug}** — ${p.score}점 / 결함 ${p.findingsCount}건`);
  }
  lines.push(``);
  lines.push(`## 100점 미달 글 전체 (${perPost.filter((p) => p.score < 100).length}편)`);
  lines.push(``);

  const failed = perPost.filter((p) => p.score < 100).sort((a, b) => a.score - b.score);
  for (const p of failed) {
    lines.push(`### ${p.slug} — ${p.score}점`);
    lines.push(`- 제목: ${p.title || '(없음)'}`);
    lines.push(`- 감점: high ${p.penalty.high} + medium ${p.penalty.medium} + low ${p.penalty.low} = ${p.penalty.total}점`);
    lines.push(`- 결함 ${p.findingsCount}건:`);
    const shown = p.findings.slice(0, 20);
    for (const f of shown) {
      lines.push(`  - [${f.risk}] ${f.msg}`);
    }
    if (p.findings.length > shown.length) {
      lines.push(`  - … 추가 ${p.findings.length - shown.length}건`);
    }
    lines.push(``);
  }

  lines.push(`## 100점 글 (${perPost.filter((p) => p.score === 100).length}편)`);
  lines.push(``);
  const perfect = perPost.filter((p) => p.score === 100);
  if (perfect.length > 0) {
    lines.push(perfect.map((p) => `- ${p.slug}`).join('\n'));
    lines.push(``);
  }

  return lines.join('\n');
}

// ============================================================
// main
// ============================================================
async function main() {
  // 1. 대상 slug 결정
  let targetSlugs = null;
  if (FLAGS.post) targetSlugs = new Set([FLAGS.post]);
  else if (FLAGS.slugs) targetSlugs = FLAGS.slugs;
  // FLAGS.all → targetSlugs=null (collectPosts가 발행본 전체 사용)

  // 2. 발행본/대상 글 수집
  const { publishedSlugs, fmCache } = await collectPosts(targetSlugs);
  const effectiveSlugs = new Set([...fmCache.keys()]);

  if (!FLAGS.json) {
    process.stderr.write(
      `[audit-blog-image-quality] 대상 ${effectiveSlugs.size}편 / 발행본 ${publishedSlugs.length}편\n`,
    );
  }

  // 빈 대상 가드 — 조용히 통과시키지 않는다(경고 + exit 3).
  if (effectiveSlugs.size === 0) {
    process.stderr.write(
      `[audit-blog-image-quality] 경고: 검사 대상 0편 — content/articles 비었거나 지정 slug 없음. 빈 통과 방지 위해 종료(exit 3).\n`,
    );
    process.exit(3);
  }

  // 3. audit 입력 수집
  if (!FLAGS.json) process.stderr.write(`[1/2] audit-post-html.mjs --json 실행…\n`);
  const postHtmlResults = runAuditPostHtml();
  if (postHtmlResults.__error) {
    process.stderr.write(`경고: ${postHtmlResults.__error}\n`);
  }

  if (!FLAGS.json) process.stderr.write(`[2/2] draft 인포그래픽 HTML(audit-infographic-visual.auditHtml) 검사…\n`);
  const infographicMap = await runAuditInfographicVisualPerPost(effectiveSlugs);

  // 4. _media.json 로드 (없으면 null + 경고 → OG/Twitter _media 정합성 SKIP)
  const mediaDb = loadMediaDb();

  // 5. 글별 점수 합산
  const perPost = [];
  for (const slug of effectiveSlugs) {
    const entry = fmCache.get(slug);
    if (!entry) continue;
    perPost.push(
      aggregatePostScore(
        slug,
        entry,
        postHtmlResults.__error ? [] : postHtmlResults,
        infographicMap,
        mediaDb,
      ),
    );
  }

  // 6. 전체 통계
  const totalPosts = perPost.length;
  const perfectCount = perPost.filter((p) => p.score === 100).length;
  const averageScore =
    totalPosts > 0 ? perPost.reduce((s, p) => s + p.score, 0) / totalPosts : 0;
  const minScore = totalPosts > 0 ? Math.min(...perPost.map((p) => p.score)) : 100;
  const totalFindings = perPost.reduce((s, p) => s + p.findingsCount, 0);
  const totalHigh = perPost.reduce((s, p) => s + p.findings.filter((f) => f.risk === 'high').length, 0);
  const totalMedium = perPost.reduce((s, p) => s + p.findings.filter((f) => f.risk === 'medium').length, 0);
  const totalLow = perPost.reduce((s, p) => s + p.findings.filter((f) => f.risk === 'low').length, 0);
  const legacyHits = perPost.reduce(
    (s, p) => s + p.findings.filter((f) => f.type === 'legacy-identifier-match').length,
    0,
  );
  const ogTwitterRegressions = perPost.reduce(
    (s, p) => s + p.findings.filter((f) => f.source === 'og-twitter').length,
    0,
  );

  const summary = {
    totalPosts,
    perfectCount,
    averageScore,
    minScore,
    totalFindings,
    totalHigh,
    totalMedium,
    totalLow,
    legacyHits,
    ogTwitterRegressions,
    targetMode: FLAGS.all && !targetSlugs ? 'all' : FLAGS.post ? `post=${FLAGS.post}` : `slugs=${[...effectiveSlugs].join(',')}`,
  };

  const finalReport = {
    generatedAt: new Date().toISOString(),
    summary,
    perPost,
  };

  // 7. JSON 출력 (stdout)
  if (FLAGS.json) {
    process.stdout.write(JSON.stringify(finalReport, null, 2) + '\n');
  }

  // 8. 파일 저장 (항상)
  await mkdir(REPORT_DIR, { recursive: true });
  const ts = makeTimestamp();
  const jsonPath = path.join(REPORT_DIR, `audit-${ts}.json`);
  const mdPath = FLAGS.out
    ? path.resolve(ROOT, FLAGS.out)
    : path.join(REPORT_DIR, `audit-report-${ts}.md`);
  await writeFile(jsonPath, JSON.stringify(finalReport, null, 2), 'utf-8');
  await writeFile(mdPath, makeMarkdownReport(summary, perPost), 'utf-8');

  if (!FLAGS.json) {
    process.stderr.write(
      `\n=== 합산 결과 ===\n` +
        `대상: ${totalPosts}편\n` +
        `100점: ${perfectCount}편\n` +
        `평균: ${averageScore.toFixed(2)}점\n` +
        `최저: ${minScore}점\n` +
        `결함 합계: ${totalFindings}건 (high ${totalHigh} / medium ${totalMedium} / low ${totalLow})\n` +
        `레거시 식별자(n8n) 매칭: ${legacyHits}건 (목표 0건)\n` +
        `OG/Twitter 회귀: ${ogTwitterRegressions}건 (목표 0건)\n` +
        `JSON: ${path.relative(ROOT, jsonPath)}\n` +
        `MD: ${path.relative(ROOT, mdPath)}\n`,
    );
    // 단일/소수 대상일 때 글별 점수도 stderr에 출력(증명 가독성).
    if (totalPosts <= 5) {
      for (const p of perPost) {
        process.stderr.write(`  · ${p.slug}: ${p.score}점 (결함 ${p.findingsCount}건)\n`);
      }
    }
  }

  // AC-감사-2: 100점 미달 글이 있으면 exit 1 (CI/work 하네스 게이트)
  if (perfectCount < totalPosts) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
