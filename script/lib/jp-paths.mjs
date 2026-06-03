// JP 경로 정본 (jp-site-config §2). KR `wp-content/*` → JP `content/*`·`drafts/*`·`public/*` 매핑.
// 모든 블로그 자동화 스크립트는 경로를 여기서 import 한다 (하드코딩 금지).
import fs from 'node:fs';
import path from 'node:path';

export const ROOT = process.cwd();

export const POSTS_DIR = path.join(ROOT, 'content', 'articles'); // 발행본 <slug>.md
export const DRAFTS_DIR = path.join(ROOT, 'drafts'); // draft <slug>.md
export const TAXONOMY = path.join(ROOT, 'content', '_taxonomy.json');

export const postFile = (slug) => path.join(POSTS_DIR, `${slug}.md`);
export const draftFile = (slug) => path.join(DRAFTS_DIR, `${slug}.md`);
export const draftImagesDir = (slug) => path.join(DRAFTS_DIR, 'images', slug);
export const publicImagesDir = (slug) => path.join(ROOT, 'public', 'images', 'articles', slug);

// JP 공개 라우트 (내부링크 검증용 allowlist). app/ 라우트 기준.
export const INTERNAL_ROUTE_PREFIXES = ['/articles/', '/category/', '/tags/', '/contact', '/search', '/'];

// 발행본 slug 목록. 디렉터리 부재 시 빈 배열 + 경고(크래시 금지).
export function listSlugs(dir = POSTS_DIR) {
  if (!fs.existsSync(dir)) {
    console.warn(`[jp-paths] 경로 없음: ${path.relative(ROOT, dir)} — 빈 목록 반환 (ENOENT 크래시 방지)`);
    return [];
  }
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .map((f) => f.replace(/\.md$/, ''));
}

// id/slug 인자를 받아 발행본 또는 draft 파일 경로로 해석 (KR 숫자 id 호환 불필요 — JP는 slug).
export function resolvePostPath(idOrSlug) {
  const asPost = postFile(idOrSlug);
  if (fs.existsSync(asPost)) return asPost;
  const asDraft = draftFile(String(idOrSlug).replace(/^draft-/, ''));
  if (fs.existsSync(asDraft)) return asDraft;
  return asPost; // 없으면 발행본 경로 반환(호출부가 존재 검사)
}
