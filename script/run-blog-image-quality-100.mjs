#!/usr/bin/env node
// 블로그 이미지 품질 100점 일괄 정비 메인 오케스트레이터 (T19)
//
// 정본:
//   - .spec/blog-image-quality-100/design.md §11.1-§11.10, §12
//   - .spec/blog-image-quality-100/requirements.md AC-실행파이프라인-1/-2, AC-동시성-1, AC-에러-1/-2/-3
//
// Phase 0: 상태 수집 + 분류 (wp-pull + audit-blog-image-quality + 4그룹 분류)
// Phase 1: dry-run mismatch 전수 검출 (audit-body-images --mismatch-only --dry-run)
// Phase 2: 글 단위 처리 루프 (5편 batch, sub-step 1-4, in-memory buffer + checkpoint)
// Phase 3: batch 단위 git rebase + push + Amplify 빌드 게이트
// Phase 4: 최종 audit 100점 검증
//
// 사용:
//   node --env-file=.env script/run-blog-image-quality-100.mjs [OPTIONS]
//     --resume               중단된 progress.json에서 재개
//     --dry-run              실제 PATCH 없이 분석만
//     --batch-size=5         배치당 글 수 (기본 5)
//     --batch-start=1        시작 배치 인덱스 (기본 1)
//     --batch-end=26         종료 배치 인덱스 (기본 ceil(130/5)=26)
//     --ids=4135,4138        특정 글 ID만 처리
//     --skip-amplify-gate    Amplify 빌드 게이트 skip (dev only)
//     --skip-indexnow        IndexNow 제출 skip
//     --force-unlock         좀비 lock 회수 후 시작

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  unlinkSync,
  openSync,
  writeSync,
  closeSync,
  renameSync,
  readdirSync,
} from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';

// 자식 프로세스(wp-push, render-infographic, wp-media-replace)에 lock 게이트 우회 시그널 전달
// 메인 오케스트레이터가 직접 spawn한 자식은 이미 메인이 lock을 보유하므로 자기 자신을 차단하지 않도록 함
process.env.BLOG_IMG_QUALITY_INSIDE_RUN = '1';
import { uptime as osUptime } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

import { createLogger } from './lib/blog-image-logger.mjs';
import { waitForAmplifyBuild } from './lib/amplify-build-gate.mjs';
import { generateBatchReport } from './lib/blog-image-batch-report.mjs';

// === 레거시 자산 메타 백업 경로 (AC-재생성-2) ===
const LEGACY_RECYCLE_DIR = '.recycle/legacy-ai-illustrations';

// === 경로 정본 ===
const ROOT = path.resolve(import.meta.dirname, '..');
const WORK_DIR = path.join(ROOT, 'tmp/blog-image-quality-100');
const LOCK_PATH = path.join(WORK_DIR, '.lock');
const PROGRESS_PATH = path.join(WORK_DIR, 'progress.json');
const BASELINE_PATH = path.join(WORK_DIR, 'state-initial.json');
const MISMATCH_REPORT_PATH = path.join(WORK_DIR, 'mismatch-initial.json');
const MISMATCH_MD_PATH = path.join(WORK_DIR, 'mismatch-initial-report.md');
const ORPHAN_PATH = path.join(WORK_DIR, 'orphan-assets.json');
const POSTS_DIR = path.join(ROOT, 'wp-content/posts');
const MEDIA_DB_PATH = path.join(ROOT, 'wp-content/_media.json');
const DRAFT_ROOT = path.join(ROOT, 'wp-content/drafts/images');

const SUB_STEP_KEYS = ['regeneration-2', 'image-add', 'mismatch', 'regeneration-1'];

// === CLI 파싱 ===
const ARGV = process.argv.slice(2);
function flag(name) {
  return ARGV.includes(`--${name}`);
}
function argVal(name, fallback = null) {
  const hit = ARGV.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  return hit.split('=').slice(1).join('=');
}

const OPTS = {
  resume: flag('resume'),
  dryRun: flag('dry-run'),
  batchSize: parseInt(argVal('batch-size', '5'), 10),
  batchStart: parseInt(argVal('batch-start', '1'), 10),
  batchEnd: argVal('batch-end') ? parseInt(argVal('batch-end'), 10) : null,
  ids: argVal('ids')
    ? argVal('ids').split(',').map((s) => parseInt(s.trim(), 10)).filter(Number.isFinite)
    : null,
  skipAmplifyGate: flag('skip-amplify-gate'),
  skipIndexnow: flag('skip-indexnow'),
  forceUnlock: flag('force-unlock'),
};

// === Logger 초기화 (lock 생성보다 먼저 — 진입 단계 로그도 ndjson 기록) ===
mkdirSync(WORK_DIR, { recursive: true });
const logger = createLogger({
  runDir: WORK_DIR,
  defaultPhase: 'main',
});

// === Lock 게이트 (atomic O_CREAT|O_EXCL, TOCTOU race-free) ===

function getBootSignature() {
  // boot 식별자: 현재 시각 - uptime → 시스템 boot epoch 근사값.
  // 재부팅 시 값이 변하므로 PID 재활용 false-positive 차단.
  return `${Math.floor(Date.now() / 1000 - osUptime())}`;
}

function readLockMeta() {
  try {
    const content = readFileSync(LOCK_PATH, 'utf-8').trim();
    if (!content) return null;
    // JSON 우선, 폴백으로 3행 plain text
    try {
      const parsed = JSON.parse(content);
      if (typeof parsed?.pid === 'number') {
        return {
          pid: parsed.pid,
          startAt: parsed.start_at || parsed.iso || null,
          bootSig: parsed.boot_signature || null,
        };
      }
    } catch {
      // plain text 폴백
    }
    const lines = content.split('\n');
    return {
      pid: parseInt(lines[0], 10),
      startAt: lines[1] || null,
      bootSig: lines[2] || null,
    };
  } catch {
    return null;
  }
}

function isLockAlive(meta) {
  if (!meta || !meta.pid) return false;
  try {
    process.kill(meta.pid, 0); // 살아있는지 검사. ESRCH → 죽음
  } catch (e) {
    if (e.code === 'ESRCH') return false; // dead PID
    if (e.code === 'EPERM') return true; // 권한 부족 — 살아있음으로 간주 (보수적)
    throw e;
  }
  // boot signature 매칭 — PID 재활용 false-positive 차단
  if (meta.bootSig && meta.bootSig !== getBootSignature()) return false;
  return true;
}

function createLock({ forceUnlock = false } = {}) {
  mkdirSync(WORK_DIR, { recursive: true });

  // 좀비 검사 → 좀비면 1회 회수 후 재시도. 그래도 실패면 exit 75.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(LOCK_PATH, 'wx', 0o600); // O_CREAT|O_EXCL atomic
      const payload = JSON.stringify({
        pid: process.pid,
        boot_signature: getBootSignature(),
        start_at: new Date().toISOString(),
      });
      writeSync(fd, payload + '\n');
      closeSync(fd);
      return;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      // 이미 존재 — 좀비 검사
      const meta = readLockMeta();
      if (forceUnlock || !isLockAlive(meta)) {
        process.stderr.write(
          `[WARN] 좀비 lock 회수 (pid=${meta?.pid}, start_at=${meta?.startAt}). force_unlock=${forceUnlock}\n`,
        );
        try { unlinkSync(LOCK_PATH); } catch {}
        continue; // retry
      }
      // 살아있는 lock — 충돌. exit 75 (EX_TEMPFAIL)
      process.stderr.write(
        `[ERR ] 활성 lock 충돌: pid=${meta.pid}, since=${meta.startAt}. exit 75 (EX_TEMPFAIL).\n` +
        `        강제 회수: node script/run-blog-image-quality-100.mjs --force-unlock --resume\n`,
      );
      process.exit(75);
    }
  }
}

function cleanLock() {
  // 자기 lock만 정리 (다른 프로세스 lock 실수 삭제 차단)
  const meta = readLockMeta();
  if (meta && meta.pid === process.pid) {
    try { unlinkSync(LOCK_PATH); } catch {}
  }
}

// === Signal handlers (SIGINT, SIGTERM, SIGHUP, SIGQUIT, uncaughtException) ===
process.on('exit', cleanLock);
process.on('SIGINT', () => { cleanLock(); process.exit(130); });
process.on('SIGTERM', () => { cleanLock(); process.exit(143); });
process.on('SIGHUP', () => { cleanLock(); process.exit(129); });
process.on('SIGQUIT', () => { cleanLock(); process.exit(131); });
process.on('uncaughtException', (e) => {
  try {
    process.stderr.write(`[ERR ] uncaughtException: ${e?.stack || e?.message || String(e)}\n`);
  } catch {}
  cleanLock();
  process.exit(1);
});
process.on('unhandledRejection', (e) => {
  try {
    process.stderr.write(`[ERR ] unhandledRejection: ${e?.stack || e?.message || String(e)}\n`);
  } catch {}
  cleanLock();
  process.exit(1);
});

// === Atomic write helper (rename trick — partial write 회피) ===
function atomicWriteJson(filePath, obj) {
  const dir = path.dirname(filePath);
  mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync(tmpPath, JSON.stringify(obj, null, 2), 'utf-8');
  renameSync(tmpPath, filePath);
}

// === Progress.json 로드/저장 ===

function loadProgress() {
  if (!existsSync(PROGRESS_PATH)) return null;
  try {
    return JSON.parse(readFileSync(PROGRESS_PATH, 'utf-8'));
  } catch (e) {
    logger.warn(`progress.json 파싱 실패: ${e.message}. 새로 시작합니다.`);
    return null;
  }
}

function saveProgress(progress) {
  progress._updated_at = new Date().toISOString();
  atomicWriteJson(PROGRESS_PATH, progress);
}

function initProgress() {
  const now = new Date().toISOString();
  return {
    _run_status: 'in-progress',
    _started_at: now,
    _updated_at: now,
    _mismatch_total: 0,
    _mismatch_processed: 0,
    _batch_index: 0,
    _batch_size: OPTS.batchSize,
    _amplify_last_build: null,
    _failures: {
      consecutive: 0,
      cumulative: 0,
      total_attempted: 0,
    },
    _classification: {
      groupA: [],
      groupB: [],
      groupC: [],
      groupD: [],
      imageAdd1: [],
      imageAdd2: [],
      mismatch: [],
    },
    posts: {},
  };
}

// === post 1편 정보 로드 ===

