#!/usr/bin/env node
/**
 * 발행 전 검증 (JP) — md-publish.mjs C5 게이트에서 subprocess로 호출
 * 경로·파서는 jp-paths.mjs / gray-matter 단일 계약 (jp-site-config §2·§11).
 * exit 0: 통과  exit 2: 발행 차단
 * 단독 실행: node script/validate-blog-publish.mjs <draft-file>
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import sharp from 'sharp';
import matter from 'gray-matter';
import { ROOT } from './lib/jp-paths.mjs';

const [, , draftArg] = process.argv;
if (!draftArg) {
  console.error('사용: validate-blog-publish.mjs <draft-file>');
  process.exit(1);
}

const draftPath = path.resolve(draftArg);

// JP draft·발행본 모두 YAML frontmatter (gray-matter). jp-site-config §11 YAML 단일 계약.
// KR JSON.parse 계약 폐기 — draft·published·검증기 전부 gray-matter로 통일.
function parseFile(text) {
  const { data, content } = matter(text);
  return { meta: data, body: content };
}

// hero 판별: role/purpose/featured 명시 없으면 index 0을 hero로 간주 (wp-publish-new.mjs 규칙 일치)
function heroChecker(images) {
  const hasExplicit = images.some(
    (img) => img.role === 'hero' || img.purpose === 'hero' || img.featured === true,
  );
  return (img, i) => {
    if (img.role === 'hero' || img.purpose === 'hero' || img.featured === true) return true;
    if (!hasExplicit && i === 0) return true;
    return false;
  };
}

// 본문 인포그래픽 좌우 blank 비율 검사
async function checkBlankRatio(filePath) {
  try {
    const { data, info } = await sharp(filePath)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height, channels } = info;
    const bgR = data[0], bgG = data[1], bgB = data[2];

    const isBg = (offset) =>
      Math.abs(data[offset] - bgR) < 30 &&
      Math.abs(data[offset + 1] - bgG) < 30 &&
      Math.abs(data[offset + 2] - bgB) < 30;

    let minX = width;
    outerL: for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        if (!isBg((y * width + x) * channels)) { minX = x; break outerL; }
      }
    }

    let maxX = -1;
    outerR: for (let x = width - 1; x >= 0; x--) {
      for (let y = 0; y < height; y++) {
        if (!isBg((y * width + x) * channels)) { maxX = x; break outerR; }
      }
    }

    if (minX === width || maxX === -1) return { pass: true };

    const leftRatio = minX / width;
    const rightRatio = (width - 1 - maxX) / width;
    const contentRatio = (maxX - minX + 1) / width;

    const issues = [];
    if (leftRatio > 0.15)
      issues.push(`좌측 여백 ${(leftRatio * 100).toFixed(1)}% > 15%`);
    if (rightRatio > 0.15)
      issues.push(`우측 여백 ${(rightRatio * 100).toFixed(1)}% > 15%`);
    if (contentRatio < 0.70)
      issues.push(`콘텐츠 폭 ${(contentRatio * 100).toFixed(1)}% < 70%`);

    return issues.length ? { pass: false, reason: issues.join(', ') } : { pass: true };
  } catch (e) {
    return { pass: true, skipped: true, reason: `픽셀 분석 실패 (스킵): ${e.message}` };
  }
}

const errors = [];
let meta, body;

// 1. frontmatter 파싱
try {
  const text = await readFile(draftPath, 'utf8');
  ({ meta, body } = parseFile(text));
} catch (e) {
  console.error(`✗ 발행 검증 실패: ${e.message}`);
  process.exit(2);
}

// 2. _audit_score 검사
const auditScore = typeof meta._audit_score === 'number' ? meta._audit_score : null;
if (auditScore === null) {
  errors.push('_audit_score 누락 (audit 단계 blog/audit.md 미실행)');
} else if (auditScore < 100) {
  errors.push(`_audit_score=${auditScore} < 100`);
}

// 3. _draft 존재 확인
if (!meta._draft) {
  errors.push('_draft 누락');
  printAndExit(errors);
}

const images = meta._draft.images || [];
const isHero = heroChecker(images);

// 4. 이미지 최소 3장 (hero 1 + 본문 ≥ 2). AC-룰-5 cross-link.
if (images.length < 3) {
  errors.push(`_draft.images=${images.length}장 (hero 1장 + body 2장 이상 필요)`);
}

// 5. hero 1장 존재
if (images.length > 0 && !images.some((img, i) => isHero(img, i))) {
  errors.push('hero 이미지 없음 (role:"hero" 또는 featured:true 필요)');
}

// 6. body 이미지 1장 이상
const bodyImages = images.filter((img, i) => !isHero(img, i));
if (bodyImages.length === 0) {
  errors.push('body 이미지 없음 (role:"body" 이미지 최소 1장 필요)');
}

// 7. 이미지 파일 존재 확인
for (const img of images) {
  const p = path.resolve(ROOT, img.file);
  if (!existsSync(p)) errors.push(`이미지 파일 없음: ${img.file}`);
}

// 8. hero가 본문 [[IMG:N]]으로 삽입되면 차단
for (let i = 0; i < images.length; i++) {
  if (isHero(images[i], i) && body.includes(`[[IMG:${i}]]`)) {
    errors.push(
      `hero 이미지(index=${i})가 본문 [[IMG:${i}]]로 삽입됨 — featured_media 전용, 본문 삽입 금지`,
    );
  }
}

// 9. body 이미지 placeholder [[IMG:N]] 본문 일치 확인
for (let i = 0; i < images.length; i++) {
  if (!isHero(images[i], i) && !body.includes(`[[IMG:${i}]]`)) {
    errors.push(`body 이미지(index=${i}) placeholder [[IMG:${i}]] 본문에 없음`);
  }
}

// 10. 본문에 draft 이미지 경로 직접 삽입 금지 (JP: drafts/images/ — jp-paths draftImagesDir 기준)
if (body.includes('drafts/images/')) {
  errors.push('본문에 drafts/images/ 경로 직접 삽입됨 ([[IMG:N]] placeholder 사용 필요)');
}

// 11. 본문에 _draft.images[*].file 경로 직접 삽입 금지
for (const img of images) {
  if (body.includes(img.file)) {
    errors.push(`본문에 이미지 경로 직접 삽입됨: ${img.file}`);
  }
}

// 12. body 이미지 좌우 blank 비율 검사 (webp/png/jpg만)
const imageExts = new Set(['.webp', '.png', '.jpg', '.jpeg']);
for (let i = 0; i < images.length; i++) {
  const img = images[i];
  if (isHero(img, i)) continue;
  const p = path.resolve(ROOT, img.file);
  if (!existsSync(p)) continue;
  if (!imageExts.has(path.extname(p).toLowerCase())) continue;

  const result = await checkBlankRatio(p);
  if (result.skipped) {
    console.warn(`  ⚠ blank 검사 스킵 [index=${i}]: ${result.reason}`);
  } else if (!result.pass) {
    errors.push(`body 이미지[index=${i}] 좌우 여백 초과 — ${result.reason} (${img.file})`);
  }
}

// 13. AC-룰-4 본문 width<1200 검출 (이미지 파일 metadata 기준)
// hero는 1200×675 정본, 본문 이미지는 폭 1200 이상 강제 (asset-images §4.10.1).
// _image_exempt 마커가 있는 글은 본 검사를 건너뜀.
const imageExempt = meta._image_exempt === true || meta._draft?._image_exempt === true;
if (!imageExempt) {
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const p = path.resolve(ROOT, img.file);
    if (!existsSync(p)) continue;
    if (!imageExts.has(path.extname(p).toLowerCase())) continue;
    try {
      const meta2 = await sharp(p).metadata();
      if (typeof meta2.width === 'number' && meta2.width < 1200) {
        errors.push(`이미지[index=${i}] width=${meta2.width} < 1200 (AC-룰-4 위반: ${img.file})`);
      }
    } catch (e) {
      console.warn(`  ⚠ width 검사 스킵 [index=${i}]: ${e.message}`);
    }
  }
}

// 14. AC-룰-5 본문 이미지 종류 분포 ≥ 2종
// body 이미지(hero 제외)의 type/role 종류 카운트. 종류 < 2면 차단.
// type/role 필드가 없는 이미지는 'unknown'으로 분류.
if (!imageExempt && bodyImages.length > 0) {
  const types = new Set(
    bodyImages.map((img) => img.type || img.role || img.purpose || 'unknown'),
  );
  if (types.size < 2) {
    errors.push(
      `body 이미지 종류 분포=${types.size}종 (AC-룰-5 위반: 최소 2종 필요, 현재=[${[...types].join(', ')}])`,
    );
  }
}

// 15. AC-레거시-명명-제거 산출물 매칭 0건
// 본문·alt·figcaption·이미지 file 경로에서 `\bn8n\b` 매칭 차단.
{
  const LEGACY_RE = /\bn8n\b/i;
  if (LEGACY_RE.test(body)) {
    errors.push('본문에 레거시 식별자 `n8n` 매칭 (AC-레거시-명명-제거 위반)');
  }
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const blob = `${img.file || ''}\n${img.alt || ''}\n${img.caption || ''}\n${img.title || ''}`;
    if (LEGACY_RE.test(blob)) {
      errors.push(`이미지[index=${i}] 메타에 레거시 식별자 \`n8n\` 매칭 (AC-레거시-명명-제거 위반)`);
    }
  }
}

// 16. AC-감사-1 audit-blog-image-quality.mjs 종료 코드 검사
// [C4 완료 — enforced 게이트] audit-blog-image-quality.mjs는 content/articles·drafts/images로 repath됨(GFM·JP 誇大広告 사전).
//   트리거 = slug(JP는 id 없음). 합산 100점 미만이면 발행 차단(KR 충실 — 이미지 품질 hard 게이트, jp-site-config §9).
const C4_IMAGE_QUALITY_READY = true; // C4 완료 + POC에서 슬러그 트리거 100점 검증됨
// JP는 slug. slug 없으면 draft 파일명에서 유도(draft- 접두·.md 제거) → slug 없는 draft도 게이트 스킵 안 됨.
const postId = meta.slug || meta.id || meta._draft?.id
  || path.basename(draftPath).replace(/^draft-/, '').replace(/\.md$/, '') || null;
const auditScriptPath = path.resolve(ROOT, 'script/audit-blog-image-quality.mjs');
if (C4_IMAGE_QUALITY_READY && postId && existsSync(auditScriptPath)) {
  const auditArgs = [auditScriptPath, `--post=${postId}`];
  const res = spawnSync('node', auditArgs, {
    cwd: ROOT,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (res.error) {
    console.warn(`  ⚠ audit-blog-image-quality 호출 실패 (스킵): ${res.error.message}`);
  } else if (res.status !== 0) {
    const tail = (res.stderr || res.stdout || '').trim().split('\n').slice(-5).join('\n');
    errors.push(
      `AC-감사-1 audit-blog-image-quality 차단 (exit=${res.status})\n    ${tail.replace(/\n/g, '\n    ')}`,
    );
  }
}

function printAndExit(errs) {
  if (errs.length === 0) {
    console.log('✓ 발행 전 검증 통과');
    process.exit(0);
  }
  console.error(`✗ 발행 검증 실패 (${errs.length}건)`);
  for (const e of errs) console.error(`  - ${e}`);
  process.exit(2);
}

printAndExit(errors);
