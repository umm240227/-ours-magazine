#!/usr/bin/env node
// Hero 113편의 모바일 list 썸네일 가독성 시뮬레이션 audit.
// 모바일 list 컨테이너 폭 = 372px. 1200×675 hero를 0.31 비율로 축소.
// asset-images.md §4.8.5 임계값:
//   - 제목 ≥ 56px (모바일 환산 17.36px)
//   - 부제 ≥ 40px (모바일 환산 12.4px)
//   - 카테고리 배지 ≥ 24px (모바일 환산 7.44px)
// 사용:
//   node script/audit-mobile-readability.mjs            # 전수
//   node script/audit-mobile-readability.mjs --json
//   node script/audit-mobile-readability.mjs --post=1592

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const HEROES_DIR = path.join(ROOT, 'wp-content/drafts/heroes');
const SCALE = 372 / 1200; // 0.31
const args = process.argv.slice(2);
const wantJson = args.includes('--json');
const onlyPost = args.find((a) => a.startsWith('--post='))?.split('=')[1];

// 임계값 (모바일 list 372px 가독성 — pixel after scale)
const T_TITLE = 17.36;
const T_SUBTITLE = 12.4;
const T_BADGE = 7.44;

function extractFontSize(html, pattern) {
  // pattern: { tagOrClass: string, sigContextRe: RegExp }
  // 폰트 사이즈 추출 시 style="font-size:Npx" 또는 text-[Npx] 매칭
  return null;
}

async function auditOne(dir) {
  const htmlPath = path.join(HEROES_DIR, dir, 'hero.html');
  let html;
  try { html = await readFile(htmlPath, 'utf-8'); } catch { return null; }

  // 1. 제목 폰트: <h1 style="font-size:Npx" 또는 text-[Npx]
  const titleM = html.match(/<h1[^>]*style="[^"]*font-size:\s*(\d+)px/) || html.match(/<h1[^>]*class="[^"]*text-\[(\d+)px\]/);
  const titlePx = titleM ? Number(titleM[1]) : null;

  // 2. 부제 폰트 (subtitle paragraph): <p ... style="font-size:Npx"
  // V1/V2는 inline rendered by batch script. text-shadow 단서로 감별.
  const subM = html.match(/<p[^>]*style="[^"]*font-size:\s*(\d+)px[^"]*text-shadow/) ||
                html.match(/{{SUBTITLE_BLOCK}}/) ? null : html.match(/<p[^>]*style="[^"]*font-size:\s*(\d+)px/);
  // batch script가 만든 hero.html에는 subtitle이 inline injected. <p>의 font-size 검출
  const subAll = [...html.matchAll(/<p[^>]*style="[^"]*font-size:\s*(\d+)px/g)].map((m) => Number(m[1]));
  const subPx = subAll.length > 0 ? Math.max(...subAll) : null;

  // 3. 카테고리 배지: span에 text-transform:uppercase + font-weight:700
  // style="font-size:Npx;font-weight:700;letter-spacing:0.08em;text-transform:uppercase"
  const badgeM = html.match(/<span[^>]*style="[^"]*font-size:\s*(\d+)px[^"]*text-transform:\s*uppercase/);
  const badgePx = badgeM ? Number(badgeM[1]) : null;

  return {
    dir, htmlPath: path.relative(ROOT, htmlPath),
    titlePx, subPx, badgePx,
    titleMobile: titlePx ? Math.round(titlePx * SCALE * 100) / 100 : null,
    subMobile: subPx ? Math.round(subPx * SCALE * 100) / 100 : null,
    badgeMobile: badgePx ? Math.round(badgePx * SCALE * 100) / 100 : null,
    pass: {
      title: titlePx ? titlePx * SCALE >= T_TITLE : null,
      sub: subPx ? subPx * SCALE >= T_SUBTITLE : (subPx === null ? null : false),
      badge: badgePx ? badgePx * SCALE >= T_BADGE : null,
    },
  };
}

const dirs = (await readdir(HEROES_DIR)).filter((d) => !d.startsWith('.'));
const targets = onlyPost ? dirs.filter((d) => d.startsWith(onlyPost + '-')) : dirs;

const results = [];
for (const d of targets) {
  const r = await auditOne(d);
  if (r) results.push(r);
}

// 통과 여부 종합
const summary = {
  total: results.length,
  pass: results.filter((r) => r.pass.title !== false && r.pass.sub !== false && r.pass.badge !== false).length,
  fail_title: results.filter((r) => r.pass.title === false).length,
  fail_sub: results.filter((r) => r.pass.sub === false).length,
  fail_badge: results.filter((r) => r.pass.badge === false).length,
};

if (wantJson) {
  console.log(JSON.stringify({ summary, results }, null, 2));
} else {
  console.log(`Hero 모바일 list(372px) 가독성 audit:\n`);
  console.log(`전체 ${summary.total}편 / 통과 ${summary.pass}편`);
  console.log(`실패: 제목 ${summary.fail_title} / 부제 ${summary.fail_sub} / 배지 ${summary.fail_badge}\n`);
  console.log(`임계값: 제목 ${T_TITLE}px / 부제 ${T_SUBTITLE}px / 배지 ${T_BADGE}px (모바일 환산)\n`);
  const fails = results.filter((r) => r.pass.title === false || r.pass.sub === false || r.pass.badge === false);
  for (const r of fails.slice(0, 20)) {
    const f = [];
    if (r.pass.title === false) f.push(`제목 ${r.titlePx}→${r.titleMobile}px`);
    if (r.pass.sub === false) f.push(`부제 ${r.subPx}→${r.subMobile}px`);
    if (r.pass.badge === false) f.push(`배지 ${r.badgePx}→${r.badgeMobile}px`);
    console.log(`  ${r.dir}: ${f.join(' / ')}`);
  }
  if (fails.length > 20) console.log(`  ... +${fails.length - 20}건`);
}
