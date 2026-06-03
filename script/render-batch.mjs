#!/usr/bin/env node
// 21글 인포그래픽 일괄 렌더. Chrome headless 동시 호출 충돌 가능 → 직렬 처리.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { statSync } from 'node:fs';

const ROOT = path.resolve(import.meta.dirname, '..');
const folders = [
  'post-133-yt-stats-2026','post-264-insta-followers-myths','post-341-k-brand-sns',
  'post-419-yt-influencer-subs','post-546-yt-1k-subscribers','post-564-noran-umbrella-saving',
  'post-597-capcut-tiktok-10min','post-618-4-insurance-2025','post-627-local-shop-success',
  'post-637-smb-digital-ai','post-642-zapier-ifttt-insta','post-647-local-seo-2025',
  'post-655-review-management','post-660-brand-storytelling','post-1475-insta-likes-checklist',
  'post-1503-insta-likes-burst','post-1559-tiktok-algorithm-2025','post-1583-yt-impressions-12',
  'post-1601-insta-active-followers','post-1619-reels-likes-3x','post-1835-insta-1k-real-route',
];

const results = [];
for (const f of folders) {
  const inHtml = path.join(ROOT, 'wp-content', 'drafts', 'images', f, 'infographic.html');
  const outWebp = path.join(ROOT, 'wp-content', 'drafts', 'images', f, 'infographic.webp');
  try {
    const start = Date.now();
    execFileSync('node', ['script/render-infographic.mjs', inHtml, outWebp], { cwd: ROOT, stdio: 'pipe' });
    const sz = statSync(outWebp).size;
    const dur = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`✓ ${f} → ${(sz / 1024).toFixed(0)}KB (${dur}s)`);
    results.push({ folder: f, size: sz, ok: true });
  } catch (e) {
    console.error(`✗ ${f} FAIL: ${e.message.split('\n')[0]}`);
    results.push({ folder: f, ok: false, err: e.message });
  }
}
const ok = results.filter(r => r.ok).length;
console.log(`\n${ok}/${results.length} 렌더 성공`);
