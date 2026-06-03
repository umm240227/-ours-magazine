// Amplify 빌드 게이트 — commit SHA 매칭 polling + 15분 timeout
//
// design.md §11.8 명세 구현.
// - AWS CLI(`aws amplify list-jobs`)로 최근 빌드 jobSummary 조회
// - jobSummary.commitId === commitSha 매칭 (이전 batch 빌드 무시)
// - PENDING / PROVISIONING / RUNNING → polling 계속
// - SUCCEED → return
// - FAILED / CANCELLED → return + failureReason
// - 15분(기본) 미매칭/미종료 → status 'TIMEOUT'
//
// 호출 측은 FAILED / CANCELLED / TIMEOUT 시 STOP 트리거 (§11.4).

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Amplify status 매핑 정본 (§11.8 표).
 *  - PENDING / PROVISIONING / RUNNING : polling 지속 (반환하지 않음)
 *  - SUCCEED : 종료
 *  - FAILED / CANCELLED : 종료 + failureReason
 *  - TIMEOUT : 본 게이트가 자체 부여
 */
const TERMINAL_FAILURE_STATES = new Set(['FAILED', 'CANCELLED']);
const TERMINAL_SUCCESS_STATES = new Set(['SUCCEED']);
const IN_PROGRESS_STATES = new Set(['PENDING', 'PROVISIONING', 'RUNNING']);

const DEFAULT_POLL_INTERVAL_MS = 30_000; // 30s
const DEFAULT_TIMEOUT_MS = 900_000; // 15분
const DEFAULT_MAX_RESULTS = 5;

/**
 * AWS CLI `aws amplify list-jobs` 호출 — 최근 N개 jobSummary 반환.
 *
 * @param {object} params
 * @param {string} params.appId
 * @param {string} params.branch
 * @param {number} params.maxResults
 * @returns {Promise<Array<object>>} jobSummaries
 */
async function fetchRecentJobSummaries({ appId, branch, maxResults }) {
  const args = [
    'amplify',
    'list-jobs',
    '--app-id', appId,
    '--branch-name', branch,
    '--max-results', String(maxResults),
    '--output', 'json',
  ];
  const { stdout } = await execFileAsync('aws', args, {
    maxBuffer: 8 * 1024 * 1024,
  });
  const parsed = JSON.parse(stdout);
  return Array.isArray(parsed.jobSummaries) ? parsed.jobSummaries : [];
}

/**
 * jobSummary 한 건에서 게이트 응답 객체를 만든다.
 *
 * @param {object} jobSummary
 * @param {string} appId
 * @param {string} branch
 * @returns {{ status: string, jobId: string, jobUrl: string, failureReason?: string, checkedAt: string }}
 */
function buildResult(jobSummary, appId, branch) {
  const jobId = jobSummary?.jobId ?? '';
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-northeast-2';
  const jobUrl = jobId
    ? `https://${region}.console.aws.amazon.com/amplify/home?region=${region}#/${appId}/branches/${encodeURIComponent(branch)}/deployments/${jobId}`
    : '';
  const status = jobSummary?.status ?? 'UNKNOWN';
  const result = {
    status,
    jobId,
    jobUrl,
    checkedAt: new Date().toISOString(),
  };
  if (TERMINAL_FAILURE_STATES.has(status)) {
    // jobSummary 본문에서 실패 메시지 후보 — Amplify API는 statusReason / endReason 등을 일관되게 노출하지 않음.
    const failureReason =
      jobSummary?.statusReason
      || jobSummary?.endReason
      || jobSummary?.summary
      || `status=${status}`;
    result.failureReason = String(failureReason);
  }
  return result;
}

/**
 * 빌드 polling — commit SHA 매칭 + 15분 timeout.
 *
 * @param {object} opts
 * @param {string} opts.appId           AWS_APP_ID
 * @param {string} opts.branch          'master'
 * @param {string} opts.commitSha       git rev-parse HEAD
 * @param {number} [opts.pollIntervalMs=30000]
 * @param {number} [opts.timeoutMs=900000]
 * @param {number} [opts.maxResults=5]  list-jobs --max-results
 * @param {{ info?: Function, warn?: Function, error?: Function }} [opts.logger]
 * @returns {Promise<{ status: 'PENDING'|'PROVISIONING'|'RUNNING'|'SUCCEED'|'FAILED'|'CANCELLED'|'TIMEOUT', jobId: string, jobUrl: string, failureReason?: string, checkedAt: string }>}
 */
