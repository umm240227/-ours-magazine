#!/usr/bin/env node
// CDN 실물 인포그래픽 게이트 — prod webp를 직접 fetch해 dim 비율·md5 중복을 객관 측정.
// audit-script-loop.md §6.4 정본. AI 직접 판단(시각·의미)이 1차이고, 이 게이트는
// "기계가 잡는 하한선"(dim·md5·중복출현)만 강제한다. 게이트 통과 ≠ 시각 검증 완료(§6.5).
//
// 검증 대상 = prod 실물 (로컬 draft 아님, §6.1). 본문 src의 CDN URL을 fetch해
// 실제 발행된 이미지의 픽셀을 측정한다. HTML만 고치고 webp 재발행을 누락하면
// 이 fetch가 옛 dim/내용을 반환하므로 누락이 정확히 잡힌다.
//
// 사용 (JP: post id = slug, 본문 = 순수 GFM 마크다운 — jp-site-config §2·§3):
//   node script/audit-cdn-gate.mjs --post=<slug>             # 단일 글 CDN 실물 검증
//   node script/audit-cdn-gate.mjs --post=<slug> --json
//   node script/audit-cdn-gate.mjs --all                     # 전수 (글 간 md5 중복 포함)
//   node script/audit-cdn-gate.mjs --all --json
//   node script/audit-cdn-gate.mjs --source=local --images=a.jpg,b.jpg  # 발행 전 로컬 게이트
//
// exit: 0 = pass, 1 = fail (high severity 결함 존재 = 게이트 미통과)

import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { POSTS_DIR, postFile, listSlugs } from './lib/jp-paths.mjs';

// 인포그래픽/차트 가로형 깨짐 hard fail 기준.
// 세로형(<1)이 정본. 의도된 가로 타임라인/단계형 1.2-1.6 허용. 1.6 초과 = 모바일 잘림/축소 깨짐.
// 단 고해상(>=2000폭)은 잘 설계된 가로 인포가 모바일에서도 읽히므로 1.7까지 허용 (AI 시각 검증 반영).
// 저해상 가로(폭 < 2000)는 옛 codex/matplotlib 산출물 패턴이라 1.6 초과면 깨짐.
const RATIO_HARD = 1.6;
const RATIO_HARD_HIRES = 1.7;
const HIRES_W = 2000;

// 인포그래픽/차트의 dim이 가로형 깨짐인지 판정 (폭에 따라 임계값 차등)
function isWideBroken(type, dim) {
  if (type !== 'infographic' && type !== 'chart') return false;
  if (!dim) return false;
  const limit = dim.w >= HIRES_W ? RATIO_HARD_HIRES : RATIO_HARD;
  return dim.ratio > limit;
}

const argv = process.argv.slice(2);
const onlyPost = argv.find((a) => a.startsWith('--post='))?.split('=')[1];
const wantAll = argv.includes('--all');
const wantJson = argv.includes('--json');
const source = argv.find((a) => a.startsWith('--source='))?.split('=')[1] || 'cdn';
const localImages = argv.find((a) => a.startsWith('--images='))?.split('=')[1];

// ---------- 공통 유틸 ----------

// alt 텍스트로 자산 종류 분류 (dim ratio 게이트는 infographic·chart에만 적용)
// JP 본문은 순수 GFM `![alt](url)` (jp-site-config §3) — KR `<img class="wp-image-infographic">`
// 같은 class 신호가 없다. 따라서 분류 가능한 유일한 텍스트 신호 = alt 이다.
// alt는 작성자가 명시적으로 붙인 캡션이라 신뢰 가능 신호다(파일명·URL은 신뢰 불가라 보지 않음).
// JP 인포/차트 alt 패턴: 「…フレームワーク」「…フロー」「…の図/図解」「…可視化」「…ロードマップ」
// 「指標管理」「設計図」「サイクル」 등(본문 실측). KR 신호(인포그래픽·차트·그래프)도 back-compat 유지.
// 모호한 건 게이트가 잡지 않고 AI multimodal 시각 판단에 위임(audit-script-loop §6.5).
function classify(alt) {
  const t = (alt || '').toLowerCase();
  if (/infographic|인포그래픽|インフォグラフィック/.test(t)) return 'infographic';
  // JP: 図解·フレームワーク·フロー·設計図·可視化·ロードマップ = 인포그래픽성 다이어그램
  if (/図解|フレームワーク|フロー|設計図|可視化|ロードマップ|の図|構成図|相関図/.test(t)) return 'infographic';
  if (/\bchart\b|차트|graph|그래프|추이|막대 ?그래프|꺾은선|チャート|グラフ|指標|サイクル|kpi|推移/i.test(t)) return 'chart';
  if (/screenshot|스크린샷|화면|캡처|캡쳐|スクリーンショット|キャプチャ|画面/.test(t)) return 'screenshot';
  return 'photo';
}

