#!/usr/bin/env node
// blog-image-quality-100 작업의 batch 단위 마크다운 보고서 생성 모듈 (9 섹션 정본).
// design.md §11.9 정본을 따르며, 운영자가 한눈에 회고할 수 있는 형식.
//
// usage:
//   import { generateBatchReport } from './lib/blog-image-batch-report.mjs';
//   const { path } = await generateBatchReport({ batchIndex, posts, ... });

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// === sub-step 표시 라벨 (design.md §2.1 정본) ===
const SUB_STEP_LABELS = {
  'regeneration-2': '① AC-재생성-2 (AI 일러스트 제거)',
  'image-add': '② AC-이미지보강 (imgCount 보강)',
  'mismatch': '③ AC-Mismatch-1 (figcaption 정정)',
  'regeneration-1': '④ AC-재생성-1 (1200px 재렌더)',
};

const SUB_STEP_ORDER = ['regeneration-2', 'image-add', 'mismatch', 'regeneration-1'];

// === 유틸 ===

/**
 * ms를 사람이 읽을 수 있는 형식으로 변환.
 * @param {number} ms
 * @returns {string} 예: "8m 23s", "1h 12m 45s"
 */
function formatDuration(ms) {
  if (ms == null || Number.isNaN(ms)) return '-';
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/**
 * 평균 계산. 비어있으면 null.
 */
function avg(nums) {
  const valid = nums.filter((n) => typeof n === 'number' && !Number.isNaN(n));
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

/**
 * 파일 시스템 안전한 ISO 타임스탬프 (콜론·점 제거).
 * 예: 2026-05-27T15:23:45.678Z → 2026-05-27T15-23-45
 */
function fsSafeTimestamp(iso) {
  return iso.replace(/[:.]/g, '-').replace(/-\d{3}Z$/, '');
}

/** sub_steps 1건 표시 (string 또는 { status, detail } 객체 모두 처리) */
function formatSubStepValue(value) {
  if (value == null) return 'pending';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const status = value.status ?? '-';
    const detail = value.detail ?? value.note ?? value.msg ?? null;
    return detail ? `${status} (${detail})` : status;
  }
  return String(value);
}

// === 섹션 빌더 (9 섹션 — design §11.9 정본) ===

// 섹션 1 — 헤더 + ISO timestamp
function buildHeader(batchIndex, isoTs, dryRun) {
  const tag = dryRun ? ' [DRY-RUN]' : '';
  return `# Batch ${batchIndex} 처리 결과${tag} (${isoTs})`;
}

// 섹션 2 — 요약 (처리/성공/실패/Skip + 평균 audit_score + 처리 시간)
function buildSummarySection(posts) {
  const total = posts.length;
  const done = posts.filter((p) => p.status === 'done').length;
  const failed = posts.filter((p) => p.status === 'failed').length;
  const skipped = posts.filter((p) => p.status === 'skipped').length;

  const scores = posts.map((p) => p.audit_score).filter((s) => typeof s === 'number');
  const avgScore = avg(scores);

  const elapsedList = posts.map((p) => p.elapsed_ms).filter((e) => typeof e === 'number');
  const totalElapsed = elapsedList.reduce((a, b) => a + b, 0);
  const avgElapsed = avg(elapsedList);

  // changes 합계
  const changeTotals = posts.reduce(
    (acc, p) => {
      const c = p.changes_summary || {};
      acc.removed += c.removed_illustrations || 0;
      acc.added += c.added_images || 0;
      acc.fixed += c.fixed_figcaptions || 0;
      acc.regenerated += c.regenerated_assets || 0;
      return acc;
    },
    { removed: 0, added: 0, fixed: 0, regenerated: 0 },
  );

  const lines = [
    '## 2. 요약',
    '',
    `- 처리: ${total}편 / 성공: ${done}편 / 실패: ${failed}편 / Skip: ${skipped}편`,
    `- 평균 audit_score: ${avgScore == null ? '-' : avgScore.toFixed(1)}`,
    `- 처리 시간: ${formatDuration(totalElapsed)} (글당 평균 ${formatDuration(avgElapsed)})`,
    `- 변경 누적 — AI 일러 제거 ${changeTotals.removed}장 / 이미지 보강 ${changeTotals.added}장 / figcaption 정정 ${changeTotals.fixed}건 / 1200px 재생성 ${changeTotals.regenerated}장`,
  ];
  return lines.join('\n');
}

// 섹션 3 — 글별 처리 결과 (sub_steps 4단계 done/skipped/failed + changes 카운트)
function buildPostDetails(posts) {
  const sections = ['## 3. 글별 처리 결과', ''];

  // 전체 표
  sections.push('| ID | slug | status | audit_score | build_cycles | elapsed |');
  sections.push('|---|---|---|---|---|---|');
  for (const p of posts) {
    const score = p.audit_score == null ? '-' : String(p.audit_score);
    const cycles = p.build_cycles == null ? '-' : String(p.build_cycles);
    sections.push(`| ${p.id} | ${p.slug ?? '-'} | ${p.status ?? '-'} | ${score} | ${cycles} | ${formatDuration(p.elapsed_ms)} |`);
  }
  sections.push('');

  // 글별 상세
  for (const p of posts) {
    sections.push(`### ${p.slug ?? '(slug 없음)'} (ID: ${p.id})`);
    sections.push('');
    sections.push(`- status: ${p.status ?? '-'}`);
    sections.push(`- audit_score: ${p.audit_score == null ? '-' : p.audit_score}`);
    sections.push(`- build_cycles: ${p.build_cycles == null ? '-' : p.build_cycles}`);
    sections.push('- sub_steps:');
    const subSteps = p.sub_steps ?? {};
    for (const key of SUB_STEP_ORDER) {
      const label = SUB_STEP_LABELS[key] ?? key;
      sections.push(`  - ${label}: ${formatSubStepValue(subSteps[key])}`);
    }
    // 추가 key (정의 외) 처리
    for (const key of Object.keys(subSteps)) {
      if (SUB_STEP_ORDER.includes(key)) continue;
      sections.push(`  - ${key}: ${formatSubStepValue(subSteps[key])}`);
    }

    // changes 카운트
    const c = p.changes_summary || {};
    sections.push(`- changes: AI 일러 제거 ${c.removed_illustrations || 0}장 / 이미지 보강 ${c.added_images || 0}장 / figcaption 정정 ${c.fixed_figcaptions || 0}건 / 1200px 재생성 ${c.regenerated_assets || 0}장`);
    if (p.planned_inserts || p.planned_regens) {
      sections.push(`- planned (dry-run): inserts ${p.planned_inserts || 0}장, regens ${p.planned_regens || 0}장`);
    }
    sections.push(`- elapsed: ${formatDuration(p.elapsed_ms)}`);
    sections.push('');
  }

  return sections.join('\n');
}

// 섹션 4 — Git (commit hash + gitLog 5줄)
function buildGitSection(gitCommitSha, gitLog) {
  const lines = ['## 4. Git', ''];
  if (gitCommitSha) {
    lines.push(`- commit: \`${gitCommitSha}\``);
  } else {
    lines.push('- commit: (없음)');
  }
  lines.push('');
  lines.push('### git log -5');
  lines.push('');
  if (gitLog && typeof gitLog === 'string' && gitLog.trim()) {
    lines.push('```');
    lines.push(gitLog.trim());
    lines.push('```');
  } else {
    lines.push('(로그 없음 — dry-run 또는 commit 없음)');
  }
  return lines.join('\n');
}

// 섹션 5 — Amplify (build URL + status + duration + jobId)
function buildAmplifySection(amplifyBuildUrl, amplifyStatus, amplifyDurationMs, amplifyJobId) {
  const lines = ['## 5. Amplify', ''];
  const hasInfo = amplifyBuildUrl || amplifyStatus || amplifyJobId || amplifyDurationMs;
  if (!hasInfo) {
    lines.push('- Amplify build: (정보 없음 — dry-run 또는 게이트 skip)');
    return lines.join('\n');
  }
  lines.push(`- status: ${amplifyStatus ?? '-'}`);
  lines.push(`- jobId: ${amplifyJobId || '-'}`);
  lines.push(`- duration: ${formatDuration(amplifyDurationMs)}`);
  if (amplifyBuildUrl) lines.push(`- url: ${amplifyBuildUrl}`);
  return lines.join('\n');
}

// 섹션 6 — IndexNow (제출 5건 + 응답 코드)
function buildIndexNowSection(indexnowResponse, posts) {
  const lines = ['## 6. IndexNow', ''];
  const submitted = posts.length;
  lines.push(`- 제출 대기 URL: ${submitted}건 (amplify.yml 자동 호출 위임)`);
  if (indexnowResponse == null) {
    lines.push('- 응답: (amplify.yml 빌드 후 자동 — 본 실행에서 직접 호출 안 함)');
    return lines.join('\n');
  }
  if (typeof indexnowResponse === 'string') {
    lines.push(`- 응답: ${indexnowResponse}`);
    return lines.join('\n');
  }
  if (typeof indexnowResponse === 'object') {
    lines.push(`- status: ${indexnowResponse.status ?? '-'}`);
    if (Array.isArray(indexnowResponse.submitted_urls)) {
      lines.push('- 제출 URL:');
      for (const url of indexnowResponse.submitted_urls.slice(0, 10)) {
        lines.push(`  - ${url}`);
      }
    }
    if (indexnowResponse.response_codes) {
      lines.push('- 응답 코드:');
      lines.push('```json');
      lines.push(JSON.stringify(indexnowResponse.response_codes, null, 2));
      lines.push('```');
    }
  }
  return lines.join('\n');
}

// 섹션 7 — SNS Sharing Debugger (Facebook 자동 결과 + 카카오/X 수동 URL 5건)
function buildSnsSharingSection({ facebookScrapeResults, kakaoDebuggerUrls, xCardValidatorUrls, posts }) {
  const lines = ['## 7. SNS Sharing Debugger 강제 재크롤', ''];

  // Facebook 자동 결과
  lines.push('### Facebook (자동)');
  lines.push('');
  if (Array.isArray(facebookScrapeResults) && facebookScrapeResults.length > 0) {
    lines.push('| post_id | slug | url | status | scraped_at |');
    lines.push('|---|---|---|---|---|');
    for (const r of facebookScrapeResults) {
      const at = r.scraped_at ? r.scraped_at : '-';
      const reason = r.reason ? ` (${r.reason})` : '';
      lines.push(`| ${r.post_id ?? '-'} | ${r.slug ?? '-'} | ${r.url ?? '-'} | ${r.status ?? '-'}${reason} | ${at} |`);
    }
  } else {
    lines.push('(자동 처리 0건 — FB_APP_ACCESS_TOKEN 미설정 또는 dry-run)');
  }

  // 카카오 (수동)
  lines.push('');
  lines.push('### 카카오 공유 디버거 (운영자 수동 처리)');
  lines.push('');
  const kakao = Array.isArray(kakaoDebuggerUrls) && kakaoDebuggerUrls.length > 0
    ? kakaoDebuggerUrls
    : (posts || []).map((p) => ({
        post_id: p.id,
        slug: p.slug,
        page_url: `https://www.helpsns.com/blog/${p.slug ?? ''}/`,
        debugger_url: `https://developers.kakao.com/tool/debugger/sharing?url=${encodeURIComponent(`https://www.helpsns.com/blog/${p.slug ?? ''}/`)}`,
      }));
  for (const k of kakao) {
    lines.push(`- ID ${k.post_id} (${k.slug ?? '-'}) — [디버거 열기](${k.debugger_url})`);
  }

  // X / Twitter (수동)
  lines.push('');
  lines.push('### X Card Validator (운영자 수동 처리)');
  lines.push('');
  const x = Array.isArray(xCardValidatorUrls) && xCardValidatorUrls.length > 0
    ? xCardValidatorUrls
    : (posts || []).map((p) => ({
        post_id: p.id,
        slug: p.slug,
        page_url: `https://www.helpsns.com/blog/${p.slug ?? ''}/`,
        validator_url: 'https://cards-dev.twitter.com/validator',
      }));
  for (const xc of x) {
    lines.push(`- ID ${xc.post_id} (${xc.slug ?? '-'}) — ${xc.page_url} → [validator](${xc.validator_url})`);
  }

  return lines.join('\n');
}

// 섹션 8 — errors[] phase별 집계
function buildErrorsSummary(posts) {
  const all = [];
  for (const p of posts) {
    const errors = Array.isArray(p.errors) ? p.errors : [];
    for (const err of errors) {
      all.push({ postId: p.id, slug: p.slug, ...err });
    }
  }
  const lines = ['## 8. errors[] 요약', ''];
  if (all.length === 0) {
    lines.push('errors 0건.');
    return lines.join('\n');
  }
  // phase별 집계
  const byPhase = new Map();
  for (const err of all) {
    const phase = err.phase ?? '-';
    if (!byPhase.has(phase)) byPhase.set(phase, []);
    byPhase.get(phase).push(err);
  }
  lines.push(`총 ${all.length}건 (phase별 집계):`);
  lines.push('');
  for (const [phase, list] of byPhase.entries()) {
    lines.push(`- ${phase}: ${list.length}건`);
    for (const err of list) {
      const msg = err.msg ?? err.message ?? '-';
      const at = err.at ? ` (${err.at})` : '';
      lines.push(`  - [ID ${err.postId}] ${msg}${at}`);
    }
  }
  return lines.join('\n');
}

// 섹션 9 — 다음 batch index + 처리 대기 글 수
function buildNextBatchSection(batchIndex, posts, totalBatches) {
  const lines = ['## 9. 다음 batch', ''];
  lines.push(`- 다음 batch index: ${batchIndex + 1}${totalBatches ? ` / ${totalBatches}` : ''}`);
  const remaining = posts.filter((p) => p.status !== 'done').length;
  lines.push(`- 본 batch 미완 (재처리 대기): ${remaining}편`);
  lines.push('- 다음 batch 시작 시각: 운영자 트리거 (manual) 또는 60s 안정화 후 자동 진행');
  return lines.join('\n');
}

// === 메인 export ===

/**
 * batch 단위 보고서 생성 (9 섹션).
 *
 * @param {object} params
 * @param {number} params.batchIndex - batch 번호 (1-base)
 * @param {Array<object>} params.posts - 글 결과 배열 {id, slug, status, audit_score, build_cycles, sub_steps, changes_summary, errors, elapsed_ms}
 * @param {string} [params.gitCommitSha]
 * @param {string} [params.gitLog] - `git log --oneline -5` 결과
 * @param {string} [params.amplifyBuildUrl]
 * @param {string} [params.amplifyStatus]
 * @param {number|null} [params.amplifyDurationMs]
 * @param {string} [params.amplifyJobId]
 * @param {*} [params.indexnowResponse] - 응답 객체 {status, submitted_urls, response_codes}
 * @param {Array<object>} [params.facebookScrapeResults] - [{url, status, scraped_at, post_id, slug}]
 * @param {Array<object>} [params.kakaoDebuggerUrls] - [{post_id, slug, debugger_url, page_url}]
 * @param {Array<object>} [params.xCardValidatorUrls] - [{post_id, slug, validator_url, page_url}]
 * @param {boolean} [params.dryRun]
 * @param {number} [params.totalBatches]
 * @param {string} params.runDir - 'tmp/blog-image-quality-100/'
 * @returns {Promise<{path: string}>}
 */
export async function generateBatchReport({
  batchIndex,
  posts = [],
  gitCommitSha,
  gitLog,
  amplifyBuildUrl,
  amplifyStatus,
  amplifyDurationMs,
  amplifyJobId,
  indexnowResponse,
  facebookScrapeResults,
  kakaoDebuggerUrls,
  xCardValidatorUrls,
  dryRun = false,
  totalBatches,
  runDir,
}) {
  if (typeof batchIndex !== 'number') {
    throw new TypeError('generateBatchReport: batchIndex (number) 필수');
  }
  if (!Array.isArray(posts)) {
    throw new TypeError('generateBatchReport: posts (Array) 필수');
  }
  if (!runDir || typeof runDir !== 'string') {
    throw new TypeError('generateBatchReport: runDir (string) 필수');
  }

  const isoTs = new Date().toISOString();
  const fsTs = fsSafeTimestamp(isoTs);

  // 마크다운 본문 조립 (9개 섹션 — design §11.9 정본)
  const md = [
    buildHeader(batchIndex, isoTs, dryRun), // 1
    '',
    buildSummarySection(posts), // 2
    '',
    buildPostDetails(posts), // 3
    '',
    buildGitSection(gitCommitSha, gitLog), // 4
    '',
    buildAmplifySection(amplifyBuildUrl, amplifyStatus, amplifyDurationMs, amplifyJobId), // 5
    '',
    buildIndexNowSection(indexnowResponse, posts), // 6
    '',
    buildSnsSharingSection({ facebookScrapeResults, kakaoDebuggerUrls, xCardValidatorUrls, posts }), // 7
    '',
    buildErrorsSummary(posts), // 8
    '',
    buildNextBatchSection(batchIndex, posts, totalBatches), // 9
    '',
  ].join('\n');

  // 디렉터리 보장 후 atomic write
  await mkdir(runDir, { recursive: true });
  const fileName = `batch-${batchIndex}-${fsTs}.md`;
  const outPath = path.join(runDir, fileName);
  await writeFile(outPath, md, 'utf-8');

  return { path: outPath };
}