export async function waitForAmplifyBuild({
  appId,
  branch,
  commitSha,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxResults = DEFAULT_MAX_RESULTS,
  logger,
}) {
  if (!appId) throw new Error('waitForAmplifyBuild: appId is required');
  if (!branch) throw new Error('waitForAmplifyBuild: branch is required');
  if (!commitSha) throw new Error('waitForAmplifyBuild: commitSha is required');

  const log = {
    info: logger?.info ?? (() => {}),
    warn: logger?.warn ?? (() => {}),
    error: logger?.error ?? (() => {}),
  };

  const startedAt = Date.now();
  let lastSeenJobId = '';
  log.info(`[amplify-gate] start polling appId=${appId} branch=${branch} commit=${commitSha.slice(0, 7)} timeoutMs=${timeoutMs}`);

  while (Date.now() - startedAt < timeoutMs) {
    let jobSummaries = [];
    try {
      jobSummaries = await fetchRecentJobSummaries({ appId, branch, maxResults });
    } catch (err) {
      // CLI 호출 자체 실패 — polling 계속, 다음 주기에 재시도.
      log.warn(`[amplify-gate] list-jobs 실패 (재시도): ${err?.message || err}`);
      await sleep(pollIntervalMs);
      continue;
    }

    // commit SHA 매칭 (이전 batch 빌드 무시)
    const matched = jobSummaries.find((j) => j?.commitId === commitSha);

    if (!matched) {
      // 빌드 큐 진입 대기 — 매칭되는 job이 아직 등록되지 않은 상태.
      log.info(`[amplify-gate] commit ${commitSha.slice(0, 7)} 매칭 job 없음 — 큐 대기 (recent=${jobSummaries.length})`);
      await sleep(pollIntervalMs);
      continue;
    }

    if (matched.jobId && matched.jobId !== lastSeenJobId) {
      lastSeenJobId = matched.jobId;
      log.info(`[amplify-gate] job 매칭 jobId=${matched.jobId} status=${matched.status}`);
    }

    const status = matched.status;

    if (TERMINAL_SUCCESS_STATES.has(status)) {
      log.info(`[amplify-gate] SUCCEED jobId=${matched.jobId}`);
      return buildResult(matched, appId, branch);
    }

    if (TERMINAL_FAILURE_STATES.has(status)) {
      const result = buildResult(matched, appId, branch);
      log.error(`[amplify-gate] ${status} jobId=${matched.jobId} reason=${result.failureReason ?? ''}`);
      return result;
    }

    if (IN_PROGRESS_STATES.has(status)) {
      log.info(`[amplify-gate] ${status} jobId=${matched.jobId} — polling 계속`);
      await sleep(pollIntervalMs);
      continue;
    }

    // 미지의 상태값 — 안전하게 polling 계속 (terminal 상태는 명시 체크 후)
    log.warn(`[amplify-gate] 미지의 status='${status}' jobId=${matched.jobId} — polling 계속`);
    await sleep(pollIntervalMs);
  }

  // 15분 timeout — 매칭 job이 끝내 SUCCEED/FAILED/CANCELLED 도달 안 함 (또는 매칭 자체 실패).
  log.error(`[amplify-gate] TIMEOUT after ${timeoutMs}ms commit=${commitSha.slice(0, 7)} lastSeenJobId=${lastSeenJobId || '(none)'}`);
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-northeast-2';
  return {
    status: 'TIMEOUT',
    jobId: lastSeenJobId,
    jobUrl: lastSeenJobId
      ? `https://${region}.console.aws.amazon.com/amplify/home?region=${region}#/${appId}/branches/${encodeURIComponent(branch)}/deployments/${lastSeenJobId}`
      : '',
    failureReason: `polling timeout (${timeoutMs}ms) — last seen jobId=${lastSeenJobId || '(none)'}`,
    checkedAt: new Date().toISOString(),
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
