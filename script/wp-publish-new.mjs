#!/usr/bin/env node
// draft 글 → S3 이미지 업로드 → CloudFront URL 치환 → WordPress 발행
// 사용:
//   node --env-file=.env script/wp-publish-new.mjs <draft-파일-경로> [--status=draft|publish]
//   예: node --env-file=.env script/wp-publish-new.mjs wp-content/posts/draft-instagram-followers.md
//
// 필요 환경변수:
//   WORDPRESS_BLOG_URL, WORDPRESS_BLOG_TOKEN
//   S3_BUCKET (예: snshelp-resource-bucket)
//   S3_PREFIX (예: blog)
//   CLOUDFRONT_DOMAIN (예: assets.helpsns.com)
// AWS 자격증명은 ~/.aws/credentials 사용 (aws CLI)

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import sharp from 'sharp';

const BASE = process.env.WORDPRESS_BLOG_URL;
const TOKEN = process.env.WORDPRESS_BLOG_TOKEN;
const S3_BUCKET = process.env.S3_BUCKET;
const S3_PREFIX = process.env.S3_PREFIX || 'blog';
const CF_DOMAIN = process.env.CLOUDFRONT_DOMAIN;

for (const [k, v] of Object.entries({
  WORDPRESS_BLOG_URL: BASE,
  WORDPRESS_BLOG_TOKEN: TOKEN,
  S3_BUCKET,
  CLOUDFRONT_DOMAIN: CF_DOMAIN,
})) {
  if (!v) {
    console.error(`환경변수 ${k} 필요`);
    process.exit(1);
  }
}

const HEADERS = {
  Authorization: `Basic ${TOKEN}`,
  'Content-Type': 'application/json',
};
const ROOT = path.resolve(import.meta.dirname, '..');
const POSTS_DIR = path.join(ROOT, 'wp-content', 'posts');

const args = process.argv.slice(2);
const draftPath = args.find((a) => !a.startsWith('--'));
const status = (args.find((a) => a.startsWith('--status='))?.split('=')[1]) || 'draft';

if (!draftPath || !['draft', 'publish', 'pending', 'private'].includes(status)) {
  console.error('사용: wp-publish-new.mjs <draft-파일> [--status=draft|publish|pending|private]');
  process.exit(1);
}

// 발행 전 검증 (placeholder·hero·draft URL·blank 비율 등 종합 검사)
const validateScript = path.join(ROOT, 'script', 'validate-blog-publish.mjs');
console.log('▶ 발행 전 검증 실행...');
try {
  execFileSync(process.execPath, [validateScript, draftPath], { stdio: 'inherit' });
} catch {
  process.exit(2);
}

function parseFile(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error('frontmatter 파싱 실패');
  return { meta: JSON.parse(m[1]), body: m[2].replace(/\n$/, '') };
}

function buildFile(meta, body) {
  return `---\n${JSON.stringify(meta, null, 2)}\n---\n${body}\n`;
}

function uploadToS3(localFile, mime) {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const filename = path.basename(localFile);
  const key = `${S3_PREFIX}/${yyyy}/${mm}/${Date.now()}-${filename}`;
  execFileSync(
    'aws',
    [
      's3',
      'cp',
      localFile,
      `s3://${S3_BUCKET}/${key}`,
      '--content-type',
      mime,
      '--cache-control',
      'public, max-age=31536000, immutable',
    ],
    { stdio: 'inherit' },
  );
  return `https://${CF_DOMAIN}/${key}`;
}

function mimeFor(file) {
  const ext = path.extname(file).toLowerCase();
  return (
    { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }[
      ext
    ] || 'application/octet-stream'
  );
}

// asset-images.md §2.2-1: PNG/JPG 신규 추가 금지. 업로드 직전 sharp로 WebP 변환.
// SVG·이미 WebP는 그대로 통과. WP /media POST에 image/webp로 전송.
async function ensureWebp(localFile) {
  const ext = path.extname(localFile).toLowerCase();
  if (ext === '.webp' || ext === '.svg' || ext === '.gif') return localFile;
  if (!['.png', '.jpg', '.jpeg'].includes(ext)) return localFile;
  const webpPath = localFile.replace(/\.(png|jpg|jpeg)$/i, '.webp');
  if (existsSync(webpPath)) {
    console.log(`  · 기존 WebP 사용: ${path.basename(webpPath)}`);
    return webpPath;
  }
  console.log(`  · WebP 변환: ${path.basename(localFile)} → ${path.basename(webpPath)}`);
  await sharp(localFile).webp({ quality: 85, effort: 6 }).toFile(webpPath);
  return webpPath;
}