function loadPostFile(postId) {
  const filePath = path.join(POSTS_DIR, `${postId}.md`);
  if (!existsSync(filePath)) return null;
  const raw = readFileSync(filePath, 'utf-8');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return null;
  try {
    const meta = JSON.parse(m[1]);
    return { meta, body: m[2].replace(/\n$/, ''), filePath };
  } catch (e) {
    logger.warn(`post ${postId} frontmatter 파싱 실패: ${e.message}`);
    return null;
  }
}

function loadAllLocalPosts() {
  if (!existsSync(POSTS_DIR)) return [];
  const files = readdirSync(POSTS_DIR).filter((f) => /^\d+\.md$/.test(f));
  const posts = [];
  for (const f of files) {
    const id = parseInt(f.replace(/\.md$/, ''), 10);
    const p = loadPostFile(id);
    if (p && p.meta?.status === 'publish') {
      posts.push({ id, slug: p.meta.slug, meta: p.meta, body: p.body });
    }
  }
  return posts;
}

// === 본문 이미지 분석 (분류용) ===

function extractBodyImages(html) {
  // <img> 태그 추출 — figure 안/밖 모두
  const imgs = [];
  const re = /<img\s+([^>]*?)\/?>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1];
    const src = attrs.match(/\bsrc=["']([^"']+)["']/)?.[1] || '';
    const alt = attrs.match(/\balt=["']([^"']*)["']/)?.[1] ?? null;
    const w = attrs.match(/\bwidth=["']?(\d+)["']?/);
    const h = attrs.match(/\bheight=["']?(\d+)["']?/);
    const width = w ? parseInt(w[1], 10) : null;
    const height = h ? parseInt(h[1], 10) : null;
    imgs.push({ src, alt, width, height });
  }
  return imgs;
}

function hasHtmlSource(slug) {
  if (!slug) return false;
  const dir = path.join(DRAFT_ROOT, slug);
  if (!existsSync(dir)) return false;
  try {
    return readdirSync(dir).some((f) => f.endsWith('.html'));
  } catch {
    return false;
  }
}

// === 4그룹 분류 (Phase 0) ===

function classifyPost(post) {
  // 정본 design.md §2.1
  // 그룹 D: _image_exempt true
  // 그룹 A: 본문에 width<1200 자산 + HTML 소스 보유
  // 그룹 C: 본문 alt 정보 < 30자 (alt 평균 미만)
  // 그룹 B: 그 외 (alt 충분)
  const meta = post.meta || {};
  if (meta._image_exempt === true) return 'groupD';

  const imgs = extractBodyImages(post.body || '');
  const hasSmallWidth = imgs.some((i) => i.width != null && i.width < 1200);
  const hasHtml = hasHtmlSource(post.slug);
  if (hasSmallWidth && hasHtml) return 'groupA';

  // alt 평균 길이
  const altLens = imgs.map((i) => (i.alt ? i.alt.trim().length : 0));
  const avgAlt = altLens.length === 0 ? 0 : altLens.reduce((a, b) => a + b, 0) / altLens.length;
  if (avgAlt < 30 && imgs.length > 0) return 'groupC';

  return 'groupB';
}

function countImages(post) {
  // hero(featured_media) 1 + 본문 이미지 갯수
  const bodyImgs = extractBodyImages(post.body || '');
  const heroCount = post.meta?.featured_media ? 1 : 0;
  return heroCount + bodyImgs.length;
}

function detectIssues(post) {
  const issues = [];
  const imgs = extractBodyImages(post.body || '');
  const imgCount = countImages(post);
  // AC-재생성-2 — saved-images/ 매칭 또는 1792×1024
  const hasAiIllust = imgs.some((i) =>
    /\/saved-images\//.test(i.src) ||
    (i.width === 1792 && i.height === 1024),
  );
  if (hasAiIllust) issues.push('ai-illustration');
  // AC-이미지보강
  if (imgCount === 1) issues.push('single-image');
  if (imgCount === 2) issues.push('two-image');
  // AC-재생성-1 — width < 1200
  if (imgs.some((i) => i.width != null && i.width < 1200)) issues.push('width-lt-1200');
  return issues;
}

// === Sub-step idempotent skip 조건 (design §11.5 / requirements AC-실행파이프라인-2) ===

function shouldSkipSubStep1(post) {
  // AC-재생성-2: saved-images/ 매칭 또는 1792×1024 dim 매칭이 0건이면 skip
  const imgs = extractBodyImages(post.body || '');
  const matches = imgs.filter((i) =>
    /\/saved-images\//.test(i.src) ||
    (i.width === 1792 && i.height === 1024),
  );
  return matches.length === 0;
}

function shouldSkipSubStep2(post) {
  // AC-이미지보강: imgCount ≥ 3이면 skip
  return countImages(post) >= 3;
}

function shouldSkipSubStep3(post, mismatchFindings = []) {
  // AC-Mismatch-1: 본 글의 mismatch 0건이면 skip
  const myFindings = mismatchFindings.filter((f) => Number(f.post_id) === Number(post.id || post.meta?.id));
  return myFindings.length === 0;
}

function shouldSkipSubStep4(post) {
  // AC-재생성-1: 본문 <img> 중 width<1200 매칭 0건이면 skip
  const imgs = extractBodyImages(post.body || '');
  return !imgs.some((i) => i.width != null && i.width < 1200);
}

// === Checkpoint 관리 (in-memory buffer + 디스크 2중 보호) ===

function checkpointPath(postId) {
  return path.join(WORK_DIR, `checkpoint-${postId}.json`);
}

function saveCheckpoint(postId, lastCompletedSubStep, bodyHtml, frontmatterPatch, pendingMediaUploads = []) {
  const checkpoint = {
    post_id: postId,
    last_completed_sub_step: lastCompletedSubStep,
    body_html_hash: crypto.createHash('sha256').update(bodyHtml || '').digest('hex'),
    body_html: bodyHtml,
    frontmatter_patch: frontmatterPatch,
    pending_media_uploads: pendingMediaUploads,
    saved_at: new Date().toISOString(),
  };
  atomicWriteJson(checkpointPath(postId), checkpoint);
}

function clearCheckpoint(postId) {
  const p = checkpointPath(postId);
  if (existsSync(p)) {
    try { unlinkSync(p); } catch {}
  }
}

function loadCheckpoint(postId) {
  const p = checkpointPath(postId);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf-8')); } catch { return null; }
}

// === STOP 트리거 평가 (design §11.4, requirements AC-에러-3) ===

function evaluateStopTriggers(progress, lastFailures, opts = {}) {
  const { phase = 'post-process' } = opts;
  const posts = Object.values(progress.posts || {});
  const totalProcessed = posts.filter((p) => p.status === 'done' || p.status === 'failed').length;
  const totalFailed = posts.filter((p) => p.status === 'failed').length;

  // Amplify 빌드 실패 — 즉시 STOP (글 단위 카운터와 무관)
  if (progress._amplify_last_build === 'failed') return 'amplify-build-failed';

  // 연속 실패 5편
  if (lastFailures.consecutive >= 5) return 'consecutive-failures';

  // 누적 실패율 — initial grace window 적용
  if (totalProcessed >= 5 && totalProcessed < 10) {
    if (totalFailed / totalProcessed >= 0.4) return 'cumulative-40pct-first-batch';
  } else if (totalProcessed >= 10) {
    if (totalFailed / totalProcessed >= 0.2) return 'cumulative-20pct';
  }
  // phase 'pre-push'는 (a)에서 갱신된 카운터를 기반으로 평가만 수행. 추가 로직 없음.
  void phase;
  return null;
}

function reportStop(progress, reason, lastPost) {
  progress._run_status = 'stopped';
  saveProgress(progress);
  const reasonKor = {
    'consecutive-failures': '연속 5편 실패',
    'cumulative-20pct': '누적 실패율 ≥ 20%',
    'cumulative-40pct-first-batch': '누적 실패율 ≥ 40% (첫 batch)',
    'amplify-build-failed': 'Amplify 빌드 실패',
    'rebase-conflict': 'git rebase conflict',
    'amplify-timeout': 'Amplify 빌드 timeout',
  }[reason] || reason;

  logger.stop(`${reasonKor}로 중단했습니다.`, { phase: 'stop', sub_step: lastPost?.last_sub_step });
  if (lastPost) {
    logger.stop(`        마지막 글: ID ${lastPost.id} (${lastPost.slug || '-'})`);
  }
  logger.stop('        복구: node script/run-blog-image-quality-100.mjs --resume');
  logger.stop('        또는 강제 회수 후 재시작: --force-unlock --resume');
}

// === Phase 0: 데이터 수집 + 분류 ===

async function phase0_collectState(progress) {
  logger.info('[Phase 0] 상태 수집 + 분류 시작', { phase: 'phase0' });

  // 1. wp-pull — frontmatter 최신화 (dry-run 모드에서는 skip)
  if (!OPTS.dryRun && !OPTS.resume) {
    try {
      logger.info('  wp-pull.mjs 실행 (frontmatter + _media.json 최신화)', { phase: 'phase0' });
      const r = spawnSync('node', ['script/wp-pull.mjs'], {
        cwd: ROOT,
        encoding: 'utf-8',
        stdio: ['inherit', 'inherit', 'inherit'],
      });
      if (r.status !== 0) {
        logger.warn(`wp-pull 실패 (status=${r.status}). 로컬 캐시로 진행합니다.`, { phase: 'phase0' });
      }
    } catch (e) {
      logger.warn(`wp-pull 실행 오류: ${e.message}. 로컬 캐시로 진행합니다.`, { phase: 'phase0' });
    }
  } else {
    logger.info('  wp-pull skip (dry-run 또는 resume)', { phase: 'phase0' });
  }

  // 2. audit-blog-image-quality --all --json → baseline
  // audit 스크립트는 findings가 있으면 exit code 1을 리턴할 수 있으므로 stdout 내용 기준으로 판정.
  if (!OPTS.resume || !existsSync(BASELINE_PATH)) {
    try {
      logger.info('  audit-blog-image-quality.mjs --all --json 실행 (baseline)', { phase: 'phase0' });
      const r = spawnSync(
        'node',
        ['script/audit-blog-image-quality.mjs', '--all', '--json'],
        { cwd: ROOT, encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024 },
      );
      if (r.stdout) {
        try {
          atomicWriteJson(BASELINE_PATH, JSON.parse(r.stdout));
        } catch (parseErr) {
          logger.warn(`audit JSON 파싱 실패 (status=${r.status}): ${parseErr.message}. baseline 없이 진행합니다.`, { phase: 'phase0' });
        }
      } else {
        logger.warn(`audit stdout 없음 (status=${r.status}). baseline 없이 진행합니다.`, { phase: 'phase0' });
      }
    } catch (e) {
      logger.warn(`audit 실행 오류: ${e.message}. baseline 없이 진행합니다.`, { phase: 'phase0' });
    }
  }

  // 3. 로컬 publish 글 130편 로드 + 분류
  const allPosts = loadAllLocalPosts();
  let targetPosts = allPosts;
  if (OPTS.ids && OPTS.ids.length > 0) {
    const idSet = new Set(OPTS.ids);
    targetPosts = allPosts.filter((p) => idSet.has(p.id));
  }

  logger.info(`  로컬 publish 글 ${allPosts.length}편 로드 (필터 적용 후 ${targetPosts.length}편)`, {
    phase: 'phase0',
  });

  const classification = {
    groupA: [],
    groupB: [],
    groupC: [],
    groupD: [],
    imageAdd1: [],
    imageAdd2: [],
    mismatch: [],
  };

  for (const post of targetPosts) {
    const group = classifyPost(post);
    classification[group].push(post.id);

    const imgCount = countImages(post);
    if (imgCount === 1) classification.imageAdd1.push(post.id);
    if (imgCount === 2) classification.imageAdd2.push(post.id);

    // progress.json posts 초기화 (resume 시 보존)
    if (!progress.posts[post.id]) {
      progress.posts[post.id] = {
        id: post.id,
        slug: post.slug,
        status: 'pending',
        issues: detectIssues(post),
        sub_steps: {
          'regeneration-2': 'pending',
          'image-add': 'pending',
          'mismatch': 'pending',
          'regeneration-1': 'pending',
        },
        wp_push_completed: false,
        audit_score: null,
        build_cycles: 0,
        errors: [],
        updated_at: new Date().toISOString(),
      };
    }
  }
  progress._classification = classification;
  saveProgress(progress);

  logger.info(
    `  분류 결과 — 그룹 A: ${classification.groupA.length}편, B: ${classification.groupB.length}편, ` +
    `C: ${classification.groupC.length}편, D: ${classification.groupD.length}편, ` +
    `imageAdd1: ${classification.imageAdd1.length}편, imageAdd2: ${classification.imageAdd2.length}편`,
    { phase: 'phase0' },
  );

  logger.ok('[Phase 0] 상태 수집 + 분류 완료', { phase: 'phase0' });
}

// === Phase 1: dry-run mismatch 전수 검출 ===

async function phase1_dryRunMismatch(progress) {
  logger.info('[Phase 1] dry-run figcaption mismatch 전수 검출', { phase: 'phase1' });

  let mismatchFindings = [];
  try {
    const args = [
      'script/audit-body-images.mjs',
      '--mismatch-only',
      '--dry-run',
      '--json',
      `--out=${path.relative(ROOT, MISMATCH_REPORT_PATH)}`,
    ];
    if (OPTS.ids && OPTS.ids.length > 0) {
      args.push(`--ids=${OPTS.ids.join(',')}`);
    }
    const r = spawnSync('node', args, {
      cwd: ROOT,
      encoding: 'utf-8',
      maxBuffer: 32 * 1024 * 1024,
    });
    if (r.status === 0 && r.stdout) {
      try {
        const parsed = JSON.parse(r.stdout);
        mismatchFindings = Array.isArray(parsed?.figcaptionMismatch)
          ? parsed.figcaptionMismatch
          : (Array.isArray(parsed?.findings) ? parsed.findings : []);
      } catch (e) {
        logger.warn(`mismatch JSON 파싱 실패: ${e.message}`, { phase: 'phase1' });
      }
    } else if (existsSync(MISMATCH_REPORT_PATH)) {
      const parsed = JSON.parse(readFileSync(MISMATCH_REPORT_PATH, 'utf-8'));
      mismatchFindings = Array.isArray(parsed?.figcaptionMismatch)
        ? parsed.figcaptionMismatch
        : (Array.isArray(parsed?.findings) ? parsed.findings : []);
    } else {
      logger.warn(`audit-body-images --mismatch-only 실행 실패 status=${r.status}`, { phase: 'phase1' });
    }
  } catch (e) {
    logger.warn(`audit-body-images 실행 오류: ${e.message}`, { phase: 'phase1' });
  }

  progress._mismatch_total = mismatchFindings.length;
  progress._mismatch_findings = mismatchFindings; // 메모리 캐시 (Phase 2 sub-step 3에서 활용)
  saveProgress(progress);

  // mismatch 글 ID 분류 등록
  const mismatchIds = new Set(
    mismatchFindings
      .map((f) => Number(f.post_id ?? f.postId ?? f.id))
      .filter(Number.isFinite),
  );
  progress._classification.mismatch = [...mismatchIds];

  // 운영자 보고서 생성 (Markdown)
  const lines = [
    `# Phase 1 — figcaption mismatch 초기 보고`,
    ``,
    `생성 시각: ${new Date().toISOString()}`,
    ``,
    `## 요약`,
    ``,
    `- 검출 mismatch: ${mismatchFindings.length}건`,
    `- 영향 글 수: ${mismatchIds.size}편`,
    `- JSON 보고서: \`${path.relative(ROOT, MISMATCH_REPORT_PATH)}\``,
    ``,
  ];
  if (mismatchFindings.length > 0) {
    lines.push('## mismatch 글 목록');
    lines.push('');
    lines.push('| post_id | src | figcaption 일부 |');
    lines.push('|---|---|---|');
    for (const f of mismatchFindings.slice(0, 100)) {
      const pid = f.post_id ?? f.postId ?? f.id ?? '-';
      const src = (f.src || f.url || '-').slice(-60);
      const cap = (f.figcaption || f.caption || '-').replace(/\|/g, '\\|').slice(0, 60);
      lines.push(`| ${pid} | …${src} | ${cap} |`);
    }
    if (mismatchFindings.length > 100) {
      lines.push(`| … | (${mismatchFindings.length - 100}건 추가) | … |`);
    }
  }
  writeFileSync(MISMATCH_MD_PATH, lines.join('\n') + '\n', 'utf-8');

  logger.ok(
    `[Phase 1] mismatch ${mismatchFindings.length}건 검출 — 보고서 ${path.relative(ROOT, MISMATCH_MD_PATH)}`,
    { phase: 'phase1' },
  );
}

// =====================================================================
// sub-step 실제 구현 (design §11.2, AC-재생성-1/-2, AC-이미지보강, AC-Mismatch-1)
// =====================================================================
//
// 공통 in-memory buffer 스키마:
//   buffer.bodyHtml          — 본문 HTML 버퍼 (sub-step 누적 PATCH)
//   buffer.frontmatter       — frontmatter 객체 (sub-step 누적 PATCH)
//   buffer.frontmatterPatch  — frontmatter 변경 차분 (checkpoint 기록용)
//   buffer.removedMediaIds   — sub-step 1에서 제거한 WP 미디어 ID
//   buffer.pendingMediaUploads — sub-step 2/4에서 업로드 예정인 신규 미디어
//   buffer.changes           — { removed_illustrations, added_images, fixed_figcaptions, regenerated_assets }
//   buffer.plannedInserts    — dry-run에서 기록되는 sub-step 2 계획
//   buffer.plannedRegens     — dry-run에서 기록되는 sub-step 4 계획

// --- 본문 HTML 헬퍼 ---

/** `<figure>...</figure>` 블록 1개 위치/길이를 찾는다. <img>가 포함된 figure 단위로 인식. */
function findFigureBlocks(html) {
  const blocks = [];
  const re = /<figure\b[^>]*>([\s\S]*?)<\/figure>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    blocks.push({ start: m.index, end: m.index + m[0].length, full: m[0], inner: m[1] });
  }
  return blocks;
}

/** 블록 안의 <img> 정보 1건 추출 (없으면 null) */
function extractFirstImg(block) {
  const im = block.inner.match(/<img\b([^>]*?)\/?>/);
  if (!im) return null;
  const attrs = im[1];
  const src = attrs.match(/\bsrc=["']([^"']+)["']/)?.[1] || '';
  const alt = attrs.match(/\balt=["']([^"']*)["']/)?.[1] ?? null;
  const w = attrs.match(/\bwidth=["']?(\d+)["']?/);
  const h = attrs.match(/\bheight=["']?(\d+)["']?/);
  const id = attrs.match(/\bclass=["'][^"']*\bwp-image-(\d+)\b/)?.[1]
    || block.inner.match(/wp:image\s*\{\s*[^}]*"id"\s*:\s*(\d+)/)?.[1]
    || null;
  return {
    src,
    alt,
    width: w ? parseInt(w[1], 10) : null,
    height: h ? parseInt(h[1], 10) : null,
    mediaId: id ? parseInt(id, 10) : null,
    tag: im[0],
  };
}

/** figcaption 텍스트 추출 (HTML 태그 제거) */
function extractFigcaption(block) {
  const fc = block.inner.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i);
  if (!fc) return null;
  return fc[1].replace(/<[^>]+>/g, '').trim();
}

/** AI 일러스트 시그널 검출 (src에 saved-images/ 또는 1792×1024 dim) */
function isAiIllustrationImg(img) {
  if (!img) return false;
  const src = img.src || '';
  if (/\/saved-images\//.test(src)) return true;
  if (img.width === 1792 && img.height === 1024) return true;
  return false;
}

/** 블록 직전·직후의 wp:image 주석을 같이 잘라내기 위한 경계 확장 */
function expandWpImageCommentBoundary(html, block) {
  // <!-- wp:image ... --> 직전 주석을 포함
  let start = block.start;
  const beforeSlice = html.slice(0, start);
  const wpStartRe = /<!--\s*wp:image\b[\s\S]*?-->\s*$/;
  const wpStartMatch = beforeSlice.match(wpStartRe);
  if (wpStartMatch) {
    start = beforeSlice.length - wpStartMatch[0].length;
  }
  // <!-- /wp:image --> 직후 주석을 포함
  let end = block.end;
  const afterSlice = html.slice(end);
  const wpEndRe = /^\s*<!--\s*\/wp:image\s*-->/;
  const wpEndMatch = afterSlice.match(wpEndRe);
  if (wpEndMatch) {
    end = end + wpEndMatch[0].length;
  }
  return { start, end };
}

/** buffer.changes 초기화 (재진입에서 0 보장) */
function ensureChanges(buffer) {
  if (!buffer.changes) {
    buffer.changes = {
      removed_illustrations: 0,
      added_images: 0,
      fixed_figcaptions: 0,
      regenerated_assets: 0,
    };
  }
}

/** 레거시 자산 메타 백업 (즉시 삭제 금지 — .recycle/ 이동) */
function backupLegacyAiIllustration({ postId, slug, mediaId, img, figcaption }) {
  try {
    const dir = path.join(ROOT, LEGACY_RECYCLE_DIR);
    mkdirSync(dir, { recursive: true });
    const safeMedia = mediaId || `nomid-${crypto.randomBytes(4).toString('hex')}`;
    const filePath = path.join(dir, `${slug || 'unknown'}-${safeMedia}.json`);
    const payload = {
      post_id: postId,
      slug,
      media_id: mediaId,
      original_src: img.src,
      original_alt: img.alt,
      original_width: img.width,
      original_height: img.height,
      original_figcaption: figcaption || null,
      removed_at: new Date().toISOString(),
    };
    atomicWriteJson(filePath, payload);
  } catch (e) {
    logger.warn(`legacy 백업 실패 post=${postId} media=${mediaId}: ${e.message}`, {
      phase: 'phase2-build',
      post_id: postId,
    });
  }
}

// --- sub-step 1: AI 일러스트 제거 (AC-재생성-2, AC-룰-1) ---

async function runSubStep1_aiIllustRemoval(post, buffer) {
  ensureChanges(buffer);
  // skip 조건 — buffer 기준 재평가
  if (shouldSkipSubStep1({ ...post, body: buffer.bodyHtml })) {
    return { skipped: true, changes: 0 };
  }

  // 본문에서 figure 블록 탐색 → AI 일러스트만 제거
  const blocks = findFigureBlocks(buffer.bodyHtml);
  // 마지막 블록부터 잘라야 인덱스 충돌이 없다
  const removals = [];
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];
    const img = extractFirstImg(block);
    if (!img) continue;
    if (!isAiIllustrationImg(img)) continue;
    const figcaption = extractFigcaption(block);
    removals.push({ block, img, figcaption });
  }
  if (removals.length === 0) {
    return { skipped: true, changes: 0 };
  }

  let removedCount = 0;
  for (const { block, img, figcaption } of removals) {
    const range = expandWpImageCommentBoundary(buffer.bodyHtml, block);
    // 본문에서 잘라낸다
    buffer.bodyHtml = buffer.bodyHtml.slice(0, range.start) + buffer.bodyHtml.slice(range.end);
    // 레거시 메타 백업 (.recycle/) — dry-run에서도 인덱스 유지 목적으로 기록 (즉시 삭제 금지 정책 정합)
    if (!OPTS.dryRun) {
      backupLegacyAiIllustration({
        postId: post.id ?? post.meta?.id,
        slug: post.slug ?? post.meta?.slug,
        mediaId: img.mediaId,
        img,
        figcaption,
      });
    }
    if (img.mediaId) {
      if (!buffer.removedMediaIds) buffer.removedMediaIds = [];
      buffer.removedMediaIds.push(img.mediaId);
    }
    removedCount += 1;
  }

  buffer.changes.removed_illustrations += removedCount;
  logger.info(`    sub-step 1 — AI 일러스트 ${removedCount}장 제거 (post=${post.id ?? post.meta?.id})`, {
    phase: 'phase2-build',
    sub_step: 'regeneration-2',
    post_id: post.id ?? post.meta?.id,
  });
  return { skipped: false, changes: removedCount, dryRun: OPTS.dryRun };
}

// --- sub-step 2: imgCount 보강 (AC-이미지보강-1·-2) ---

/** 본문 키워드로 인포그래픽 카탈로그를 매칭. 가장 일반적인 형태로 fallback. */
function selectInfographicTemplate(post, buffer) {
  const haystack = `${post.meta?.title || ''} ${post.meta?.tags?.join(' ') || ''} ${(buffer.bodyHtml || '').slice(0, 4000)}`.toLowerCase();
  // 키워드 → 템플릿 매핑 (간단 휴리스틱)
  const rules = [
    [/(통계|stat|수치|MAU|%)/i, 'industry-stat-card'],
    [/(비교|vs|대결|차이)/i, 'comparison-2col'],
    [/(체크리스트|checklist|do\b|don't)/i, 'mistake-vs-fix'],
    [/(단계|step|절차|루틴)/i, 'step-by-step'],
    [/(타임라인|연도|history|연대기)/i, 'timeline-vertical'],
    [/(장점|단점|pros|cons)/i, 'pros-cons-card'],
    [/(가격|요금|plan|pricing)/i, 'pricing-table'],
    [/(인용|quote|발언)/i, 'quote-card'],
    [/(공식|formula|계산)/i, 'formula-explained'],
    [/(순위|랭킹|top|ranked)/i, 'ranked-list'],
    [/(차트|trend|추세)/i, 'mini-chart-trend'],
    [/(막대|bar|점유율)/i, 'mini-chart-bar'],
    [/(파이|pie|비중)/i, 'pie-chart-mini'],
    [/(before|after|이전|이후)/i, 'before-after'],
    [/(플로우|flow|구조도)/i, 'flowchart-mini'],
  ];
  for (const [re, key] of rules) {
    if (re.test(haystack)) return key;
  }
  return 'industry-stat-card'; // 안전 fallback
}

// --- sub-step 2 helpers: 인포그래픽 신규 생성 (실제 렌더 + WP 업로드 + 본문 삽입) ---

/** 로고 base64 데이터 URI (모듈 로드 시 1회 계산) — .ai-rules/infographic-html.md §1.5 */
let _LOGO_DATA_URI_CACHE = null;
function getLogoDataUri() {
  if (_LOGO_DATA_URI_CACHE) return _LOGO_DATA_URI_CACHE;
  try {
    const logoPath = path.join(ROOT, 'wp-content/illustrations/snshelp-logo.webp');
    const buf = readFileSync(logoPath);
    _LOGO_DATA_URI_CACHE = `data:image/webp;base64,${buf.toString('base64')}`;
    return _LOGO_DATA_URI_CACHE;
  } catch (e) {
    logger.warn(`logo base64 인라인 실패: ${e.message}`, { phase: 'phase2-build', sub_step: 'image-add' });
    return null;
  }
}

/** 글 본문에서 H2 첫 제목과 간단 통계(%) 1-3개 추출 */

function normalizeCdnUrl(sourceUrl) {
  // WP REST API가 반환하는 source_url을 CDN URL로 변환
  // http://52.79.247.124/wp-content/... 또는 http://다른도메인/wp-content/...
  // → https://assets.helpsns.com/wp-content/...
  if (!sourceUrl) return sourceUrl;
  return sourceUrl.replace(/^https?:\/\/[^/]+\/wp-content\//, 'https://assets.helpsns.com/wp-content/');
}

function extractStatsFromBody(bodyHtml) {
  const result = { h2: null, stats: [] };
  if (!bodyHtml) return result;
  const h2m = bodyHtml.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  if (h2m) {
    result.h2 = h2m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  }
  // %/배/억/만 + 라벨 풀려 추출 (가벼운 휴리스틱)
  const numRe = /(\d{1,3}(?:[\.,]\d+)?)\s*(%|배|억|만|조|개|건|만 명|만명|시간|분)/g;
  const seen = new Set();
  let m;
  while ((m = numRe.exec(bodyHtml.replace(/<[^>]+>/g, ' '))) !== null && result.stats.length < 3) {
    const key = `${m[1]}${m[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.stats.push({ value: m[1], unit: m[2] });
  }
  return result;
}

/** HTML escape (속성·텍스트 모두 사용 가능한 최소 셋) */
function htmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 템플릿 HTML을 읽어 스마트 폴백 치환 후 반환.
 * - 로고 상대경로(`../../wp-content/illustrations/snshelp-logo.webp` 또는 `../../../illustrations/...`)를 base64 data URI로 교체
 * - 글 제목/H2/통계로 핵심 텍스트 일부를 글 주제에 맞게 치환 (templateKey별 선택적)
 */
function buildInfographicHtml({ templateKey, post, buffer }) {
  const tplPath = path.join(ROOT, 'script/infographic-templates', `${templateKey}.html`);
  let html;
  try {
    html = readFileSync(tplPath, 'utf-8');
  } catch (e) {
    // 폴백: 기본 템플릿
    html = readFileSync(path.join(ROOT, 'script/infographic-templates/industry-stat-card.html'), 'utf-8');
  }

  // 1) 로고 base64 인라인 (모든 상대경로 형식 흡수)
  const logoUri = getLogoDataUri();
  if (logoUri) {
    html = html.replace(
      /src=["'][^"']*illustrations\/snshelp-logo\.webp["']/g,
      `src="${logoUri}"`,
    );
  }

  // 2) 글 주제로 핵심 텍스트 치환 (스마트 폴백 — 템플릿별 1-2곳)
  const title = post.meta?.title || buffer.frontmatter?.title || '';
  const stats = extractStatsFromBody(buffer.bodyHtml || '');

  if (templateKey === 'quote-card' && title) {
    // 큰 인용문을 글 제목 + H2 (또는 부제) 조합으로 치환
    const quoteText = stats.h2
      ? `${title} — ${stats.h2}`
      : title;
    html = html.replace(
      /<p class="text-\[40px\] font-bold text-\[#0A0A0A\] leading-\[1\.4\] mb-10 pt-12">[\s\S]*?<\/p>/,
      `<p class="text-[40px] font-bold text-[#0A0A0A] leading-[1.4] mb-10 pt-12">${htmlEscape(quoteText)}</p>`,
    );
  } else if (templateKey === 'industry-stat-card') {
    // 라벨(메인 통계 설명)을 글 제목으로 교체
    if (title) {
      html = html.replace(
        /<p class="text-\[32px\] font-bold text-white mb-3">[\s\S]*?<\/p>/,
        `<p class="text-[32px] font-bold text-white mb-3">${htmlEscape(title)}</p>`,
      );
    }
    // 첫 통계 수치가 있으면 BIG_NUM 교체
    if (stats.stats.length > 0) {
      const big = stats.stats[0];
      html = html.replace(
        /<span class="text-\[160px\] font-black text-white num leading-none">[\s\S]*?<\/span>\s*<span class="text-\[88px\] font-black text-\[#FACC15\] num leading-tight">[\s\S]*?<\/span>/,
        `<span class="text-[160px] font-black text-white num leading-none">${htmlEscape(big.value)}</span>\n      <span class="text-[88px] font-black text-[#FACC15] num leading-tight">${htmlEscape(big.unit)}</span>`,
      );
    }
  }
  return html;
}

/** WP /media POST + (실패 시 3회 backoff). 성공 시 { id, source_url, width, height } 반환 */
async function uploadInfographicToWp({ localPath, alt, filename }) {
  const BASE = process.env.WORDPRESS_BLOG_URL;
  const TOKEN = process.env.WORDPRESS_BLOG_TOKEN;
  if (!BASE || !TOKEN) {
    throw new Error('WORDPRESS_BLOG_URL / WORDPRESS_BLOG_TOKEN 환경변수 누락');
  }
  const buf = readFileSync(localPath);
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${BASE}/media`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${TOKEN}`,
          'Content-Type': 'image/webp',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
        body: buf,
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`WP /media POST HTTP ${res.status}: ${txt.slice(0, 200)}`);
      }
      const media = await res.json();
      // alt_text PATCH (실패해도 무시)
      if (alt) {
        try {
          await fetch(`${BASE}/media/${media.id}`, {
            method: 'POST',
            headers: { Authorization: `Basic ${TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ alt_text: alt, title: alt }),
          });
        } catch { /* alt PATCH 실패는 무시 */ }
      }
      return {
        id: media.id,
        source_url: media.source_url,
        width: media.media_details?.width ?? null,
        height: media.media_details?.height ?? null,
      };
    } catch (e) {
      lastErr = e;
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
      }
    }
  }
  throw new Error(`WP /media POST 3회 실패: ${lastErr?.message || 'unknown'}`);
}

/** 본문의 첫 H2 직전(있으면) 또는 본문 끝에 figure 블록 삽입 */
function insertFigureBefore_firstH2(bodyHtml, figureBlock) {
  const m = bodyHtml.match(/<!--\s*wp:heading\s*-->/);
  if (m && m.index != null) {
    return bodyHtml.slice(0, m.index) + figureBlock + '\n\n' + bodyHtml.slice(m.index);
  }
  // fallback: <h2> 태그 직전
  const m2 = bodyHtml.match(/<h2\b/i);
  if (m2 && m2.index != null) {
    return bodyHtml.slice(0, m2.index) + figureBlock + '\n\n' + bodyHtml.slice(m2.index);
  }
  // 마지막 fallback: 본문 끝
  return bodyHtml.replace(/\n*$/, '') + '\n\n' + figureBlock + '\n';
}

async function runSubStep2_imageAdd(post, buffer) {
  ensureChanges(buffer);
  if (shouldSkipSubStep2({ ...post, body: buffer.bodyHtml, meta: buffer.frontmatter })) {
    return { skipped: true, changes: 0 };
  }

  const heroCount = buffer.frontmatter?.featured_media ? 1 : 0;
  const bodyImgs = extractBodyImages(buffer.bodyHtml);
  let imgCount = heroCount + bodyImgs.length;
  const targetMin = 3;
  if (imgCount >= targetMin) return { skipped: true, changes: 0 };

  // 정책: imgCount < 3이라도 글당 정확히 1장만 신규 추가 (codex 무한 호출/비용 방지).
  // 다회 보강이 필요하면 다음 실행 사이클에서 점진적 누적.
  const templateKey = selectInfographicTemplate(post, buffer);
  const plan = {
    template: templateKey,
    placeholder: 'infographic-1',
    target_width: 1200,
    reason: `imgCount=${imgCount} < ${targetMin} → 1장 신규 인포그래픽 추가`,
  };
  if (!buffer.plannedInserts) buffer.plannedInserts = [];
  buffer.plannedInserts.push(plan);

  if (OPTS.dryRun) {
    logger.info(`    sub-step 2 — dry-run: 1장 보강 계획 기록 (template=${templateKey})`, {
      phase: 'phase2-build',
      sub_step: 'image-add',
      post_id: post.id ?? post.meta?.id,
    });
    return { skipped: false, changes: 0, dryRun: true, planned: 1 };
  }

  // === 실제 모드 ===
  const postId = post.id ?? post.meta?.id;
  const insertsDir = path.join(WORK_DIR, 'inserts');
  mkdirSync(insertsDir, { recursive: true });
  const htmlPath = path.join(insertsDir, `${postId}-infographic.html`);
  const webpPath = path.join(insertsDir, `${postId}-infographic.webp`);

  // 1) HTML 생성 (smart fallback — codex 미사용, schema sample data + 글 주제 치환)
  let html;
  try {
    html = buildInfographicHtml({ templateKey, post, buffer });
    writeFileSync(htmlPath, html, 'utf-8');
  } catch (e) {
    throw new Error(`infographic HTML 생성 실패: ${e.message}`);
  }

  // 2) render-infographic.mjs 호출 (Chrome headless → webp)
  const r = spawnSync(
    'node',
    ['script/render-infographic.mjs', htmlPath, webpPath, '--width=1200', '--max-height=2000'],
    {
      cwd: ROOT,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, BLOG_IMG_QUALITY_INSIDE_RUN: '1' },
    },
  );
  if (r.status !== 0) {
    throw new Error(`render-infographic 실패 (exit=${r.status}): ${(r.stderr || r.stdout || '').slice(0, 300)}`);
  }
  if (!existsSync(webpPath)) {
    throw new Error(`render-infographic 결과 파일 없음: ${webpPath}`);
  }

  // 3) WP /media POST (3회 backoff 포함)
  const altText = `${post.meta?.title || ''} 인포그래픽`.trim();
  const filename = `${post.slug || `post-${postId}`}-infographic.webp`;
  const media = await uploadInfographicToWp({ localPath: webpPath, alt: altText, filename });

  // 4) figure 표시 폭은 1200px 정본 — render-infographic이 DPR=2로 2400을 만들므로
  //    원본 비율을 유지해 1200 기준 logical height로 환산한다.
  let rawW = media.width;
  let rawH = media.height;
  if (!rawW || !rawH) {
    try {
      const sharp = (await import('sharp')).default;
      const meta = await sharp(webpPath).metadata();
      rawW = rawW || meta.width || 2400;
      rawH = rawH || meta.height || 1350;
    } catch {
      rawW = rawW || 2400;
      rawH = rawH || 1350;
    }
  }
  const width = 1200;
  const height = Math.round((1200 * rawH) / rawW);

  // 5) buffer.bodyHtml에 figure 삽입 (첫 H2 직전 또는 본문 끝)
  const altEsc = htmlEscape(altText);
  const figureBlock = `<!-- wp:image {"id":${media.id},"sizeSlug":"large","className":"wp-image-infographic"} -->
<figure class="wp-block-image size-large wp-image-infographic"><img src="${media.source_url}" alt="${altEsc}" class="wp-image-${media.id}" width="${width}" height="${height}"/></figure>
<!-- /wp:image -->`;

  buffer.bodyHtml = insertFigureBefore_firstH2(buffer.bodyHtml, figureBlock);

  // 6) pendingMediaUploads에 (참고용) 신규 미디어 기록 — 이미 업로드 완료 상태
  buffer.pendingMediaUploads.push({
    local_path: webpPath,
    wp_media_id: media.id,
    source_url: media.source_url,
    alt: altText,
    template: templateKey,
    target_width: 1200,
    width,
    height,
    insert_marker: 'infographic-1',
    status: 'uploaded',
  });
  buffer.changes.added_images += 1;

  logger.info(`    sub-step 2 — 1장 신규 인포그래픽 보강 완료 (post=${postId}, media=${media.id}, template=${templateKey})`, {
    phase: 'phase2-build',
    sub_step: 'image-add',
    post_id: postId,
    media_id: media.id,
    template: templateKey,
  });
  return { skipped: false, changes: 1 };
}