function classifyByPath(p) {
  const t = p.toLowerCase();
  if (/infographic|인포|chart|차트|graph|그래프/.test(t)) return 'infographic';
  if (/screenshot|스크린샷|캡처/.test(t)) return 'screenshot';
  return 'photo';
}

// CDN 이미지 1장 fetch → md5 + dim. 일시 000/5xx 대비 1회 재시도 (wordpress-integration §3.3).
async function fetchImage(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url);
      if (!r.ok) {
        if (attempt === 0) { await new Promise((s) => setTimeout(s, 1500)); continue; }
        return { ok: false, status: r.status };
      }
      const buf = Buffer.from(await r.arrayBuffer());
      const md5 = createHash('md5').update(buf).digest('hex');
      let dim = null;
      try {
        const m = await sharp(buf).metadata();
        if (m.width && m.height) {
          dim = { w: m.width, h: m.height, ratio: +(m.width / m.height).toFixed(3) };
        }
      } catch { /* sharp 디코드 실패 → dim null */ }
      return { ok: true, status: r.status, md5, dim, bytes: buf.length };
    } catch (e) {
      if (attempt === 0) { await new Promise((s) => setTimeout(s, 1500)); continue; }
      return { ok: false, status: 0, error: String(e?.message || e) };
    }
  }
  return { ok: false, status: 0 };
}

// ---------- CDN 모드: 단일 글 게이트 ----------

async function gatePost(pid) {
  const content = await readFile(postFile(pid), 'utf8');
  // JP 본문 = 순수 GFM 마크다운 (jp-site-config §3). KR `<img src=...>` 대신
  // `![alt](url "title")` 를 파싱한다. alt=캡션 신호, url=src. title(선택)은 무시.
  // 본문 이미지만 검증; hero(featured)는 frontmatter `image:` 로만 들어가 본문에 없음(§3).
  const imgRefs = [...content.matchAll(/!\[([^\]]*)\]\(\s*<?([^)\s">]+)>?(?:\s+"[^"]*")?\s*\)/g)]
    .map((m) => ({ alt: m[1], src: m[2] }));
  const findings = [];
  const evidence = [];
  const seenMd5 = new Map(); // md5 -> 첫 출현 idx

  let idx = 0;
  for (const ref of imgRefs) {
    idx++;
    const src = ref.src;
    if (!src) continue;
    const type = classify(ref.alt);

    if (!/^https?:\/\//.test(src)) {
      findings.push({ rule: 'non-cdn-src', severity: 'high', idx,
        detail: `본문 img src가 CDN URL 아님 (placeholder/로컬 경로 잔존): ${src.slice(0, 100)}` });
      continue;
    }

    const r = await fetchImage(src);
    if (!r.ok) {
      findings.push({ rule: 'cdn-fetch-fail', severity: 'high', idx,
        detail: `CDN fetch 실패 HTTP ${r.status}${r.error ? ` (${r.error})` : ''}: ${src.slice(0, 100)}` });
      continue;
    }

    evidence.push({ idx, src, type, dim: r.dim, md5: r.md5, http: r.status, source: 'cdn' });

    // dim 비율 게이트 (인포그래픽/차트만 — 사진은 가로 정상)
    if (isWideBroken(type, r.dim)) {
      const limit = r.dim.w >= HIRES_W ? RATIO_HARD_HIRES : RATIO_HARD;
      findings.push({ rule: 'infographic-dim-wide', severity: 'high', idx,
        detail: `${type} CDN 실물 ratio ${r.dim.ratio} > ${limit} (${r.dim.w}×${r.dim.h}) — 가로형 깨짐/모바일 축소. 세로형 1200폭으로 재렌더+재발행 필요: ${src}` });
    }

    // 글 내 md5 중복 (같은 이미지가 본문에 2회+)
    if (seenMd5.has(r.md5)) {
      findings.push({ rule: 'md5-duplicate-in-post', severity: 'high', idx,
        detail: `동일 이미지(md5 ${r.md5.slice(0, 8)})가 본문 ${seenMd5.get(r.md5)}번·${idx}번에 중복 출현` });
    } else {
      seenMd5.set(r.md5, idx);
    }
  }

  const risk = findings.some((f) => f.severity === 'high') ? 'fail' : 'pass';
  return { pid, risk, findings, evidence };
}

// ---------- CDN 모드: 전수 + 글 간 md5 중복 ----------

