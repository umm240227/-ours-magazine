#!/usr/bin/env node
// 한 글의 인포그래픽 전체 워크플로우 실행:
//   1. HTML render → WebP (이미 있으면 skip 옵션)
//   2. WP /media POST + S3 cp + CloudFront invalidation
//   3. 본문 wp:image 블록 TL;DR 직후 삽입
//   4. wp-push --force
//
// 사용:
//   node --env-file=.env script/process-infographic.mjs <postId> "<alt>"
// 사전: wp-content/drafts/images/post-{id}/infographic.html 작성돼 있어야 함

import { execSync, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const [postId, ...altWords] = process.argv.slice(2);
if (!postId) {
  console.error('사용: process-infographic.mjs <postId> "<alt>"');
  process.exit(1);
}
const alt = altWords.join(' ') || `인포그래픽 ${postId}`;

const ROOT = path.resolve(import.meta.dirname, '..');
const dir = path.join(ROOT, `wp-content/drafts/images/post-${postId}`);
const htmlPath = path.join(dir, 'infographic.html');
const webpPath = path.join(dir, 'infographic.webp');

if (!existsSync(htmlPath)) {
  console.error(`✗ ${htmlPath} 없음`);
  process.exit(1);
}

// 1. render
console.log(`\n========= POST ${postId} =========`);
execSync(`node script/render-infographic.mjs "${htmlPath}" "${webpPath}"`, { stdio: 'inherit' });

// 2. upload — stdout에서 JSON 파싱
const uploadOut = execSync(
  `node --env-file=.env script/upload-infographic.mjs ${postId} "${webpPath}" "${alt}"`,
  { encoding: 'utf8' }
);
process.stdout.write(uploadOut);
const jsonMatch = uploadOut.match(/---RESULT---\n([\s\S]+)$/);
if (!jsonMatch) { console.error('업로드 결과 JSON 못 찾음'); process.exit(1); }
const result = JSON.parse(jsonMatch[1]);

// 3. 본문 wp:image 삽입
execSync(
  `node script/insert-infographic-block.mjs ${postId} ${result.id} "${result.source_url}" ${result.width} ${result.height} "${alt}"`,
  { stdio: 'inherit' }
);

// 4. wp-push --force
execSync(`node --env-file=.env script/wp-push.mjs ${postId} --force`, { stdio: 'inherit' });

console.log(`\n✓ POST ${postId} 인포그래픽 발행 완료 (media ${result.id})`);
