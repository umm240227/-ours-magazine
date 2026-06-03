#!/usr/bin/env node
// 다중 AI 도구(Claude Code / Cursor / Codex 등) 동시 작업 시
// dev / build / install 충돌 방지용 파일 락 래퍼.
// 외부 패키지 없이 Node 내장 모듈만 사용한다.

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import process from 'node:process';
import os from 'node:os';

// ----- 상수 -----
const LOCK_DIR = path.resolve(process.cwd(), '.locks');
const POLL_INTERVAL_MS = 250;
const ANNOUNCE_INTERVAL_MS = 10_000;

// ----- CLI 인자 파싱 -----
// 사용 예:
//   node script/lock-wrapper.mjs dev --pre script/copy-pretendard.mjs -- astro dev
//   node script/lock-wrapper.mjs build --pre A.mjs --pre B.mjs --post script/rename-sitemap.js -- astro build
//   node script/lock-wrapper.mjs install --acquire-only
//   node script/lock-wrapper.mjs install --release-only
function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.length === 0) {
    console.error('[lock] 사용법: node script/lock-wrapper.mjs <name> [--pre <script>]... [--post <script>]... [--acquire-only|--release-only] [-- <command> [args...]]');
    process.exit(2);
  }
  const name = args[0];
  const preScripts = [];
  const postScripts = [];
  let mode = 'normal'; // 'normal' | 'acquire-only' | 'release-only'
  const commandParts = [];
  let i = 1;
  let separatorSeen = false;
  while (i < args.length) {
    const a = args[i];
    if (separatorSeen) {
      commandParts.push(a);
      i += 1;
      continue;
    }
    if (a === '--') {
      separatorSeen = true;
      i += 1;
      continue;
    }
    if (a === '--pre') {
      const next = args[i + 1];
      if (!next) {
        console.error('[lock] --pre 다음에 스크립트 경로가 필요합니다.');
        process.exit(2);
      }
      preScripts.push(next);
      i += 2;
      continue;
    }
    if (a === '--post') {
      const next = args[i + 1];
      if (!next) {
        console.error('[lock] --post 다음에 스크립트 경로가 필요합니다.');
        process.exit(2);
      }
      postScripts.push(next);
      i += 2;
      continue;
    }
    if (a === '--acquire-only') {
      mode = 'acquire-only';
      i += 1;
      continue;
    }
    if (a === '--release-only') {
      mode = 'release-only';
      i += 1;
      continue;
    }
    console.error(`[lock] 알 수 없는 인자: ${a}`);
    process.exit(2);
  }
  return { name, preScripts, postScripts, mode, commandParts };
}

const { name, preScripts, postScripts, mode, commandParts } = parseArgs(process.argv);

// ----- 공용 상태 (CI 분기에서도 runChild가 참조하므로 일찍 선언) -----
let lockAcquired = false;
let childProcess = null;
let cleaningUp = false;

// ----- CI 우회 -----
const isCI = Boolean(process.env.AWS_APP_ID || process.env.CI);
if (isCI) {
  // CI에서는 락 로직 완전 우회. 메시지도 출력하지 않음.
  if (mode === 'release-only') {
    // postinstall 단계에서도 아무 일도 하지 않고 그대로 종료.
    process.exit(0);
  }
  if (mode === 'acquire-only') {
    process.exit(0);
  }
  await runPrescriptsAndMain();
  // runPrescriptsAndMain은 자식 종료 코드로 process.exit 호출 후 반환되지 않는다.
  process.exit(0);
}

// ----- 락 파일 경로 -----
const lockPath = path.join(LOCK_DIR, `${name}.lock`);

// ----- release-only 모드 (install postinstall에서 사용) -----
// preinstall(acquire-only)에서 락을 잡은 프로세스와 postinstall(release-only) 프로세스의
// PID가 다르므로 PID 일치 검사 없이 락 파일을 직접 제거한다.
// install 락 파일임은 name으로 보장된다.
if (mode === 'release-only') {
  try {
    fs.unlinkSync(lockPath);
  } catch (err) {
    if (err && err.code !== 'ENOENT') {
      // 다른 에러는 보고만 하고 종료 코드 0으로 유지(install 자체는 성공).
      process.stderr.write(`[lock] 락 해제 중 오류(무시): ${err.message}\n`);
    }
  }
  process.exit(0);
}