// --- sub-step 3: figcaption 정정 (AC-Mismatch-1) ---

/** figcaption을 안전 표현으로 재작성한다 (출처 인용 → 일반 표현). */
function neutralizeFigcaption(original) {
  if (!original) return '예시 이미지';
  let cap = original;
  // "출처: ..." / "자료: ..." 블록 제거
  cap = cap.replace(/(출처|자료|Source|cite)\s*[:：][^.|·。]*/gi, '').trim();
  // 기관명 제거
  cap = cap.replace(/(Statista|식약처|통계청|DataReportal|Meta|Google|Apple|Naver|Kakao|Pew|McKinsey|Nielsen)/gi, '').trim();
  // 연도(20XX) 단독 패턴 제거
  cap = cap.replace(/\b20\d{2}년?\b/g, '').trim();
  // 연속 공백·구두점 정리
  cap = cap.replace(/[,，·、]+\s*[,，·、]+/g, ',').replace(/\s+/g, ' ').replace(/^[,.\s]+|[,.\s]+$/g, '');
  if (!cap || cap.length < 4) return '예시 이미지';
  return cap;
}

async function runSubStep3_mismatchFix(post, buffer, mismatchFindings) {
  ensureChanges(buffer);
  if (shouldSkipSubStep3({ ...post, body: buffer.bodyHtml }, mismatchFindings)) {
    return { skipped: true, changes: 0 };
  }

  // mismatch 결과를 본 글로 한정
  const postId = post.id ?? post.meta?.id;
  const myFindings = (mismatchFindings || []).filter(
    (f) => Number(f.post_id ?? f.postId ?? f.id ?? f.pid) === Number(postId),
  );

  // dry-run 일지라도 mismatch가 있으면 정정 plan을 기록한다
  const blocks = findFigureBlocks(buffer.bodyHtml);
  let fixedCount = 0;
  for (const block of blocks) {
    const img = extractFirstImg(block);
    if (!img) continue;
    const figcaption = extractFigcaption(block);
    if (!figcaption) continue;
    // mismatch 후보 매칭 — src 또는 figcaption substring
    const isMismatch = myFindings.some((f) => {
      if (!f) return false;
      if (f.src && img.src.includes(f.src)) return true;
      if (f.figcaption && figcaption.includes(f.figcaption.slice(0, 40))) return true;
      return false;
    }) || (
      isAiIllustrationImg(img) &&
      /(출처|자료|Source|cite|Statista|통계청|DataReportal|Meta|Google|Apple|Naver|Kakao)/i.test(figcaption)
    );
    if (!isMismatch) continue;

    const newCap = neutralizeFigcaption(figcaption);
    // figcaption 내부만 치환 (HTML 태그 보존)
    const newBlock = block.full.replace(
      /(<figcaption[^>]*>)([\s\S]*?)(<\/figcaption>)/i,
      `$1${newCap}$3`,
    );
    if (newBlock !== block.full) {
      buffer.bodyHtml =
        buffer.bodyHtml.slice(0, block.start) + newBlock + buffer.bodyHtml.slice(block.end);
      fixedCount += 1;
    }
  }

  if (fixedCount > 0) {
    buffer.changes.fixed_figcaptions += fixedCount;
    logger.info(`    sub-step 3 — figcaption ${fixedCount}건 정정 (post=${postId})`, {
      phase: 'phase2-build',
      sub_step: 'mismatch',
      post_id: postId,
    });
    return { skipped: false, changes: fixedCount, dryRun: OPTS.dryRun };
  }
  return { skipped: true, changes: 0 };
}