// WP /media POST + S3 동일 path cp.
// WP는 wp-content/uploads/{yyyy}/{mm}/{filename} 경로로 저장하지만 S3 자동 sync가 없어
// origin host URL이 반환된다. 같은 path로 S3에 cp하면 assets.helpsns.com에서도
// 동일 URL 패턴으로 접근 가능 → SSG의 normalizeUrl()이 origin host → assets.helpsns.com 매핑하면
// jetpack_featured_media_url과 본문 src 모두 일관되게 동작.
async function uploadToWPMedia(localFileInput, { title = '', alt = '', caption = '' } = {}) {
  const localFile = await ensureWebp(localFileInput);
  const buf = await readFile(localFile);
  const filename = path.basename(localFile);
  const mime = mimeFor(localFile);
  const res = await fetch(`${BASE}/media`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${TOKEN}`,
      'Content-Type': mime,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
    body: buf,
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`WP /media POST 실패 HTTP ${res.status}: ${err.slice(0, 500)}`);
  }
  const created = await res.json();
  // 메타 갱신 (alt_text·title·caption은 별도 PATCH 필요)
  if (alt || title || caption) {
    const patchRes = await fetch(`${BASE}/media/${created.id}`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ alt_text: alt, title, caption }),
    });
    if (!patchRes.ok) {
      console.warn(`  ⚠ media PATCH 실패 (메타 누락): id=${created.id}`);
    }
  }
  // WP가 알려준 source_url의 path를 그대로 S3에 cp (URL 패턴 일치)
  const srcUrl = created.source_url || '';
  const urlPath = srcUrl.replace(/^https?:\/\/[^/]+/, ''); // /wp-content/uploads/2026/05/0-hero.png
  if (urlPath) {
    const s3Key = urlPath.replace(/^\//, ''); // wp-content/uploads/2026/05/0-hero.png
    execFileSync(
      'aws',
      [
        's3',
        'cp',
        localFile,
        `s3://${S3_BUCKET}/${s3Key}`,
        '--content-type',
        mime,
        '--cache-control',
        'public, max-age=31536000, immutable',
      ],
      { stdio: 'inherit' },
    );
    const cdnUrl = `https://${CF_DOMAIN}${urlPath}`;
    return { id: created.id, url: cdnUrl, source_url: created.source_url };
  }
  // urlPath 추출 실패 시 fallback: 별도 prefix로 cp
  const fallbackUrl = uploadToS3(localFile, mime);
  return { id: created.id, url: fallbackUrl, source_url: created.source_url };
}

console.log(`▶ draft 로드: ${draftPath}`);
const { meta, body } = parseFile(await readFile(draftPath, 'utf8'));

if (!meta._draft) {
  console.error('frontmatter._draft 가 없습니다. write 단계(blog/write.md)로 생성된 draft만 처리합니다.');
  process.exit(1);
}

// 100점 게이트: frontmatter _audit_score < 100이면 발행 차단.
// audit 단계(blog/audit.md) Phase 6.5가 frontmatter에 _audit_score를 기록한다.
// cron 자동 모드(`/blog create auto`)는 100 도달까지 무제한 audit-write 보강 후 publish 재시도.
// 우회 불가. snshelp 100점 통과 정책 (publish 단계 blog/publish.md §1.5).
const auditScore = typeof meta._audit_score === 'number' ? meta._audit_score : null;
if (auditScore === null) {
  console.error('✗ 100점 게이트 차단: frontmatter._audit_score 누락');
  console.error('  audit 단계(blog/audit.md) 미실행 또는 Phase 6.5 frontmatter 갱신 누락. 발행 중단.');
  console.error('  해결: /blog audit <draft|post-id> 먼저 실행');
  process.exit(2);
}
if (auditScore < 100) {
  console.error(`✗ 100점 게이트 차단: _audit_score=${auditScore} < 100`);
  console.error('  snshelp 100점 통과 정책. audit 단계(blog/audit.md) Top 5 개선안으로 write 단계(blog/write.md) 보강 → audit 재실행 후 재시도.');
  console.error('  cron 자동 모드는 100 도달까지 무제한 audit-write 루프.');
  process.exit(2);
}

// 1. 이미지 업로드 (WP /media POST → media id + assets.helpsns.com URL) + placeholder 치환
// _draft.images[N].featured = true 또는 _draft.images[0]을 featured_media로 자동 지정.
const images = meta._draft.images || [];

// 이미지 게이트: hero 1장 + 본문 보조 2장 이상 = 최소 3장.
// asset-images §4.8.2 (hero 고정) + §4.8.4 (≥ 3장 hard gate, hero 1 + 본문 ≥ 2).
// 모든 모드 동일 적용. 텍스트 전용 페이지(About·정책)도 예외 없음. SKIP_IMAGE_GATE 우회 불가.
if (images.length < 3) {
  console.error(`✗ 이미지 게이트 차단: _draft.images=${images.length}장, 필요=3장 이상`);
  console.error('  asset-images §4.8.4: hero 1장(featured: true) + 본문 보조 2장 이상 필수.');
  console.error('  write 단계(blog/write.md) Phase 5 (이미지 생성) 미수행 또는 frontmatter 누락. 발행 중단.');
  process.exit(2);
}