// ----- 디렉토리 보장 -----
ensureLockDir();

// ----- 메인 흐름 -----

installSignalHandlers();
installCrashHandlers();

await acquireLock();

if (mode === 'acquire-only') {
  // preinstall: 락만 잡고 즉시 종료. postinstall(release-only)이 나중에 해제한다.
  // 정리 핸들러가 실행되지 않도록 lockAcquired 플래그를 false로 되돌리지는 않는다.
  // 대신 핸들러가 동작하지 않도록 명시적으로 process.exit 사용.
  process.exit(0);
}

try {
  await runPrescriptsAndMain();
} finally {
  // runPrescriptsAndMain 내부에서 process.exit이 호출되므로 일반 흐름은 도달 안 함.
  // 방어적으로 정리.
  if (lockAcquired && !cleaningUp) {
    releaseLock();
  }
}

// =================== 함수 정의 ===================

function ensureLockDir() {
  try {
    fs.mkdirSync(LOCK_DIR, { recursive: true });
  } catch (err) {
    if (err && err.code !== 'EEXIST') {
      throw err;
    }
  }
}

function writeLockFileAtomic() {
  const payload = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    command: name,
    hostname: os.hostname(),
  };
  const json = JSON.stringify(payload, null, 2);
  // 'wx' 플래그: 파일이 이미 존재하면 EEXIST 에러. 동시 생성 race-condition 방지.
  fs.writeFileSync(lockPath, json, { flag: 'wx' });
}

function readLockFile() {
  try {
    const raw = fs.readFileSync(lockPath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

function isPidAlive(pid) {
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    // signal 0: 시그널을 보내지 않고 권한/존재 여부만 확인.
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // ESRCH: 프로세스 없음. EPERM: 존재하지만 권한 없음 → 살아있는 것으로 간주.
    if (err && err.code === 'EPERM') {
      return true;
    }
    return false;
  }
}

function removeLockFileIfMine() {
  // 락 파일을 제거하되, 다른 프로세스가 덮어쓴 경우를 방지하기 위해 PID 확인.
  const info = readLockFile();
  if (!info) {
    return;
  }
  if (info.pid === process.pid) {
    try {
      fs.unlinkSync(lockPath);
    } catch (err) {
      // 이미 없으면 무시.
    }
  }
}

function releaseLock() {
  removeLockFileIfMine();
  lockAcquired = false;
}

function formatElapsed(ms) {
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m > 0) return `${m}분 ${s}초`;
  return `${s}초`;
}

async function acquireLock() {
  let waitingAnnounced = false;
  let waitStartedAt = 0;
  let lastAnnounceAt = 0;
  while (true) {
    try {
      writeLockFileAtomic();
      lockAcquired = true;
      if (waitingAnnounced) {
        process.stderr.write(`[lock] 락을 획득했습니다. ${name} 작업을 시작합니다.\n`);
      }
      return;
    } catch (err) {
      if (!err || err.code !== 'EEXIST') {
        throw err;
      }
    }
    // 락 파일 존재. 내용 확인.
    const info = readLockFile();
    if (!info || typeof info.pid !== 'number') {
      // 손상된 락 파일. 좀비 락으로 간주하고 제거 후 재시도.
      process.stderr.write(`[lock] 손상된 락 파일을 감지했습니다. 정리하고 진행합니다.\n`);
      try { fs.unlinkSync(lockPath); } catch (_) { /* ignore */ }
      continue;
    }
    if (!isPidAlive(info.pid)) {
      process.stderr.write(`[lock] 이전 프로세스(PID ${info.pid})가 종료된 상태입니다. 좀비 락을 정리하고 진행합니다.\n`);
      try { fs.unlinkSync(lockPath); } catch (_) { /* ignore */ }
      continue;
    }
    // 살아있는 프로세스가 락 보유 중.
    const now = Date.now();
    if (!waitingAnnounced) {
      process.stderr.write(
        `[lock] 다른 프로세스가 ${name} 작업 중입니다 (PID ${info.pid}, 시작 ${info.startedAt}). 완료 대기 중...\n`,
      );
      waitingAnnounced = true;
      waitStartedAt = now;
      lastAnnounceAt = now;
    } else if (now - lastAnnounceAt >= ANNOUNCE_INTERVAL_MS) {
      const elapsed = formatElapsed(now - waitStartedAt);
      process.stderr.write(`[lock] 대기 중... (경과 ${elapsed}, PID ${info.pid})\n`);
      lastAnnounceAt = now;
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runChild(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      stdio: 'inherit',
      env: process.env,
      shell: false,
    });
    childProcess = child;
    child.on('exit', (code, signal) => {
      childProcess = null;
      resolve({ code, signal });
    });
    child.on('error', (err) => {
      childProcess = null;
      process.stderr.write(`[lock] 자식 프로세스 실행 실패: ${err.message}\n`);
      resolve({ code: 1, signal: null });
    });
  });
}

