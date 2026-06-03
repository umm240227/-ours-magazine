#!/usr/bin/env node
// 인포그래픽 WebP를 WP /media에 등록 + S3 cp + CloudFront invalidation.
// 사용:
//   node --env-file=.env script/upload-infographic.mjs <postId> <webpPath> [alt]
//   node --env-file=.env script/upload-infographic.mjs 104 wp-content/drafts/images/post-104/infographic.webp "인스타 SEO 4단계 인포그래픽"
// 출력: stdout JSON { id, source_url, width, height }

import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const BASE = process.env.WORDPRESS_BLOG_URL;
const TOKEN = process.env.WORDPRESS_BLOG_TOKEN;
const S3_BUCKET = process.env.S3_BUCKET;
const CF_DOMAIN = process.env.CLOUDFRONT_DOMAIN;
const CF_DIST_ID = 'E3EIN06IFGMYRE';

if (!BASE || !TOKEN || !S3_BUCKET) {
  console.error('환경변수 누락: WORDPRESS_BLOG_URL, WORDPRESS_BLOG_TOKEN, S3_BUCKET');
  process.exit(1);
}

const [postId, webpPath, altRaw] = process.argv.slice(2);
if (!postId || !webpPath) {
  console.error('사용: upload-infographic.mjs <postId> <webpPath> [alt]');
  process.exit(1);
}

const alt = altRaw || `인포그래픽 ${postId}`;
const filename = path.basename(webpPath).replace(/\.webp$/, '') + `-${postId}.webp`;
const yyyy = new Date().getFullYear();
const mm = String(new Date().getMonth() + 1).padStart(2, '0');

const buf = await readFile(webpPath);
const meta = await sharp(buf).metadata();
const width = meta.width;
const height = meta.height;
console.log(`▶ ${webpPath} (${width}×${height}, ${(buf.length / 1024).toFixed(0)}KB)`);

// 1. WP /media POST
console.log(`▶ WP /media POST as ${filename}`);
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
  const t = await mediaRes.text();
  console.error(`✗ WP /media 실패 HTTP ${mediaRes.status}\n${t.slice(0, 500)}`);
  process.exit(1);
}
const media = await mediaRes.json();
const mediaId = media.id;
const sourceUrl = media.source_url; // origin host URL
console.log(`  WP media id=${mediaId}, source_url=${sourceUrl}`);

// 2. alt_text 설정
await fetch(`${BASE}/media/${mediaId}`, {
  method: 'POST',
  headers: {
    Authorization: `Basic ${TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ alt_text: alt, title: alt }),
});

// source_url에서 wp-content/uploads/YYYY/MM/FILENAME 추출
// (URL 파서가 origin host를 받지 못하는 경우가 있어 임시 호스트로 치환 후 pathname만 사용)
const urlPath = new URL(sourceUrl.replace('52.79.247.124', 'placeholder.com')).pathname;
// /wp-content/uploads/2026/05/xxx.webp
const s3Key = urlPath.replace(/^\//, ''); // wp-content/uploads/...
console.log(`▶ S3 cp s3://${S3_BUCKET}/${s3Key}`);
execFileSync('aws', [
  's3', 'cp', webpPath, `s3://${S3_BUCKET}/${s3Key}`,
  '--content-type', 'image/webp',
  '--cache-control', 'public,max-age=2592000',
], { stdio: 'pipe' });

// 3. CloudFront invalidation
const cfPath = '/' + s3Key;
console.log(`▶ CloudFront invalidation ${cfPath}`);
execFileSync('aws', [
  'cloudfront', 'create-invalidation',
  '--distribution-id', CF_DIST_ID,
  '--paths', cfPath,
], { stdio: 'pipe' });

// 4. 검증: assets.helpsns.com URL HTTP 200
const cdnUrl = `https://${CF_DOMAIN || 'assets.helpsns.com'}/${s3Key}`;
console.log(`▶ 검증 ${cdnUrl}`);
let ok = false;
for (let i = 0; i < 6; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  try {
    const r = await fetch(cdnUrl, { method: 'HEAD' });
    if (r.ok) { ok = true; break; }
  } catch {}
}
if (!ok) console.warn(`⚠ ${cdnUrl} 아직 200 응답 안 옴 (캐시 전파 지연 가능)`);

const result = { id: mediaId, source_url: cdnUrl, width, height, alt, filename, s3Key };
console.log('---RESULT---');
console.log(JSON.stringify(result, null, 2));
