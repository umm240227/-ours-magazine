#!/usr/bin/env node
// JP 발행 레이어 — KR `wp-publish-new.mjs`(WP/S3/CloudFront)의 마크다운+git 대체.
// 게이트 계약(_audit_score===100 / 이미지≥3 / hero 1 / validate / placeholder)은 그대로 유지.
// 발행 액션만: draft → content/articles/<slug>.md + public/images/articles/<slug>/ (+ Phase1: git push)
//
// 정본: .ai-rules/jp-site-config.md §5
// 사용: node script/md-publish.mjs <draft.md> [--push]
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { execFileSync, spawnSync } from 'node:child_process';

let sharp;
try { sharp = (await import('sharp')).default; } catch { /* webp 입력만 있으면 sharp 불필요 */ }

const ROOT = process.cwd();
const ARTICLES_DIR = path.join(ROOT, 'content', 'articles');
const PUBLIC_IMG_BASE = path.join(ROOT, 'public', 'images', 'articles');
const PUBLIC_HOST = (process.env.PUBLIC_BLOG_HOST || 'https://www.ours-magazine.jp').replace(/\/$/, '');

const args = process.argv.slice(2);
const draftPath = args.find((a) => !a.startsWith('--'));
const doPush = args.includes('--push');                       // commit + push origin main
const doCommit = doPush || args.includes('--commit');         // --commit = commit만 (cron, push는 daily-all)

function fail(code, msg) { console.error(`✗ ${msg}`); process.exit(code); }

// C5 (jp-site-config §5, F4 보정): 발행 게이트를 subprocess로 실제 호출. 비0 종료 시 발행 차단.
// onFail: 차단 시 정리 콜백(예: 이미 복사한 이미지 디렉터리 제거 — 재실행 깨끗하게).
function runGate(scriptRel, gateArgs, label, onFail) {
  const res = spawnSync('node', [path.join(ROOT, scriptRel), ...gateArgs], { cwd: ROOT, encoding: 'utf8' });
  if (res.error) { if (onFail) onFail(); fail(2, `${label} 게이트 실행 실패: ${res.error.message}`); }
  if (res.status !== 0) {
    if (onFail) onFail();
    const out = `${res.stdout || ''}${res.stderr || ''}`.trim();
    fail(2, `${label} 게이트 차단 (exit ${res.status}):\n${out}`);
  }
}

if (!draftPath || !fs.existsSync(draftPath)) fail(1, '사용: md-publish.mjs <draft.md> [--push]');

const { data: meta, content: body0 } = matter(fs.readFileSync(draftPath, 'utf8'));

// ── 게이트 (wp-publish-new.mjs 정합) ───────────────────────────────
if (!meta._draft) fail(1, 'frontmatter._draft 없음 (write 단계 blog/write.md 미실행)');

const auditScore = typeof meta._audit_score === 'number' ? meta._audit_score : null;
if (auditScore === null) fail(2, '100점 게이트 차단: _audit_score 누락 (audit 단계 미실행)');
if (auditScore < 100) fail(2, `100점 게이트 차단: _audit_score=${auditScore} < 100`);

const images = meta._draft.images || [];
if (images.length < 3) fail(2, `이미지 게이트 차단: _draft.images=${images.length}장 (hero 1 + 본문 ≥2 = 최소 3장)`);

const heroIdx = images.findIndex((m) => m.role === 'hero' || m.purpose === 'hero' || m.featured === true);
const isHero = (i) => (heroIdx === -1 ? i === 0 : i === heroIdx);
if (!images.some((_, i) => isHero(i))) fail(2, 'hero 이미지 없음 (purpose:hero 또는 featured:true 또는 index 0)');

// slug = frontmatter.slug || draft 파일명(draft- 접두 제거)
const slug = (meta.slug || path.basename(draftPath).replace(/^draft-/, '').replace(/\.md$/, '')).trim();
if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) fail(2, `slug 형식 위반(영문 kebab-case): "${slug}"`);

// ── C5: 종합 발행 게이트 — validate-blog-publish (16체크: 여백비율·width≥1200·타입다양성≥2·placeholder 등) ──
runGate('script/validate-blog-publish.mjs', [draftPath], 'validate-blog-publish');

// ── 적대적 팩트체크 하드 게이트 (jp-site-config §9): 외부 출처≥3 + _fact_checked 마커 + 죽은 링크 0 ──
runGate('script/fact-check-gate.mjs', [draftPath], 'fact-check');

// ── 이미지 복사 → public/images/articles/<slug>/ + 본문 placeholder 치환 ──
const outDir = path.join(PUBLIC_IMG_BASE, slug);
fs.mkdirSync(outDir, { recursive: true });
const outWebps = [];
let body = body0;
let heroRel = null;