// 인포그래픽 dim·중복 게이트 (audit-script-loop.md §6.4): 발행 전 로컬 webp 측정.
// 가로형 깨짐(ratio > 1.6)·md5 중복 이미지를 발행 전 차단. 발행 후 CDN 재검증은 워크플로가 수행한다.
// hero(가로 16:9)는 파일명에 infographic/chart 없으면 photo로 분류돼 dim 게이트 면제.
{
  const gateImages = images
    .map((img) => path.resolve(ROOT, img.file))
    .filter((f) => existsSync(f));
  if (gateImages.length > 0) {
    const gateScript = path.join(ROOT, 'script', 'audit-cdn-gate.mjs');
    console.log('▶ 인포그래픽 dim·중복 게이트 (로컬)...');
    try {
      execFileSync(process.execPath, [gateScript, '--source=local', `--images=${gateImages.join(',')}`], { stdio: 'inherit' });
    } catch {
      console.error('✗ 발행 차단: 인포그래픽 게이트 미통과 (가로형 깨짐 ratio > 1.6 또는 md5 중복).');
      console.error('  위 결함을 세로형 재렌더 또는 중복 제거로 수정 후 재시도. audit-script-loop.md §6.4.');
      process.exit(2);
    }
  }
}

let processedBody = body;
const uploaded = [];
let autoFeaturedId = 0;

// draft CDN URL 직접 삽입 차단 (validator 통과 후 방어선)
if (processedBody.includes('wp-content/drafts/images/')) {
  console.error('✗ 발행 차단: 본문에 wp-content/drafts/images/ URL 직접 삽입됨');
  console.error('  [[IMG:N]] placeholder 대신 실제 경로 사용. write 단계(blog/write.md) 재실행 필요.');
  process.exit(2);
}