// --- sub-step 4: 1200px 재생성 (AC-재생성-1) ---

async function runSubStep4_regenerate1200(post, buffer) {
  ensureChanges(buffer);
  if (shouldSkipSubStep4({ ...post, body: buffer.bodyHtml })) {
    return { skipped: true, changes: 0 };
  }

  const blocks = findFigureBlocks(buffer.bodyHtml);
  const candidates = [];
  for (const block of blocks) {
    const img = extractFirstImg(block);
    if (!img) continue;
    if (img.width == null || img.width >= 1200) continue;
    candidates.push({ block, img });
  }
  if (candidates.length === 0) return { skipped: true, changes: 0 };

  if (!buffer.plannedRegens) buffer.plannedRegens = [];
  for (const { img } of candidates) {
    buffer.plannedRegens.push({
      media_id: img.mediaId,
      original_src: img.src,
      original_width: img.width,
      original_height: img.height,
      target_width: 1200,
      reason: `width=${img.width} < 1200`,
    });
  }

  if (OPTS.dryRun) {
    logger.info(`    sub-step 4 — dry-run: ${candidates.length}장 1200px 재생성 계획 기록`, {
      phase: 'phase2-build',
      sub_step: 'regeneration-1',
      post_id: post.id ?? post.meta?.id,
    });
    return { skipped: false, changes: 0, dryRun: true, planned: candidates.length };
  }

  // 실제 모드 — 본문 HTML width/height 속성을 즉시 1200 기준으로 갱신
  // (실제 webp 재렌더와 미디어 교체는 wp-media-replace 호출로 위임. 본 오케스트레이터는
  //  본문 HTML PATCH만 수행하고 미디어는 pendingMediaUploads로 wp-push 직전 일괄 처리한다.)
  let regenerated = 0;
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];
    const img = extractFirstImg(block);
    if (!img) continue;
    if (img.width == null || img.width >= 1200) continue;
    // 비율 계산: 새 높이 = round(1200 * 원래 height / 원래 width)
    const newHeight = img.height && img.width
      ? Math.round((1200 * img.height) / img.width)
      : 675;
    let newBlock = block.full
      .replace(/(<img\b[^>]*\bwidth=["']?)\d+(["']?)/i, `$11200$2`)
      .replace(/(<img\b[^>]*\bheight=["']?)\d+(["']?)/i, `$1${newHeight}$2`);
    // media_id 교체용 pending 등록 — 실제 webp 재렌더는 후처리
    buffer.pendingMediaUploads.push({
      local_path: null,
      wp_media_id: img.mediaId,
      original_src: img.src,
      target_width: 1200,
      target_height: newHeight,
      alt: img.alt || null,
      reason: 'regenerate-1200',
    });
    buffer.bodyHtml =
      buffer.bodyHtml.slice(0, block.start) + newBlock + buffer.bodyHtml.slice(block.end);
    regenerated += 1;
  }
  buffer.changes.regenerated_assets += regenerated;
  logger.info(`    sub-step 4 — ${regenerated}장 1200px 갱신 (post=${post.id ?? post.meta?.id})`, {
    phase: 'phase2-build',
    sub_step: 'regeneration-1',
    post_id: post.id ?? post.meta?.id,
  });
  return { skipped: false, changes: regenerated };
}

// === 글 1편 처리 (Phase 2 핵심) ===

async function processPost(postId, progress, mismatchFindings) {
  const startMs = Date.now();
  const post = loadPostFile(postId);
  if (!post) {
    logger.error(`post ${postId} 로드 실패 (파일 없음 또는 frontmatter 오류)`, {
      post_id: postId,
      phase: 'phase2',
    });
    return { status: 'failed', elapsedMs: Date.now() - startMs, errors: [{ phase: 'load', msg: 'load failed' }] };
  }

  const slug = post.meta.slug;
  const postState = progress.posts[postId] || {
    id: postId,
    slug,
    status: 'pending',
    issues: [],
    sub_steps: {
      'regeneration-2': 'pending',
      'image-add': 'pending',
      'mismatch': 'pending',
      'regeneration-1': 'pending',
    },
    wp_push_completed: false,
    audit_score: null,
    build_cycles: 0,
    errors: [],
  };
  postState.status = 'in-progress';
  postState.updated_at = new Date().toISOString();
  progress.posts[postId] = postState;
  saveProgress(progress);

  logger.info(`  post ${postId} (${slug}) 처리 시작`, { post_id: postId, phase: 'phase2' });

  // in-memory buffer (sub-step 누적)
  const buffer = {
    bodyHtml: post.body,
    frontmatter: { ...post.meta },
    frontmatterPatch: {},
    pendingMediaUploads: [],
    removedMediaIds: [],
    plannedInserts: [],
    plannedRegens: [],
    changes: {
      removed_illustrations: 0,
      added_images: 0,
      fixed_figcaptions: 0,
      regenerated_assets: 0,
    },
  };

  const subStepRunners = [
    { key: 'regeneration-2', name: 'AI 일러스트 제거', fn: runSubStep1_aiIllustRemoval, args: [{ id: postId, slug, meta: post.meta }, buffer] },
    { key: 'image-add', name: 'imgCount 보강', fn: runSubStep2_imageAdd, args: [{ id: postId, slug, meta: post.meta }, buffer] },
    { key: 'mismatch', name: 'figcaption 정정', fn: runSubStep3_mismatchFix, args: [{ id: postId, slug, meta: post.meta }, buffer, mismatchFindings] },
    { key: 'regeneration-1', name: '1200px 재렌더', fn: runSubStep4_regenerate1200, args: [{ id: postId, slug, meta: post.meta }, buffer] },
  ];

  const errors = [];
  for (const step of subStepRunners) {
    postState.sub_steps[step.key] = 'in-progress';
    saveProgress(progress);
    try {
      const result = await step.fn(...step.args);
      if (result?.skipped) {
        postState.sub_steps[step.key] = 'skipped';
        logger.info(`    sub-step ${step.key} (${step.name}) skip — idempotent 조건 충족`, {
          post_id: postId,
          sub_step: step.key,
          phase: 'phase2-build',
        });
      } else {
        postState.sub_steps[step.key] = 'done';
        saveCheckpoint(postId, step.key, buffer.bodyHtml, buffer.frontmatterPatch, buffer.pendingMediaUploads);
        const change = result?.changes ?? 0;
        const planned = result?.planned ?? 0;
        // dry-run에서 changes>0이면 buffer 내 변경 누적, planned>0이면 외부 자산 계획만 기록
        const detail = result?.dryRun
          ? (change > 0 ? `dry-run (changes=${change}, planned=${planned})` : `dry-run (planned=${planned})`)
          : `changes=${change}`;
        logger.info(`    sub-step ${step.key} (${step.name}) 완료 — ${detail}`, {
          post_id: postId,
          sub_step: step.key,
          phase: 'phase2-build',
        });
      }
    } catch (e) {
      postState.sub_steps[step.key] = 'in-progress'; // 미완료 — 재시작 시 처음부터
      const errEntry = {
        phase: `sub-step-${step.key}`,
        msg: e.message,
        at: new Date().toISOString(),
      };
      errors.push(errEntry);
      postState.errors.push(errEntry);
      logger.error(`    sub-step ${step.key} 실패: ${e.message}`, {
        post_id: postId,
        sub_step: step.key,
        phase: 'phase2-build',
        err_stack: e.stack,
      });
      // sub-step 1개 실패 → 글 전체 failed (다음 글 진행)
      postState.status = 'failed';
      postState.updated_at = new Date().toISOString();
      saveProgress(progress);
      return { status: 'failed', elapsedMs: Date.now() - startMs, errors };
    }
    saveProgress(progress);
  }

  // sub_steps 결과 요약 (changes 카운트 기록)
  postState.changes_summary = { ...buffer.changes };
  postState.planned_inserts = buffer.plannedInserts.length;
  postState.planned_regens = buffer.plannedRegens.length;
  saveProgress(progress);

  // wp-push 1회 호출 (in-memory buffer → 실제 PATCH)
  if (OPTS.dryRun) {
    postState.wp_push_completed = false;
    logger.info(`  post ${postId} dry-run — wp-push skip (changes=${JSON.stringify(buffer.changes)})`, {
      post_id: postId,
      phase: 'wp-push',
    });
  } else {
    try {
      // buffer.bodyHtml 정규화: hotlink src → CDN, width=2400 → 1200 logical
      buffer.bodyHtml = buffer.bodyHtml
        .replace(/src=["']https?:\/\/52\.79\.247\.124\/wp-content\//g, 'src="https://assets.helpsns.com/wp-content/')
        .replace(/src=["']http:\/\/52\.79\.247\.124\//g, 'src="https://assets.helpsns.com/')
        .replace(/width="2400"\s+height="(\d+)"/g, (m, h) => `width="1200" height="${Math.round(Number(h) * 1200 / 2400)}"`);

      // buffer.bodyHtml + frontmatter 변경 사항을 wp-content/posts/{id}.md에 atomic write
      const newContent = `---\n${JSON.stringify(buffer.frontmatter, null, 2)}\n---\n${buffer.bodyHtml}\n`;
      writeFileSync(post.filePath, newContent, 'utf-8');

      const r = spawnSync('node', ['--env-file=.env', 'script/wp-push.mjs', String(postId)], {
        cwd: ROOT,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (r.status === 0) {
        postState.wp_push_completed = true;
        clearCheckpoint(postId);
        logger.ok(`  post ${postId} wp-push 완료`, { post_id: postId, phase: 'wp-push' });
      } else {
        const errMsg = `wp-push exit ${r.status}: ${(r.stderr || '').slice(0, 300)}`;
        const errEntry = { phase: 'wp-push', msg: errMsg, at: new Date().toISOString() };
        errors.push(errEntry);
        postState.errors.push(errEntry);
        postState.status = 'failed';
        postState.updated_at = new Date().toISOString();
        saveProgress(progress);
        logger.error(`  post ${postId} wp-push 실패: ${errMsg}`, { post_id: postId, phase: 'wp-push' });
        return { status: 'failed', elapsedMs: Date.now() - startMs, errors };
      }
    } catch (e) {
      const errEntry = { phase: 'wp-push', msg: e.message, at: new Date().toISOString() };
      errors.push(errEntry);
      postState.errors.push(errEntry);
      postState.status = 'failed';
      postState.updated_at = new Date().toISOString();
      saveProgress(progress);
      logger.error(`  post ${postId} wp-push 예외: ${e.message}`, {
        post_id: postId,
        phase: 'wp-push',
        err_stack: e.stack,
      });
      return { status: 'failed', elapsedMs: Date.now() - startMs, errors };
    }
  }

  // audit score (Evaluator 검증 — audit-blog-image-quality.mjs --post=ID 호출)
  if (OPTS.dryRun) {
    postState.audit_score = null;
  } else {
    try {
      const r = spawnSync(
        'node',
        ['script/audit-blog-image-quality.mjs', `--post=${postId}`, '--json'],
        { cwd: ROOT, encoding: 'utf-8', maxBuffer: 16 * 1024 * 1024 },
      );
      let score = null;
      if (r.stdout) {
        try {
          const parsed = JSON.parse(r.stdout);
          const list = parsed?.perPost || parsed?.posts || [];
          const hit = list.find((p) => Number(p.pid ?? p.id) === Number(postId));
          score = hit?.score ?? hit?.audit_score ?? null;
        } catch (e) {
          logger.warn(`audit JSON 파싱 실패 (post=${postId}): ${e.message}`, { post_id: postId, phase: 'wp-push' });
        }
      }
      postState.audit_score = score;
      if (score != null && score < 100) {
        // audit < 100: STOP 트리거 발동 회피를 위해 warn만. 미달 글 목록은 phase4 보고서에 누적
        logger.warn(`  post ${postId} audit ${score} < 100 — done_below_target (보고서에 누적)`, {
          post_id: postId,
          phase: 'wp-push',
        });
        postState.status = 'done_below_target';
        postState.errors.push({
          phase: 'audit-score',
          msg: `audit_score=${score} < 100`,
          at: new Date().toISOString(),
        });
        postState.updated_at = new Date().toISOString();
        saveProgress(progress);
        // STOP 트리거 회피: done_below_target는 실패 아님
        return { status: 'done_below_target', elapsedMs: Date.now() - startMs, errors };
      }
    } catch (e) {
      logger.warn(`  post ${postId} audit 실행 오류: ${e.message}`, { post_id: postId, phase: 'wp-push' });
      postState.audit_score = null;
    }
  }

  postState.status = 'done';
  postState.updated_at = new Date().toISOString();
  saveProgress(progress);

  logger.ok(`  post ${postId} (${slug}) 완료 — audit ${postState.audit_score ?? 'dry'} ` +
    `(${Math.round((Date.now() - startMs) / 1000)}s)`, { post_id: postId, phase: 'phase2' });

  return { status: 'done', elapsedMs: Date.now() - startMs, errors };
}

// === Phase 2: 글 단위 처리 루프 (5편 batch) ===

async function phase2_processLoop(progress) {
  logger.info('[Phase 2] 글 단위 처리 루프 시작', { phase: 'phase2' });

  // 처리 대상 글 ID 정렬 (결함 많은 글 우선)
  const allPostsState = Object.values(progress.posts);
  // 우선순위: AI 일러스트 보유 → width<1200 본문 이미지 수 많은 순 → imgCount==1 → 그 외
  const targetPosts = allPostsState
    .filter((p) => p.status !== 'done')
    .sort((a, b) => {
      const aAi = a.issues.includes('ai-illustration') ? 1 : 0;
      const bAi = b.issues.includes('ai-illustration') ? 1 : 0;
      if (aAi !== bAi) return bAi - aAi;
      const aSmall = a.issues.includes('width-lt-1200') ? 1 : 0;
      const bSmall = b.issues.includes('width-lt-1200') ? 1 : 0;
      if (aSmall !== bSmall) return bSmall - aSmall;
      const aSingle = a.issues.includes('single-image') ? 1 : 0;
      const bSingle = b.issues.includes('single-image') ? 1 : 0;
      if (aSingle !== bSingle) return bSingle - aSingle;
      return a.id - b.id;
    });

  const batchSize = OPTS.batchSize;
  const totalBatches = Math.ceil(targetPosts.length / batchSize);
  const startIdx = OPTS.batchStart - 1;
  const endIdx = OPTS.batchEnd != null ? OPTS.batchEnd : totalBatches;

  logger.info(
    `  처리 대상 ${targetPosts.length}편 / 총 batch ${totalBatches} ` +
    `(시작 ${OPTS.batchStart}, 종료 ${endIdx})`,
    { phase: 'phase2' },
  );

  const mismatchFindings = progress._mismatch_findings || [];

  // heartbeat (5분마다 진행 상태 stdout 출력)
  const startedAt = Date.now();
  const heartbeatInterval = setInterval(() => {
    const elapsedMin = Math.floor((Date.now() - startedAt) / 60000);
    const done = Object.values(progress.posts).filter((p) => p.status === 'done').length;
    const total = Object.values(progress.posts).length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    process.stdout.write(
      `[T+${Math.floor(elapsedMin / 60)}h${elapsedMin % 60}m] ` +
      `batch ${progress._batch_index}/${totalBatches} | post ${done}/${total} (${pct}%)\n`,
    );
  }, 5 * 60 * 1000);

  try {
    for (let batchIdx = startIdx; batchIdx < endIdx; batchIdx++) {
      const batch = targetPosts.slice(batchIdx * batchSize, (batchIdx + 1) * batchSize);
      if (batch.length === 0) break;

      progress._batch_index = batchIdx + 1;
      saveProgress(progress);

      logger.info(
        `[Phase 2] batch ${batchIdx + 1}/${totalBatches} (${Math.round((batchIdx / totalBatches) * 100)}%) ` +
        `시작 — ${batch.length}편 처리`,
        { phase: 'phase2' },
      );

      const batchResults = [];

      for (const postState of batch) {
        const result = await processPost(postState.id, progress, mismatchFindings);
        progress._failures.total_attempted += 1;
        if (result.status === 'failed') {
          progress._failures.consecutive += 1;
          progress._failures.cumulative += 1;
        } else {
          progress._failures.consecutive = 0;
        }
        saveProgress(progress);

        batchResults.push({
          id: postState.id,
          slug: postState.slug,
          status: result.status,
          audit_score: progress.posts[postState.id]?.audit_score ?? null,
          build_cycles: progress.posts[postState.id]?.build_cycles ?? 0,
          sub_steps: progress.posts[postState.id]?.sub_steps ?? {},
          changes_summary: progress.posts[postState.id]?.changes_summary ?? null,
          planned_inserts: progress.posts[postState.id]?.planned_inserts ?? 0,
          planned_regens: progress.posts[postState.id]?.planned_regens ?? 0,
          errors: progress.posts[postState.id]?.errors ?? [],
          elapsed_ms: result.elapsedMs,
        });

        // STOP 트리거 평가 (시점 a — 글 처리 직후, updateCounters=true)
        const stopReason = evaluateStopTriggers(progress, progress._failures, { phase: 'post-process' });
        if (stopReason) {
          reportStop(progress, stopReason, { id: postState.id, slug: postState.slug });
          clearInterval(heartbeatInterval);
          return;
        }
      }

      // === Phase 3: batch 단위 git push + Amplify 게이트 ===
      const phase3Ok = await phase3_batchPushAndAmplify(progress, batch, batchResults, batchIdx + 1);
      if (!phase3Ok) {
        // STOP 또는 빌드 실패 — 다음 batch 차단
        clearInterval(heartbeatInterval);
        return;
      }

      // batch 보고서 생성 (T22 — 9 섹션)
      try {
        // git log 5줄 — best-effort
        let gitLog = '';
        try {
          gitLog = execFileSync('git', ['log', '--oneline', '-5'], {
            cwd: ROOT,
            encoding: 'utf-8',
          }).trim();
        } catch {
          gitLog = '';
        }

        // Facebook Sharing Debugger 결과 (자동) — FB_APP_ACCESS_TOKEN 있을 때만
        const facebookScrapeResults = await scrapeFacebookForBatch(batchResults);

        // 카카오/X 수동 처리 URL 5건 (운영자 처리용)
        const kakaoDebuggerUrls = batchResults.map((p) => ({
          post_id: p.id,
          slug: p.slug,
          page_url: postPublicUrl(p.slug),
          debugger_url: `https://developers.kakao.com/tool/debugger/sharing?url=${encodeURIComponent(postPublicUrl(p.slug))}`,
        }));
        const xCardValidatorUrls = batchResults.map((p) => ({
          post_id: p.id,
          slug: p.slug,
          page_url: postPublicUrl(p.slug),
          validator_url: 'https://cards-dev.twitter.com/validator',
        }));

        await generateBatchReport({
          batchIndex: batchIdx + 1,
          posts: batchResults,
          gitCommitSha: progress._last_commit_sha || '',
          gitLog,
          amplifyBuildUrl: progress._amplify_last_url || '',
          amplifyStatus: progress._amplify_last_build || '',
          amplifyDurationMs: progress._amplify_last_duration_ms || null,
          amplifyJobId: progress._amplify_last_job_id || '',
          indexnowResponse: progress._indexnow_last || null,
          facebookScrapeResults,
          kakaoDebuggerUrls,
          xCardValidatorUrls,
          dryRun: OPTS.dryRun,
          totalBatches,
          runDir: WORK_DIR,
        });
      } catch (e) {
        logger.warn(`batch ${batchIdx + 1} 보고서 생성 실패: ${e.message}`, { phase: 'phase3' });
      }

      // 빌드 안정화 sleep
      if (!OPTS.skipAmplifyGate && !OPTS.dryRun) {
        await sleep(60000);
      }
    }
  } finally {
    clearInterval(heartbeatInterval);
  }

  logger.ok('[Phase 2] 글 단위 처리 루프 종료', { phase: 'phase2' });
}

// === Batch 보고서 보조 — 공유 URL + Facebook 강제 재크롤 (design §14.1) ===

function postPublicUrl(slug) {
  if (!slug) return 'https://www.helpsns.com/';
  return `https://www.helpsns.com/blog/${slug}/`;
}

async function scrapeFacebookForBatch(batch) {
  // FB_APP_ACCESS_TOKEN 있을 때만 자동 호출. dry-run에서는 호출 안 함.
  const token = process.env.FB_APP_ACCESS_TOKEN;
  const results = [];
  if (OPTS.dryRun || !token || !Array.isArray(batch)) {
    return batch.map((p) => ({
      post_id: p.id,
      slug: p.slug,
      url: postPublicUrl(p.slug),
      status: 'skipped',
      reason: OPTS.dryRun ? 'dry-run' : 'no-FB_APP_ACCESS_TOKEN',
      scraped_at: null,
    }));
  }
  for (const p of batch) {
    const targetUrl = postPublicUrl(p.slug);
    try {
      const apiUrl =
        `https://graph.facebook.com/?id=${encodeURIComponent(targetUrl)}` +
        `&scrape=true&access_token=${encodeURIComponent(token)}`;
      const res = await fetch(apiUrl, { method: 'POST' });
      results.push({
        post_id: p.id,
        slug: p.slug,
        url: targetUrl,
        status: res.ok ? 'ok' : `http-${res.status}`,
        scraped_at: new Date().toISOString(),
      });
    } catch (e) {
      results.push({
        post_id: p.id,
        slug: p.slug,
        url: targetUrl,
        status: 'error',
        error: e.message,
        scraped_at: new Date().toISOString(),
      });
    }
  }
  return results;
}

// === Phase 3: batch git rebase + push + Amplify 게이트 ===

async function phase3_batchPushAndAmplify(progress, batch, batchResults, batchNum) {
  if (OPTS.dryRun) {
    logger.info(`[Phase 3] dry-run — batch ${batchNum} git push skip`, { phase: 'phase3' });
    return true;
  }

  logger.info(`[Phase 3] batch ${batchNum} git rebase + push + Amplify 게이트`, { phase: 'phase3' });

  // STOP 트리거 재평가 (시점 b — git push 직전, updateCounters=false)
  const stopReason = evaluateStopTriggers(progress, progress._failures, { phase: 'pre-push' });
  if (stopReason) {
    reportStop(progress, stopReason, { id: batch.at(-1)?.id, slug: batch.at(-1)?.slug });
    return false;
  }

  // 1. git pull --rebase origin master --autostash — silent skip
  // wp-content는 .gitignore라 git push가 본 작업 자산에 영향 없음. rebase 실패도 진행 계속.
  try {
    execFileSync('git', ['pull', '--rebase', '--autostash', 'origin', 'master'], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    logger.warn(`git rebase skip (wp-content는 gitignore — 자산은 WP API push 완료): ${(e.message || '').slice(0, 80)}`, { phase: 'phase3-rebase' });
    return true; // 다음 batch 계속
  }

  // 2. git add — batch 5편만 (다른 파일 동시 commit 차단)
  // wp-content는 .gitignore로 무시됨. 자산은 WP API로 이미 PATCH 완료.
  // git add 실패 = silent skip (Amplify 빌드 트리거 안 필요, 다음 batch 계속).
  try {
    const relPaths = batch.map((p) => `wp-content/posts/${p.id}.md`);
    execFileSync('git', ['add', ...relPaths], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    logger.warn(`git add skip (wp-content는 gitignore — 자산은 WP API로 이미 push됨): ${(e.message || '').slice(0, 100)}`, { phase: 'phase3-push' });
    return true; // 다음 batch 계속
  }

  // 3. git commit
  try {
    execFileSync('git', ['commit', '-m', `Content: 블로그 이미지 품질 100점 batch ${batchNum}`], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    // 변경 사항 없으면 commit 실패해도 무시 (모든 sub-step skip 케이스)
    const msg = String(e.message || '');
    if (/nothing to commit|no changes added/i.test(msg)) {
      logger.info(`  batch ${batchNum} commit skip — 변경 사항 없음`, { phase: 'phase3-push' });
      return true;
    }
    logger.error(`git commit 실패: ${msg}`, { phase: 'phase3-push' });
    return false;
  }

  // commit SHA 기록
  const commitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf-8' }).trim();
  progress._last_commit_sha = commitSha;
  saveProgress(progress);

  // 4. git push
  try {
    execFileSync('git', ['push', 'origin', 'master'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    logger.ok(`  batch ${batchNum} git push 완료 (commit ${commitSha.slice(0, 7)})`, {
      phase: 'phase3-push',
    });
  } catch (e) {
    logger.error(`git push 실패: ${e.message}`, { phase: 'phase3-push' });
    return false;
  }

  // 5. Amplify 빌드 게이트
  if (OPTS.skipAmplifyGate) {
    logger.warn(`  batch ${batchNum} Amplify 게이트 skip (--skip-amplify-gate)`, { phase: 'phase3-amplify' });
    return true;
  }
  const appId = process.env.AMPLIFY_APP_ID || process.env.AWS_APP_ID;
  if (!appId) {
    logger.warn(`  batch ${batchNum} AMPLIFY_APP_ID 미설정 — 게이트 skip`, { phase: 'phase3-amplify' });
    return true;
  }

  const amplifyStartMs = Date.now();
  const result = await waitForAmplifyBuild({
    appId,
    branch: 'master',
    commitSha,
    logger,
  });
  const amplifyDurationMs = Date.now() - amplifyStartMs;
  progress._amplify_last_build =
    result.status === 'SUCCEED' ? 'success' :
    (result.status === 'FAILED' || result.status === 'CANCELLED' || result.status === 'TIMEOUT') ? 'failed' :
    'pending';
  progress._amplify_last_url = result.jobUrl || '';
  progress._amplify_last_job_id = result.jobId || '';
  progress._amplify_last_duration_ms = amplifyDurationMs;
  saveProgress(progress);

  if (progress._amplify_last_build === 'failed') {
    reportStop(progress, result.status === 'TIMEOUT' ? 'amplify-timeout' : 'amplify-build-failed', {
      id: batch.at(-1)?.id,
      slug: batch.at(-1)?.slug,
    });
    return false;
  }

  logger.ok(`  batch ${batchNum} Amplify ${result.status} — ${result.jobUrl}`, {
    phase: 'phase3-amplify',
  });

  // IndexNow는 amplify.yml line 29 자동 호출에 위임 (design §11.3 주석)
  if (OPTS.skipIndexnow) {
    logger.info(`  IndexNow skip (--skip-indexnow)`, { phase: 'phase3-amplify' });
  }
  return true;
}

// === Phase 3 (외곽): 마지막 batch git push 완료 후 wrapper ===
async function phase3_finalGitPushAndAmplify(progress) {
  // Phase 2 루프 내에서 batch 단위로 이미 push 진행됨. 본 함수는 호출 chain 정합용 진입점.
  void progress;
  logger.info('[Phase 3] 최종 단계 — batch 단위 push는 Phase 2 루프 내에서 완료됨', { phase: 'phase3' });
}

// === Phase 4: 최종 audit + 100점 검증 ===

async function phase4_finalAudit(progress) {
  logger.info('[Phase 4] 최종 audit 100점 검증', { phase: 'phase4' });

  let finalReport = null;
  try {
    const r = spawnSync(
      'node',
      ['script/audit-blog-image-quality.mjs', '--all', '--json'],
      { cwd: ROOT, encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024 },
    );
    if (r.stdout) {
      try {
        finalReport = JSON.parse(r.stdout);
      } catch (parseErr) {
        logger.warn(`final audit JSON 파싱 실패: ${parseErr.message}`, { phase: 'phase4' });
      }
    }
  } catch (e) {
    logger.warn(`final audit 실행 오류: ${e.message}`, { phase: 'phase4' });
  }

  // 100점 미달 글 식별
  const perPost = finalReport?.perPost || finalReport?.posts || [];
  const below100 = perPost.filter((p) => (p.score ?? p.audit_score ?? 100) < 100);

  // 최종 보고서
  const isoTs = new Date().toISOString().replace(/[:.]/g, '-').replace(/-\d{3}Z$/, '');
  const reportPath = path.join(WORK_DIR, `report-${isoTs}.md`);
  const lines = [
    `# 블로그 이미지 품질 100점 최종 보고`,
    ``,
    `생성: ${new Date().toISOString()}`,
    ``,
    `## 처리 결과`,
    ``,
    `- 처리 대상: ${Object.keys(progress.posts).length}편`,
    `- 완료: ${Object.values(progress.posts).filter((p) => p.status === 'done').length}편`,
    `- 실패: ${Object.values(progress.posts).filter((p) => p.status === 'failed').length}편`,
    `- 누적 실패율: ${progress._failures.total_attempted > 0 ? ((progress._failures.cumulative / progress._failures.total_attempted) * 100).toFixed(1) : '0.0'}%`,
    ``,
  ];
  if (below100.length > 0) {
    lines.push(`## 100점 미달 (${below100.length}편)`);
    lines.push('');
    for (const p of below100.slice(0, 50)) {
      lines.push(`- ID ${p.pid ?? p.id ?? p.post_id} (${p.slug ?? '-'}) — score ${p.score ?? p.audit_score ?? '-'}`);
    }
    lines.push('');
    lines.push('운영자 결정 대기: 재처리 또는 manual 수정.');
  } else {
    lines.push('전 편 100점 통과.');
  }
  writeFileSync(reportPath, lines.join('\n') + '\n', 'utf-8');

  progress._run_status = 'completed';
  saveProgress(progress);

  logger.ok(`[Phase 4] 최종 보고서 ${path.relative(ROOT, reportPath)} 생성`, { phase: 'phase4' });
}

// === main ===

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  createLock({ forceUnlock: OPTS.forceUnlock });
  try {
    let progress = OPTS.resume ? loadProgress() : null;
    if (!progress) progress = initProgress();
    if (OPTS.resume) {
      progress._run_status = 'in-progress';
      logger.info('[main] --resume 모드 — progress.json에서 재개', { phase: 'main' });
    }
    saveProgress(progress);

    await phase0_collectState(progress);
    await phase1_dryRunMismatch(progress);
    await phase2_processLoop(progress);
    await phase3_finalGitPushAndAmplify(progress);

    if (progress._run_status !== 'stopped') {
      await phase4_finalAudit(progress);
    }
  } finally {
    cleanLock();
  }
}

main().catch((e) => {
  logger.error(`[main] 치명적 오류: ${e.message}`, { phase: 'main', err_stack: e.stack });
  cleanLock();
  process.exit(1);
});
