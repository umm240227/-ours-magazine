#!/usr/bin/env node
// WordPress 글 전체를 로컬 wp-content/posts/{id}.md 로 동기화
// 사용: node --env-file=.env script/wp-pull.mjs [--since=ISO|--id=N]

import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const BASE = process.env.WORDPRESS_BLOG_URL;
const TOKEN = process.env.WORDPRESS_BLOG_TOKEN;
if (!BASE || !TOKEN) {
  console.error('환경변수 WORDPRESS_BLOG_URL, WORDPRESS_BLOG_TOKEN 필요');
  process.exit(1);
}

const HEADERS = { Authorization: `Basic ${TOKEN}` };
const ROOT = path.resolve(import.meta.dirname, '..');
const POSTS_DIR = path.join(ROOT, 'wp-content', 'posts');
const PAGES_DIR = path.join(ROOT, 'wp-content', 'pages');
const META_DIR = path.join(ROOT, 'wp-content');

// CLI 인자
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);

// frontmatter용 메타 필드 (push에 필요한 것만 보관)
const META_FIELDS = [
  'id',
  'slug',
  'status',
  'date',
  'date_gmt',
  'modified',
  'modified_gmt',
  'author',
  'featured_media',
  'sticky',
  'format',
  'categories',
  'tags',
  'link',
];

async function fetchJSON(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${url}\n${body.slice(0, 500)}`);
  }
  return { data: await res.json(), headers: res.headers };
}

async function fetchAll(endpoint, extraParams = {}) {
  const params = new URLSearchParams({
    per_page: '100',
    context: 'edit',
    ...extraParams,
  });
  const first = await fetchJSON(`${BASE}/${endpoint}?${params}&page=1`);
  const totalPages = parseInt(first.headers.get('x-wp-totalpages') || '1', 10);
  const all = [...first.data];
  for (let page = 2; page <= totalPages; page++) {
    const { data } = await fetchJSON(`${BASE}/${endpoint}?${params}&page=${page}`);
    all.push(...data);
    process.stdout.write(`\r  ${endpoint} page ${page}/${totalPages} (${all.length}개)   `);
  }
  if (totalPages > 1) process.stdout.write('\n');
  return all;
}

// 본문에 박힌 이미지 src도 _media.json과 동일한 정규화 적용 (CDN 도메인 통일).
// `link` 필드 등 admin URL 메타는 건드리지 않음 (frontmatter에만 영향, 노출 안 됨).
function normalizeBody(body) {
  if (!body) return body;
  return body
    .replace(/https?:\/\/d14icj3tspgnn2\.cloudfront\.net/g, 'https://assets.helpsns.com')
    .replace(/https?:\/\/[\w.-]+\.s3\.[\w.-]+\.amazonaws\.com/g, 'https://assets.helpsns.com')
    .replace(/https?:\/\/52\.79\.247\.124\/wp-content\/uploads/g, 'https://assets.helpsns.com');
}

function buildFile(post) {
  const meta = {};
  for (const k of META_FIELDS) meta[k] = post[k];
  meta.title = post.title?.raw ?? '';
  meta.excerpt = post.excerpt?.raw ?? '';
  const body = normalizeBody(post.content?.raw ?? '');
  // JSON frontmatter: 파싱·작성 안전, 한국어 title의 quote 이슈 없음
  return `---\n${JSON.stringify(meta, null, 2)}\n---\n${body}\n`;
}

async function syncTaxonomy() {
  console.log('▶ taxonomy 동기화');
  const cats = await fetchAll('categories', { context: 'view' });
  const tags = await fetchAll('tags', { context: 'view' });
  const dict = {
    categories: Object.fromEntries(cats.map((c) => [c.id, { name: c.name, slug: c.slug }])),
    tags: Object.fromEntries(tags.map((t) => [t.id, { name: t.name, slug: t.slug }])),
  };
  await writeFile(path.join(META_DIR, '_taxonomy.json'), JSON.stringify(dict, null, 2) + '\n');
  console.log(`  카테고리 ${cats.length}개, 태그 ${tags.length}개`);
}

async function syncContent(endpoint, dir, label) {
  console.log(`▶ ${label} 동기화`);
  const items = await fetchAll(endpoint, { status: 'any' });
  console.log(`  총 ${items.length}개 수신`);

  const existing = new Map();
  if (existsSync(dir)) {
    for (const f of await readdir(dir)) {
      if (!f.endsWith('.md')) continue;
      try {
        const raw = await readFile(path.join(dir, f), 'utf8');
        const m = raw.match(/^---\n([\s\S]*?)\n---\n/);
        if (m) existing.set(parseInt(f, 10), JSON.parse(m[1]).modified_gmt);
      } catch {}
    }
  }

  let written = 0;
  let skipped = 0;
  for (const item of items) {
    if (existing.get(item.id) === item.modified_gmt) {
      skipped++;
      continue;
    }
    await writeFile(path.join(dir, `${item.id}.md`), buildFile(item));
    written++;
  }
  console.log(`  저장 ${written}개, 변경없음 ${skipped}개`);
}

// source_url 정규화: WP가 반환하는 직접 IP/옛 CF 호스트/S3 직접링크 → assets.helpsns.com 정본
// (asset-images.md §4.6) — http→https 보정 포함.
function normalizeMediaUrl(url) {
  if (!url) return url;
  return url
    .replace(/^http:\/\//, 'https://')
    .replace(/https:\/\/d14icj3tspgnn2\.cloudfront\.net/, 'https://assets.helpsns.com')
    .replace(/https:\/\/[\w.-]+\.s3\.[\w.-]+\.amazonaws\.com/, 'https://assets.helpsns.com')
    // WP origin host (`{ip}/wp-content/uploads/...`) → assets.helpsns.com 매핑.
    // 단, WP가 자체 uploads에만 저장하고 S3 sync가 없으면 실제로 파일이 없을 수 있음 (검증은 별도 로직)
    .replace(/https:\/\/52\.79\.247\.124\/wp-content\/uploads/, 'https://assets.helpsns.com');
}

async function syncMedia() {
  console.log('▶ media 메타 동기화');
  const items = await fetchAll('media');
  // 참조용 단일 JSON: 핵심 필드만 보관 (썸네일 사이즈는 제외)
  const compact = items.map((m) => ({
    id: m.id,
    date: m.date,
    slug: m.slug,
    mime_type: m.mime_type,
    source_url: normalizeMediaUrl(m.source_url),
    alt_text: m.alt_text,
    title: m.title?.raw ?? '',
    caption: m.caption?.raw ?? '',
    description: m.description?.raw ?? '',
    author: m.author,
    post: m.post,
    width: m.media_details?.width,
    height: m.media_details?.height,
    filesize: m.media_details?.filesize,
  }));
  await writeFile(path.join(META_DIR, '_media.json'), JSON.stringify(compact, null, 2) + '\n');
  console.log(`  미디어 ${compact.length}개 저장`);
}

await mkdir(POSTS_DIR, { recursive: true });
await mkdir(PAGES_DIR, { recursive: true });
await syncTaxonomy();
await syncContent('posts', POSTS_DIR, 'posts');
await syncContent('pages', PAGES_DIR, 'pages');
await syncMedia();
console.log('✓ 완료');