for (let i = 0; i < images.length; i++) {
  const img = images[i];
  const localFile = path.resolve(ROOT, img.file);
  if (!existsSync(localFile)) {
    console.error(`✗ 이미지 파일 없음: ${localFile}`);
    process.exit(1);
  }
  console.log(`▶ 이미지 업로드 [${i + 1}/${images.length}] ${img.file} → WP /media`);
  let mediaInfo;
  try {
    mediaInfo = await uploadToWPMedia(localFile, {
      title: img.title || img.alt || '',
      alt: img.alt || '',
      caption: img.caption || '',
    });
  } catch (e) {
    console.error(`✗ WP /media 업로드 실패: ${e.message}`);
    // Fallback: S3 직접 업로드 (featured_media는 못 잡음)
    console.warn('  ⚠ S3 직접 업로드 fallback (featured_media 미연결)');
    const fallbackUrl = uploadToS3(localFile, mimeFor(localFile));
    mediaInfo = { id: 0, url: fallbackUrl };
  }
  // featured 지정: 명시 플래그 우선, 없으면 첫 이미지
  if ((img.featured === true || (autoFeaturedId === 0 && i === 0)) && mediaInfo.id) {
    autoFeaturedId = mediaInfo.id;
  }
  const altAttr = (img.alt || '').replace(/"/g, '&quot;');
  const captionHtml = img.caption ? `<figcaption class="wp-element-caption">${img.caption}</figcaption>` : '';
  const imgClass = mediaInfo.id ? ` class="wp-image-${mediaInfo.id}"` : '';
  const imgTag = `<!-- wp:image ${mediaInfo.id ? `{"id":${mediaInfo.id},"sizeSlug":"large","linkDestination":"none"}` : '{"sizeSlug":"large"}'} -->
<figure class="wp-block-image size-large"><img src="${mediaInfo.url}" alt="${altAttr}"${imgClass}/>${captionHtml}</figure>
<!-- /wp:image -->`;
  const isHero = img.role === 'hero' || img.purpose === 'hero' || img.featured === true
    || (autoFeaturedId === 0 && i === 0 && !images.some((m) => m.role === 'hero' || m.featured === true));
  const placeholder = `[[IMG:${i}]]`;

  if (isHero) {
    if (processedBody.includes(placeholder)) {
      console.error(`✗ 발행 차단: hero 이미지(index=${i}) [[IMG:${i}]] 본문 삽입 금지 — featured_media 전용`);
      process.exit(2);
    }
    // hero는 featured_media로만 사용, 본문에 넣지 않음
  } else {
    if (!processedBody.includes(placeholder)) {
      console.error(`✗ 발행 차단: body 이미지(index=${i}) placeholder [[IMG:${i}]] 본문에 없음`);
      console.error('  draft URL 직접 삽입 또는 placeholder 누락. write 단계(blog/write.md) 재실행 필요.');
      process.exit(2);
    }
    processedBody = processedBody.split(placeholder).join(imgTag);
  }
  uploaded.push({ ...img, ...mediaInfo });
}

// nested figure 자동 flatten (placeholder가 부모 figure 안에 있던 경우 방지)
// <figure>(wp:image comment?)<figure>...</figure>(/wp:image?)(<figcaption>...</figcaption>)?</figure>
// → 내부 figure만 유지
const nestedRe = /<figure[^>]*>(?:\s*<!--\s*wp:image[^>]*-->\s*)?(<figure[^>]*>[\s\S]*?<\/figure>)\s*(?:<!--\s*\/wp:image\s*-->\s*)?(?:<figcaption[^>]*>[\s\S]*?<\/figcaption>)?\s*<\/figure>/g;
const before = processedBody.length;
processedBody = processedBody.replace(nestedRe, '$1');
if (processedBody.length !== before) {
  console.log(`  · nested figure flatten: ${before - processedBody.length}자 제거`);
}

// 2. WordPress POST /posts
console.log('▶ WordPress 신규 글 발행');
const payload = {
  title: meta.title,
  content: processedBody,
  excerpt: meta.excerpt ?? '',
  slug: meta.slug,
  status,
  format: meta.format ?? 'standard',
};
if (meta.categories?.length) payload.categories = meta.categories;
if (meta.tags?.length) payload.tags = meta.tags;
if (meta.author) payload.author = meta.author;

// featured_media 우선순위: (1) meta.featured_media 명시값, (2) autoFeaturedId (업로드한 첫 이미지)
if (meta.featured_media) {
  payload.featured_media = meta.featured_media;
} else if (autoFeaturedId) {
  payload.featured_media = autoFeaturedId;
  console.log(`▶ featured_media 자동 지정: ${autoFeaturedId} (업로드한 첫 이미지)`);
}

const res = await fetch(`${BASE}/posts`, {
  method: 'POST',
  headers: HEADERS,
  body: JSON.stringify(payload),
});
if (!res.ok) {
  const errBody = await res.text().catch(() => '');
  console.error(`✗ 발행 실패 HTTP ${res.status}\n${errBody.slice(0, 800)}`);
  process.exit(1);
}
const created = await res.json();
console.log(`✓ 발행 완료 id=${created.id} status=${created.status} link=${created.link}`);

// 3. 로컬 draft → 정상 파일로 이동
const newPath = path.join(POSTS_DIR, `${created.id}.md`);
// link 필드는 WP origin URL 정규화 (운영 helpsns.com 도메인으로)
const PUBLIC_BLOG_HOST = 'https://www.helpsns.com';
const normalizedLink = created.slug
  ? `${PUBLIC_BLOG_HOST}/blog/${created.slug}/`
  : created.link;

const newMeta = {
  id: created.id,
  slug: created.slug,
  status: created.status,
  date: created.date,
  date_gmt: created.date_gmt,
  modified: created.modified,
  modified_gmt: created.modified_gmt,
  author: created.author,
  featured_media: created.featured_media,
  sticky: created.sticky,
  format: created.format,
  categories: created.categories,
  tags: created.tags,
  link: normalizedLink,
  title: meta.title,
  excerpt: meta.excerpt ?? '',
};

// audit·cluster 마커 보존 (publish 후 frontmatter에서 사라지지 않도록)
// 정본: .ai-rules/referral-cluster.md §2.1 / .claude/skills/blog/audit.md Phase 6.5
const PRESERVE_FIELDS = [
  '_audit_score',
  '_audit_at',
  '_audit_cycles',
  '_referral_cluster',
  '_referral_cluster_seed_id',
  '_draft', // 보존 옵션 (publish 후엔 의미 약하지만 디버그용)
];
for (const key of PRESERVE_FIELDS) {
  if (meta[key] !== undefined && meta[key] !== null) {
    newMeta[key] = meta[key];
  }
}
await writeFile(newPath, buildFile(newMeta, processedBody));
console.log(`✓ 로컬 파일 생성: ${newPath}`);

// draft 파일은 .recycle/로 (룰: 삭제 금지)
const recycleDir = path.join(ROOT, '.recycle', 'drafts');
await mkdir(recycleDir, { recursive: true });
const recycledDraft = path.join(recycleDir, path.basename(draftPath));
await rename(draftPath, recycledDraft);
console.log(`✓ draft 보관: ${recycledDraft}`);

console.log(`\n발행 완료. status=${status}`);
if (status === 'draft') {
  console.log('WP 관리자에서 미리보기 후 publish로 전환하세요.');
}
