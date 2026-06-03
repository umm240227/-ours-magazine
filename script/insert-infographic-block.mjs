#!/usr/bin/env node
// wp-content/posts/{id}.md 본문 TL;DR 직후에 wp:image 인포그래픽 블록을 삽입.
// 이미 삽입돼 있으면(같은 media id 발견) skip.
//
// 사용:
//   node script/insert-infographic-block.mjs <postId> <mediaId> <sourceUrl> <width> <height> <alt>
//
// TL;DR 직후 = 첫 <ul>...</ul> 블록 (wp:list) 또는 "한눈에 보는" 강조 H2 다음 list.
// 본 글들은 모두 첫 <ul>이 TL;DR. 그 블록 직후 wp:image 삽입.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [postId, mediaId, sourceUrl, width, height, ...altWords] = process.argv.slice(2);
if (!postId || !mediaId || !sourceUrl) {
  console.error('사용: insert-infographic-block.mjs <postId> <mediaId> <sourceUrl> <width> <height> <alt>');
  process.exit(1);
}
const alt = altWords.join(' ');

const ROOT = path.resolve(import.meta.dirname, '..');
const file = path.join(ROOT, 'wp-content/posts', `${postId}.md`);
const txt = await readFile(file, 'utf8');
const m = txt.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
if (!m) { console.error('frontmatter 파싱 실패'); process.exit(1); }
let body = m[2];

// 이미 같은 media id wp:image 가 있으면 skip
if (body.includes(`"id":${mediaId}`) || body.includes(`wp-image-${mediaId}`)) {
  console.log(`✓ ${postId}: 이미 media id ${mediaId} 본문에 존재. skip`);
  process.exit(0);
}

const imgBlock = `

<!-- wp:image {"id":${mediaId},"sizeSlug":"full","linkDestination":"none","className":"infographic-summary"} -->
<figure class="wp-block-image size-full infographic-summary"><img src="${sourceUrl}" alt="${alt}" class="wp-image-${mediaId}" width="${width}" height="${height}" loading="lazy" decoding="async"/></figure>
<!-- /wp:image -->
`;

// TL;DR 패턴 1: <!-- wp:list --> ... <!-- /wp:list --> 첫 번째 (대부분 글)
// 패턴 2: 주석 없는 첫 </ul> (1556, 1577처럼 wp:list 주석 없는 글)
let insertAt = -1;
const tldrEnd1 = body.indexOf('<!-- /wp:list -->');
const tldrEnd2 = body.indexOf('</ul>');
if (tldrEnd1 !== -1) {
  insertAt = tldrEnd1 + '<!-- /wp:list -->'.length;
} else if (tldrEnd2 !== -1) {
  insertAt = tldrEnd2 + '</ul>'.length;
} else {
  console.error(`✗ ${postId}: TL;DR 끝(<!-- /wp:list --> 또는 </ul>) 못 찾음`);
  process.exit(1);
}
body = body.slice(0, insertAt) + imgBlock + body.slice(insertAt);

const meta = JSON.parse(m[1]);
const newFile = `---\n${JSON.stringify(meta, null, 2)}\n---\n${body}`;
await writeFile(file, newFile);
console.log(`✓ ${postId}: 인포그래픽 wp:image 블록 삽입 완료 (media ${mediaId}, ${width}×${height})`);
