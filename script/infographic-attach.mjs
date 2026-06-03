#!/usr/bin/env node
// 기존 글({id}.md)에 인포그래픽 1장을 첨부.
// 1) WP /media POST → media id + source_url 받음
// 2) 같은 path로 S3 cp (assets.helpsns.com 정합성)
// 3) CloudFront invalidation
// 4) 글 본문의 첫 wp:list (TL;DR) 뒤에 wp:image 블록 삽입
// 5) wp-push.mjs --force 로 푸시
//
// 사용:
//   node --env-file=.env script/infographic-attach.mjs \
//     --id=158 --file=wp-content/drafts/images/youtube-stats-2026/infographic.webp \
//     --alt="..." --caption="..."

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync, execSync } from 'node:child_process';
import path from 'node:path';
import sharp from 'sharp';

const BASE = process.env.WORDPRESS_BLOG_URL;
const TOKEN = process.env.WORDPRESS_BLOG_TOKEN;
const S3_BUCKET = process.env.S3_BUCKET;
const CF_DOMAIN = process.env.CLOUDFRONT_DOMAIN;
const CF_DIST_ID = 'E3EIN06IFGMYRE';

if (!BASE || !TOKEN || !S3_BUCKET || !CF_DOMAIN) {
  console.error('환경변수 누락: WORDPRESS_BLOG_URL, WORDPRESS_BLOG_TOKEN, S3_BUCKET, CLOUDFRONT_DOMAIN');
  process.exit(1);
}

const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
    const eq = a.indexOf('=');
    return [a.slice(2, eq), a.slice(eq + 1)];
  }),
);

const id = args.id;
const filePath = args.file;
const alt = args.alt || '';
const caption = args.caption || '';

if (!id || !filePath) {
  console.error('사용: --id=158 --file=path.webp --alt="..." --caption="..."');
  process.exit(1);
}

const ROOT = path.resolve(import.meta.dirname, '..');
const POSTS_DIR = path.join(ROOT, 'wp-content', 'posts');
const postFile = path.join(POSTS_DIR, `${id}.md`);
if (!existsSync(postFile)) {
  console.error(`✗ post 없음: ${postFile}`);
  process.exit(1);
}

const localFile = path.resolve(ROOT, filePath);
if (!existsSync(localFile)) {
  console.error(`✗ 이미지 없음: ${localFile}`);
  process.exit(1);
}

// dimension 측정
const meta = await sharp(localFile).metadata();
const width = meta.width;
const height = meta.height;
console.log(`▶ image: ${path.basename(localFile)} ${width}×${height}`);

// 1. WP /media POST
const buf = await readFile(localFile);
const filename = path.basename(localFile);
console.log(`▶ WP /media POST`);
const mediaRes = await fetch(`${BASE}/media`, {
  method: 'POST',
  headers: {
    Authorization: `Basic ${TOKEN}`,
    'Content-Type': 'image/webp',
    'Content-Disposition': `attachment; filename="${filename}"`,
  },
  body: buf,
});
if (!mediaRes.ok) {
  console.error(`✗ /media POST 실패 ${mediaRes.status}: ${(await mediaRes.text()).slice(0, 500)}`);
  process.exit(1);
}
const media = await mediaRes.json();
console.log(`  · media id=${media.id} source_url=${media.source_url}`);

// 메타 갱신 (alt_text, title, caption)
if (alt || caption) {
  const patchRes = await fetch(`${BASE}/media/${media.id}`, {
    method: 'POST',
    headers: { Authorization: `Basic ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ alt_text: alt, title: alt, caption }),
  });
  if (!patchRes.ok) console.warn(`  ⚠ media PATCH 실패: ${patchRes.status}`);
}

// 2. S3 cp same path
const urlPath = media.source_url.replace(/^https?:\/\/[^/]+/, ''); // /wp-content/uploads/YYYY/MM/file.webp
const s3Key = urlPath.replace(/^\//, '');
console.log(`▶ S3 cp s3://${S3_BUCKET}/${s3Key}`);
execFileSync(
  'aws',
  ['s3', 'cp', localFile, `s3://${S3_BUCKET}/${s3Key}`, '--content-type', 'image/webp', '--cache-control', 'public, max-age=31536000, immutable'],
  { stdio: 'inherit' },
);

// 3. CloudFront invalidation (덮어쓰기 안전)
console.log(`▶ CloudFront invalidation ${urlPath}`);
try {
  execFileSync(
    'aws',
    ['cloudfront', 'create-invalidation', '--distribution-id', CF_DIST_ID, '--paths', urlPath],
    { stdio: 'pipe' },
  );
} catch (e) {
  console.warn(`  ⚠ invalidation 실패 (계속): ${e.message}`);
}

// CDN URL
const cdnUrl = `https://${CF_DOMAIN}${urlPath}`;
console.log(`  · CDN: ${cdnUrl}`);

// 4. 본문 inject
const txt = await readFile(postFile, 'utf8');
const m = txt.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
if (!m) {
  console.error('✗ frontmatter 파싱 실패');
  process.exit(1);
}
const fm = JSON.parse(m[1]);
let body = m[2].replace(/\n$/, '');

// 이미 인포그래픽이 삽입돼 있으면 skip (멱등성)
if (body.includes(cdnUrl)) {
  console.log(`  · 이미 본문에 존재 — skip inject`);
} else {
  const altEsc = alt.replace(/"/g, '&quot;');
  const imgBlock = `<!-- wp:image {"id":${media.id},"sizeSlug":"large","linkDestination":"none"} -->
<figure class="wp-block-image size-large"><img src="${cdnUrl}" alt="${altEsc}" class="wp-image-${media.id}" width="${width}" height="${height}"/><figcaption class="wp-element-caption">${caption}</figcaption></figure>
<!-- /wp:image -->`;

  // 첫 번째 wp:list 종료(`<!-- /wp:list -->`) 직후 삽입
  // TL;DR 리스트가 첫 wp:list. 못 찾으면 첫 wp:heading 직전.
  const listEnd = body.indexOf('<!-- /wp:list -->');
  if (listEnd >= 0) {
    const insertAt = listEnd + '<!-- /wp:list -->'.length;
    body = body.slice(0, insertAt) + '\n\n' + imgBlock + body.slice(insertAt);
    console.log(`  · 본문 삽입 위치: 첫 wp:list 직후`);
  } else {
    const h1End = body.indexOf('<!-- /wp:heading -->');
    if (h1End >= 0) {
      const insertAt = h1End + '<!-- /wp:heading -->'.length;
      body = body.slice(0, insertAt) + '\n\n' + imgBlock + body.slice(insertAt);
      console.log(`  · 본문 삽입 위치: 첫 wp:heading 직후 (wp:list 없음)`);
    } else {
      body = imgBlock + '\n\n' + body;
      console.log(`  · 본문 삽입 위치: 본문 최상단 (fallback)`);
    }
  }
}

const newText = `---\n${JSON.stringify(fm, null, 2)}\n---\n${body}\n`;
await writeFile(postFile, newText);
console.log(`✓ ${postFile} 갱신`);

// 5. wp-push.mjs --force
console.log(`▶ wp-push.mjs ${id} --force`);
execSync(`node --env-file=.env script/wp-push.mjs ${id} --force`, { cwd: ROOT, stdio: 'inherit' });

console.log(`\n✓ 완료 id=${id} media=${media.id} url=${cdnUrl}`);
console.log(`MEDIA_ID=${media.id} URL=${cdnUrl} WIDTH=${width} HEIGHT=${height}`);