async function runPrescriptsAndMain() {
  // --pre로 받은 Node 스크립트들을 순차 실행.
  for (const pre of preScripts) {
    const result = await runChild(process.execPath, [pre]);
    if (result.code !== 0) {
      releaseLock();
      process.exit(result.code ?? 1);
    }
  }
  // 본 명령 실행 (인자가 없으면 --post로 바로 진행).
  let mainCode = 0;
  if (commandParts.length > 0) {
    const [cmd, ...rest] = commandParts;
    const result = await runChild(cmd, rest);
    if (result.signal) {
      releaseLock();
      process.exit(result.code ?? 1);
    }
    mainCode = result.code ?? 0;
    if (mainCode !== 0) {
      releaseLock();
      process.exit(mainCode);
    }
  }
  // 본 명령 성공 시에만 --post 스크립트들을 순차 실행.
  for (const post of postScripts) {
    const result = await runChild(process.execPath, [post]);
    if (result.code !== 0) {
      releaseLock();
      process.exit(result.code ?? 1);
    }
  }
  releaseLock();
  process.exit(0);
}

function installSignalHandlers() {
  const handle = (signal) => {
    if (cleaningUp) return;
    cleaningUp = true;
    process.stderr.write(`[lock] 종료 신호 수신, 락을 정리합니다.\n`);
    if (childProcess) {
      try {
        childProcess.kill(signal);
      } catch (_) { /* ignore */ }
    }
    // 자식이 종료될 시간을 잠시 주고 락 정리.
    setTimeout(() => {
      if (lockAcquired) {
        removeLockFileIfMine();
      }
      // 일반적인 종료 코드: 128 + signal number 사용 (POSIX 관례).
      const sigNum = { SIGINT: 2, SIGTERM: 15, SIGHUP: 1 }[signal] ?? 1;
      process.exit(128 + sigNum);
    }, 200);
  };
  process.on('SIGINT', () => handle('SIGINT'));
  process.on('SIGTERM', () => handle('SIGTERM'));
  process.on('SIGHUP', () => handle('SIGHUP'));
}

function installCrashHandlers() {
  const crash = (err) => {
    if (cleaningUp) return;
    cleaningUp = true;
    try {
      process.stderr.write(`[lock] 비정상 종료, 락을 정리했습니다.\n`);
      if (err && err.stack) {
        process.stderr.write(`${err.stack}\n`);
      } else if (err) {
        process.stderr.write(`${String(err)}\n`);
      }
    } catch (_) { /* ignore */ }
    if (lockAcquired) {
      removeLockFileIfMine();
    }
    process.exit(1);
  };
  process.on('uncaughtException', crash);
  process.on('unhandledRejection', crash);
}