async function gateAll() {
  // JP: 숫자 id 아님 → slug 기반. listSlugs()가 readdir 가드(부재 시 빈 목록+경고)와
  // `_` prefix 제외(`_taxonomy` 등 비기사)·`.md` 필터를 캡슐화 (jp-paths.mjs).
  const slugs = listSlugs();
  const results = [];
  // 글 간 인포/차트 md5 → [pid] (다른 글에 동일 인포 잔존 검출)
  const md5ToPosts = new Map();

  for (const pid of slugs) {
    const res = await gatePost(pid);
    // 인포/차트 evidence의 md5를 글 간 맵에 누적
    for (const ev of res.evidence) {
      if (ev.type === 'infographic' || ev.type === 'chart') {
        if (!md5ToPosts.has(ev.md5)) md5ToPosts.set(ev.md5, []);
        const arr = md5ToPosts.get(ev.md5);
        if (!arr.includes(pid)) arr.push(pid);
      }
    }
    results.push(res);
  }

  // 글 간 중복 주입 (같은 인포 md5가 2개 이상 글에 존재)
  for (const [md5, pids] of md5ToPosts) {
    if (pids.length > 1) {
      for (const pid of pids) {
        const r = results.find((x) => x.pid === pid);
        r.findings.push({ rule: 'md5-duplicate-cross-post', severity: 'high',
          detail: `인포/차트(md5 ${md5.slice(0, 8)})가 글 ${pids.join(', ')}에 중복 사용 — 글마다 고유 인포 필요` });
        r.risk = 'fail';
      }
    }
  }

  return results;
}

// ---------- 로컬 모드: 발행 전 게이트 ----------

async function gateLocal(paths) {
  const findings = [];
  const evidence = [];
  const seenMd5 = new Map();

  for (const p of paths) {
    let buf;
    try { buf = await readFile(p); }
    catch { findings.push({ rule: 'local-file-missing', severity: 'high', detail: `파일 없음: ${p}` }); continue; }
    const md5 = createHash('md5').update(buf).digest('hex');
    let dim = null;
    try { const m = await sharp(buf).metadata(); dim = { w: m.width, h: m.height, ratio: +(m.width / m.height).toFixed(3) }; }
    catch { findings.push({ rule: 'local-decode-fail', severity: 'high', detail: `디코드 실패: ${p}` }); continue; }
    const type = classifyByPath(p);
    evidence.push({ file: p, type, dim, md5, source: 'local' });

    if (isWideBroken(type, dim)) {
      const limit = dim.w >= HIRES_W ? RATIO_HARD_HIRES : RATIO_HARD;
      findings.push({ rule: 'infographic-dim-wide', severity: 'high',
        detail: `${p} ratio ${dim.ratio} > ${limit} (${dim.w}×${dim.h}) — 가로형 깨짐. 발행 전 세로형 재렌더 필요` });
    }
    if (seenMd5.has(md5)) {
      findings.push({ rule: 'md5-duplicate', severity: 'high',
        detail: `${p} == ${seenMd5.get(md5)} (동일 md5 ${md5.slice(0, 8)}) — 중복 이미지` });
    } else {
      seenMd5.set(md5, p);
    }
  }

  const risk = findings.some((f) => f.severity === 'high') ? 'fail' : 'pass';
  return { risk, findings, evidence };
}

// ---------- 실행 ----------

let output;
let exitFail = false;

if (source === 'local') {
  if (!localImages) { console.error('--source=local 에는 --images=path1,path2 필요'); process.exit(2); }
  const paths = localImages.split(',').map((s) => s.trim()).filter(Boolean);
  const res = await gateLocal(paths);
  exitFail = res.risk === 'fail';
  output = res;
} else if (wantAll) {
  const results = await gateAll();
  exitFail = results.some((r) => r.risk === 'fail');
  output = results;
} else if (onlyPost) {
  const res = await gatePost(onlyPost);
  exitFail = res.risk === 'fail';
  output = res;
} else {
  console.error('사용: --post=<id> | --all | --source=local --images=...');
  process.exit(2);
}

if (wantJson) {
  console.log(JSON.stringify(output, null, 2));
} else {
  const list = Array.isArray(output) ? output : [output];
  const fails = list.filter((r) => r.risk === 'fail');
  if (Array.isArray(output)) {
    console.log(`CDN 게이트: 전체 ${list.length}글 · pass ${list.length - fails.length} · fail ${fails.length}`);
  }
  for (const r of list) {
    if (r.risk !== 'fail') continue;
    console.log(`\n[FAIL] ${r.pid ? `post ${r.pid}` : 'local'}`);
    for (const f of r.findings) console.log(`  - ${f.rule}: ${f.detail}`);
  }
  if (fails.length === 0) console.log('✓ CDN 게이트 통과 (high 결함 0)');
}

process.exit(exitFail ? 1 : 0);