for (let i = 0; i < images.length; i++) {
  const img = images[i];
  const src = path.isAbsolute(img.file) ? img.file : path.join(ROOT, img.file);
  if (!fs.existsSync(src)) fail(2, `이미지 파일 없음: ${img.file}`);
  const ext = path.extname(src).toLowerCase();
  // 파일명에 type 반영 → audit-cdn-gate classifyByPath가 인포/차트에 dim ratio 게이트(AC-룰-10) 적용.
  // hero는 16:9(ratio≈1.78)라 의도된 가로형 → 'hero'(=photo 분류)로 면제(KR wp-publish-new.mjs 동일 규칙).
  const kind = isHero(i) ? 'hero' : (img.type || 'infographic');
  const outName = `${String(i).padStart(2, '0')}-${kind}.webp`;
  const outPath = path.join(outDir, outName);

  if (ext === '.webp') {
    fs.copyFileSync(src, outPath);
  } else if (sharp) {
    await sharp(src).webp({ quality: 85 }).toFile(outPath);
  } else {
    fail(2, `sharp 미설치인데 비-webp 입력(${img.file}). 'npm i sharp' 또는 webp로 렌더하세요.`);
  }

  outWebps.push(path.relative(ROOT, outPath));
  const rel = `/images/articles/${slug}/${outName}`;
  if (isHero(i)) {
    heroRel = rel; // hero는 본문 미삽입 → frontmatter image로만
    if (body.includes(`[[IMG:${i}]]`)) fail(2, `hero 이미지(index=${i})를 본문 [[IMG:${i}]]로 삽입 금지 — image 필드 전용`);
  } else {
    if (!body.includes(`[[IMG:${i}]]`)) fail(2, `본문 이미지(index=${i}) placeholder [[IMG:${i}]]가 본문에 없음`);
    body = body.replaceAll(`[[IMG:${i}]]`, rel);
  }
}

const leftover = body.match(/\[\[IMG:\d+\]\]/g);
if (leftover) fail(2, `미치환 placeholder 잔존: ${[...new Set(leftover)].join(', ')}`);

// ── C5: 이미지 dim·md5 게이트 — audit-cdn-gate --source=local (복사된 webp 실측) ──
// 차단 시 이미 복사한 outDir 정리(재실행 깨끗하게 — Medium 리뷰 반영).
runGate('script/audit-cdn-gate.mjs', ['--source=local', `--images=${outWebps.join(',')}`], 'audit-cdn-gate(local)',
  () => fs.rmSync(outDir, { recursive: true, force: true }));

// ── JP frontmatter 조립 (ArticleFrontmatter + 자동화 메타 보존) ──────
const fm = {
  title: meta.title,
  description: meta.description || meta.excerpt || '',
  date: meta.date || new Date().toISOString().slice(0, 10).replace(/-/g, '.'),
  category: meta.category || (Array.isArray(meta.categories) ? meta.categories[0] : 'SNS'),
  image: heroRel || meta.image,
  tags: meta.tags || [],
};
if (meta.featured !== undefined) fm.featured = meta.featured;
if (meta.recommended !== undefined) fm.recommended = meta.recommended;
// E-E-A-T/AEO 메타 보존 (사이트가 author→Person JSON-LD, faq→FAQPage JSON-LD 생성, jp-site-config §4)
if (meta.author) fm.author = meta.author;
if (Array.isArray(meta.faq) && meta.faq.length > 0) fm.faq = meta.faq;
// 재감사·디버그용 보존 (사이트 파서는 무시)
fm._audit_score = meta._audit_score;
if (meta._audit_cycles !== undefined) fm._audit_cycles = meta._audit_cycles;
if (meta._fact_checked) fm._fact_checked = meta._fact_checked; // 적대적 팩트체크 기록 보존
fm._draft = meta._draft;

fs.mkdirSync(ARTICLES_DIR, { recursive: true });
const outFile = path.join(ARTICLES_DIR, `${slug}.md`);
fs.writeFileSync(outFile, matter.stringify(`${body.trim()}\n`, fm));

const result = {
  status: 'success',
  slug,
  file: path.relative(ROOT, outFile),
  images: images.length,
  audit_score: meta._audit_score,
  url: `${PUBLIC_HOST}/articles/${slug}`,
};

// ── git 단계 (jp-site-config §5) ───────────────────────────────────
//   (플래그 없음) 로컬 파일 생성까지 (Phase 0)
//   --commit         git add + commit, push 안 함 (cron: daily-all.sh가 마지막에 1회 push)
//   --push           git add + commit + push origin main (단독 발행 → Vercel 자동배포)
if (doCommit) {
  try {
    execFileSync('git', ['add', path.relative(ROOT, outFile), `public/images/articles/${slug}`], { cwd: ROOT, stdio: 'inherit' });
    execFileSync('git', ['commit', '-m', `post: ${slug} (audit ${meta._audit_score})`], { cwd: ROOT, stdio: 'inherit' });
    result.committed = true;
    if (doPush) {
      execFileSync('git', ['push', 'origin', 'main'], { cwd: ROOT, stdio: 'inherit' });
      result.pushed = true;
    }
  } catch (e) {
    result.committed = false;
    result.git_error = String(e.message || e);
  }
}

console.log(JSON.stringify(result));
