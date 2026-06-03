#!/usr/bin/env node
// 인포그래픽 배치 처리 헬퍼.
// Usage: node script/infographic-batch.mjs <postId> <slug> <filename> <webpPath>

import { execSync } from 'node:child_process';
import { statSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const [postId, slug, filename, webpPath] = process.argv.slice(2);

if (!postId || !filename || !webpPath) {
  console.error('Usage: infographic-batch.mjs <postId> <slug> <filename> <webpPath>');
  process.exit(1);
}

const WP_URL = process.env.WORDPRESS_BLOG_URL;
const WP_TOKEN = process.env.WORDPRESS_BLOG_TOKEN;
const S3_BUCKET = process.env.S3_BUCKET || 'snshelp-resource-bucket';
const CDN = 'https://assets.helpsns.com';

if (!WP_URL || !WP_TOKEN) {
  console.error('환경변수 누락: WORDPRESS_BLOG_URL, WORDPRESS_BLOG_TOKEN');
  process.exit(1);
}

const fullPath = path.resolve(webpPath);
statSync(fullPath);

const meta = await sharp(fullPath).metadata();
const { width, height } = meta;
console.log(`[${postId}] dimension: ${width}×${height}`);

if (width > 2000 || height > 2000) {
  console.error(`[${postId}] dim 초과`);
  process.exit(1);
}

console.log(`[${postId}] WP media upload: ${filename}`);
const respStr = execSync(
  `curl -s -X POST "${WP_URL}/media" \
    -H "Authorization: Basic ${WP_TOKEN}" \
    -H "Content-Disposition: attachment; filename=${filename}" \
    -H "Content-Type: image/webp" \
    --data-binary @"${fullPath}"`,
  { maxBuffer: 50 * 1024 * 1024 },
).toString();

let mediaResp;
try {
  const sanitized = respStr.replace(/[\x00-\x1F]/g, ' ');
  mediaResp = JSON.parse(sanitized);
} catch (e) {
  console.error(`[${postId}] JSON parse fail. Raw:`, respStr.slice(0, 500));
  process.exit(1);
}

if (!mediaResp.id) {
  console.error(`[${postId}] media upload fail:`, mediaResp);
  process.exit(1);
}

const mediaId = mediaResp.id;
const wpSlug = mediaResp.slug;
const actualFilename = `${wpSlug}.webp`;
console.log(`[${postId}] media id=${mediaId} slug=${wpSlug}`);

const s3Key = `wp-content/uploads/2026/05/${actualFilename}`;
console.log(`[${postId}] S3 cp → s3://${S3_BUCKET}/${s3Key}`);
execSync(
  `aws s3 cp "${fullPath}" "s3://${S3_BUCKET}/${s3Key}" \
    --content-type image/webp --cache-control "public,max-age=2592000"`,
  { stdio: 'pipe' },
);

const cdnUrl = `${CDN}/${s3Key}`;
const headResp = execSync(`curl -sI "${cdnUrl}" | head -1`).toString().trim();
console.log(`  ${headResp}`);

mkdirSync('tmp/infographic', { recursive: true });
const result = {
  postId: Number(postId),
  slug,
  mediaId,
  cdnUrl,
  width,
  height,
  filename: actualFilename,
};
writeFileSync(`tmp/infographic/${postId}.json`, JSON.stringify(result, null, 2));
console.log(`\n[${postId}] SUCCESS`);
console.log(JSON.stringify(result));
