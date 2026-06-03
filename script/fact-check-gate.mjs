#!/usr/bin/env node
// 적대적 팩트체크 하드 게이트 (jp-site-config §9 — KR audit엔 없는 "한국 초과" 항목).
// 발행 전 강제:
//   (1) 외부 1차 출처 마크다운 링크 ≥3개 (E-E-A-T, 검증 가능한 citation)
//   (2) frontmatter `_fact_checked` 마커 — 적대적 검증 sub-agent가 출처를 fetch·대조하고 기록했다는 증거
//       (할루시네이션 "100アカウント"·합성수치 "4000保存"을 잡은 그 패스. audit.md가 강제 실행 후 기록)
//   (3) [경고] 외부 링크 liveness (4xx/5xx면 dead — 명백한 죽은 링크만 차단, 네트워크 오류·타임아웃은 경고)
//   (4) [경고] 수치 주장(N%·N倍·N社 등)에 인접 출처 링크 또는 編集部/目安 마커가 없으면 미검증 의심
//
// 의미 검증("그 페이지가 그 수치를 실제로 담는가")은 스크립트로 불가 → 적대적 sub-agent가 수행하고
// `_fact_checked`에 기록. 이 게이트는 그게 실행됐는지 + 출처 구조를 강제한다.
//
// 사용: node script/fact-check-gate.mjs --post=<slug>  |  <draft.md 경로>
// exit 0 통과 / exit 2 차단

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import matter from 'gray-matter';
import { resolvePostPath, INTERNAL_ROUTE_PREFIXES } from './lib/jp-paths.mjs';

const MIN_EXTERNAL_SOURCES = 3;
const args = process.argv.slice(2);
const postArg = args.find((a) => a.startsWith('--post='))?.split('=')[1];
const fileArg = args.find((a) => !a.startsWith('--'));
const target = fileArg && existsSync(fileArg) ? fileArg : (postArg ? resolvePostPath(postArg) : null);

if (!target || !existsSync(target)) {
  console.error('사용: node script/fact-check-gate.mjs --post=<slug> | <file.md>');
  process.exit(2);
}

const { data: meta, content: body } = matter(await readFile(target, 'utf8'));
const errors = [];
const warnings = [];

// (1) 외부 출처 마크다운 링크 추출
const linkRe = /\[[^\]]+\]\((https?:\/\/[^)\s]+)\)/g;
const internalHost = 'ours-magazine.jp';
const externals = new Set();
let m;
while ((m = linkRe.exec(body)) !== null) {
  const url = m[1];
  try {
    const host = new URL(url).host;
    if (host.includes(internalHost)) continue;
    if (INTERNAL_ROUTE_PREFIXES.some((p) => url.includes(internalHost + p))) continue;
    externals.add(url);
  } catch { /* malformed URL */ }
}
if (externals.size < MIN_EXTERNAL_SOURCES) {
  errors.push(`외부 1차 출처 링크 ${externals.size}개 < ${MIN_EXTERNAL_SOURCES}개 필요 (E-E-A-T 검증 가능 citation). 본문에 [出典名](https://원문URL) 형식으로 추가.`);
}

// (2) _fact_checked 마커 (적대적 검증 패스 실행 증거)
if (!meta._fact_checked) {
  errors.push('frontmatter `_fact_checked` 누락 — 적대적 팩트체크 sub-agent 미실행(audit.md 강제). 각 통계/주장을 인용 URL fetch로 대조하고 `_fact_checked: {at, sources:[...], unsupported:[...]}` 기록 필요.');
} else if (Array.isArray(meta._fact_checked.unsupported) && meta._fact_checked.unsupported.length > 0) {
  errors.push(`_fact_checked.unsupported 에 미검증 주장 ${meta._fact_checked.unsupported.length}건 — 출처 추가/編集部目安 명시/삭제 후 재검증 필요: ${meta._fact_checked.unsupported.join(' / ')}`);
}

// (3) 링크 liveness (명백한 dead만 차단)
const skipLive = args.includes('--no-fetch');
if (!skipLive && externals.size > 0) {
  await Promise.all([...externals].map(async (url) => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(url, { method: 'GET', redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (factcheck-gate)' } });
      clearTimeout(t);
      if ([404, 410, 403, 500, 502, 503].includes(res.status)) errors.push(`죽은 링크 (HTTP ${res.status}): ${url}`);
    } catch (e) {
      warnings.push(`링크 liveness 확인 실패(네트워크/타임아웃, 차단 아님): ${url}`);
    }
  }));
}

// (4) 수치 주장에 인접 출처/編集部 마커 (경고)
const numRe = /\d+(?:\.\d+)?\s*(?:%|倍|社|件|秒|円|人|万|億)/;
const sourceNear = /\]\(https?:\/\/|出典|参考|編集部|目安|基準|より\b/;
for (const para of body.split(/\n\n+/)) {
  if (numRe.test(para) && !sourceNear.test(para) && para.length > 30 && !para.startsWith('|')) {
    warnings.push(`数値主張に出典/編集部目安マーカーなし(要確認): "${para.replace(/\n/g, ' ').slice(0, 50)}…"`);
  }
}

// ── 결과 ──
if (warnings.length) console.error(`[fact-check-gate] 경고 ${warnings.length}건:\n  - ${warnings.join('\n  - ')}`);
if (errors.length) {
  console.error(`✗ 팩트체크 게이트 차단 (${errors.length}건):\n  - ${errors.join('\n  - ')}`);
  process.exit(2);
}
console.log(`✓ 팩트체크 게이트 통과 (외부 출처 ${externals.size}개, _fact_checked 기록 있음, 죽은 링크 0)`);
process.exit(0);
