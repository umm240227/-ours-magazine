// blog-image-quality-100 작업용 통일 로깅 모듈
// - stdout: 한국어 운영자 콘솔 (prefix 톤앤매너)
// - ndjson: 기계 분석용 1줄=1이벤트
// 정본: .spec/blog-image-quality-100/design.md §11.6, §11.7

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

// stdout prefix 정본 (design §11.7)
const PREFIX = {
  info: '[INFO]',
  warn: '[WARN]',
  error: '[ERR ]',
  stop: '[STOP]',
  ok: '[OK  ]',
  debug: '[DBG ]',
};

// 콘솔 표시용은 error → '[ERR ]', ndjson level은 error 그대로
const NDJSON_LEVEL = {
  info: 'info',
  warn: 'warn',
  error: 'error',
  stop: 'error',
  ok: 'info',
  debug: 'info',
};

/**
 * 민감 정보 마스킹 (토큰/Authorization 헤더 등)
 * design.md §11.6: "민감 정보(토큰) 마스킹 필수"
 */
function maskSensitive(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    // Bearer 토큰, Basic 인증 등 마스킹
    return value
      .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1***')
      .replace(/(Basic\s+)[A-Za-z0-9+/=]+/gi, '$1***')
      .replace(/(["']?(?:token|password|secret|api_key|apiKey|authorization)["']?\s*[:=]\s*["']?)[^"',\s}]+/gi, '$1***');
  }
  if (Array.isArray(value)) {
    return value.map(maskSensitive);
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const lowerKey = k.toLowerCase();
      if (
        lowerKey === 'authorization' ||
        lowerKey === 'token' ||
        lowerKey === 'password' ||
        lowerKey === 'secret' ||
        lowerKey === 'api_key' ||
        lowerKey === 'apikey' ||
        lowerKey === 'cookie'
      ) {
        out[k] = '***';
      } else {
        out[k] = maskSensitive(v);
      }
    }
    return out;
  }
  return value;
}

/**
 * meta 객체에서 ndjson 표준 필드 추출
 * 표준 필드: phase, post_id, sub_step, err_stack, http_status, retry_attempt, elapsed_ms
 */
function extractStandardFields(meta = {}) {
  const masked = maskSensitive(meta);
  const standard = {};
  const extra = {};
  const keys = [
    'phase',
    'post_id',
    'sub_step',
    'err_stack',
    'http_status',
    'retry_attempt',
    'elapsed_ms',
  ];
  for (const [k, v] of Object.entries(masked)) {
    if (keys.includes(k)) {
      standard[k] = v;
    } else {
      extra[k] = v;
    }
  }
  return { standard, extra };
}

/**
 * stdout 한 줄 출력 (운영자 콘솔)
 * design §11.7 톤앤매너: 한국어, prefix, 다음 행동 안내
 */
function printConsole(method, msg) {
  const prefix = PREFIX[method] || '[INFO]';
  const line = `${prefix} ${msg}`;
  if (method === 'error' || method === 'stop') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

/**
 * NDJSON 한 줄 append (atomic write)
 * design §11.6: 한 줄 = 1 이벤트
 */
function appendNdjson(ndjsonPath, event) {
  if (!ndjsonPath) return;
  try {
    const dir = dirname(ndjsonPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(ndjsonPath, JSON.stringify(event) + '\n', { flag: 'a' });
  } catch (err) {
    // 로깅 실패가 본 작업을 중단시키면 안 됨. stderr로만 알림
    process.stderr.write(`[WARN] ndjson 로그 기록 실패: ${err.message}\n`);
  }
}

/**
 * Logger 인스턴스 생성
 *
 * @param {object} options
 * @param {string} options.runDir - 실행 디렉터리 (기본 ndjson 경로 산정용)
 * @param {string} [options.ndjsonPath] - 명시적 ndjson 파일 경로
 * @param {string} [options.defaultPhase] - 모든 이벤트의 phase 기본값
 * @returns {{ info, warn, error, stop, ok, debug }}
 */
export function createLogger(options = {}) {
  const { runDir, defaultPhase } = options;
  let { ndjsonPath } = options;

  // ndjsonPath 기본값: {runDir}/log-{ISO}.ndjson
  if (!ndjsonPath && runDir) {
    const iso = new Date().toISOString().replace(/[:.]/g, '-');
    ndjsonPath = join(runDir, `log-${iso}.ndjson`);
  }

  function emit(method, msg, meta = {}) {
    const at = new Date().toISOString();
    const level = NDJSON_LEVEL[method] || 'info';
    const { standard, extra } = extractStandardFields(meta);

    // phase 기본값 적용
    if (!standard.phase && defaultPhase) {
      standard.phase = defaultPhase;
    }

    // msg 본문도 마스킹 (Bearer/Basic/token 키워드 포함 가능성)
    const maskedMsg = maskSensitive(String(msg ?? ''));

    const event = {
      at,
      level,
      ...standard,
      msg: maskedMsg,
    };
    if (Object.keys(extra).length > 0) {
      event.meta = extra;
    }

    // stdout: 한국어 본문만. stack trace는 ndjson으로만 (design §11.7 금지)
    printConsole(method, maskedMsg);

    // ndjson: 전체 이벤트
    appendNdjson(ndjsonPath, event);

    return event;
  }

  return {
    info: (msg, meta) => emit('info', msg, meta),
    warn: (msg, meta) => emit('warn', msg, meta),
    error: (msg, meta) => emit('error', msg, meta),
    stop: (msg, meta) => emit('stop', msg, meta),
    ok: (msg, meta) => emit('ok', msg, meta),
    debug: (msg, meta) => emit('debug', msg, meta),
    // 로그 경로 조회용 (디버깅 / 보고서 생성용)
    getNdjsonPath: () => ndjsonPath,
  };
}
