---
name: codex-calls
description: codex CLI 호출 규칙 정본 — stdin 처리, 옵션, Node.js/bash 패턴. codex exec를 사용하는 모든 스크립트·스킬 작성 시 반드시 이 파일을 따를 것.
---

# codex 호출 규칙 (정본)

`codex exec`를 사용하는 **모든 스크립트·스킬·bash 예시**는 이 파일을 따른다.

---

## 1. stdin 처리 (CRITICAL — 위반 시 hang)

codex CLI는 prompt를 args로 받아도 **stdin에서 추가 입력을 함께 읽는다** (`Reading additional input from stdin...`). stdin이 열린 채 데이터가 오지 않으면 codex가 무한 대기(hang)한다.

**핵심**: stdin은 반드시 EOF 또는 `/dev/null`이어야 한다.

### 호출 방법별 stdin 상태

| 호출 방법 | stdin 상태 | 결과 |
|---|---|---|
| Node `execFileSync(...)` `{ stdio: ['ignore','inherit','inherit'] }` | `/dev/null` | ✅ 정상 |
| Node `execFileP(...)` `{ stdio: ['ignore','inherit','inherit'] }` | `/dev/null` | ✅ 정상 |
| Node `spawn(...)` `{ stdio: ['ignore','pipe','pipe'] }` | `/dev/null` | ✅ 정상 |
| bash `codex exec ... < /dev/null` | `/dev/null` | ✅ 정상 |
| bash `( codex exec ... ) &` (서브셸 + 백그라운드, 터미널 없음) | EOF | ✅ 정상 |
| Node `execFileSync(...)` `{ stdio: 'inherit' }` | 부모 터미널 stdin | ❌ hang |
| Node `execFileP(...)` stdio 미지정 | pipe open + 데이터 없음 | ❌ hang |
| Node `execFileSync(...)` `{ stdio: 'pipe' }` input 미지정 | pipe open 상태 따라 다름 | ⚠️ 불안정 |

---

## 2. 권장 패턴

### Node.js — execFileSync (동기)

```js
import { execFileSync } from 'node:child_process';

execFileSync(
  'codex',
  ['exec', '--sandbox', 'workspace-write', '--cd', ROOT, prompt],
  { stdio: ['ignore', 'inherit', 'inherit'], timeout: 6 * 60 * 1000 }
  //        ^^^^^^^^ stdin=/dev/null 필수
);
```

### Node.js — execFile 비동기 (promisify)

```js
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

await execFileP(
  'codex',
  ['exec', '--sandbox', 'workspace-write', '--cd', ROOT, prompt],
  { stdio: ['ignore', 'inherit', 'inherit'], timeout: 6 * 60 * 1000 }
  //        ^^^^^^^^ stdin=/dev/null 필수
);
```

### Node.js — spawn 비동기 (출력 캡처 필요 시)

```js
import { spawn } from 'node:child_process';

function callCodex(prompt, cwd) {
  return new Promise((resolve, reject) => {
    const p = spawn(
      'codex',
      ['exec', '--sandbox', 'workspace-write', '--cd', cwd, prompt],
      { stdio: ['ignore', 'pipe', 'pipe'] }
      //        ^^^^^^^^ stdin=/dev/null 필수
    );
    let out = '', err = '';
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { err += d; });
    p.on('exit', code => code === 0 ? resolve({ out, err }) : reject(new Error(err)));
    setTimeout(() => p.kill('SIGTERM'), 6 * 60 * 1000);
  });
}
```

### bash

```bash
# 단일 호출
codex exec --sandbox workspace-write --cd "$(pwd)" \
  "프롬프트" < /dev/null

# 병렬 chunked (5개 단위)
PIDS=()
for item in "${ITEMS[@]}"; do
  ( timeout 360 codex exec --sandbox workspace-write --cd "$(pwd)" \
      "프롬프트 for $item" < /dev/null > /tmp/log-$item 2>&1 ) &
  PIDS+=($!)
done
wait "${PIDS[@]}"
```

---

## 3. 금지 패턴

```js
// ❌ stdio: 'inherit' — 부모 터미널 stdin 상속 → hang
execFileSync('codex', [...], { stdio: 'inherit' });

// ❌ stdio 미지정 (execFileP) — pipe open + close 안 됨 → hang
await execFileP('codex', [...], { timeout: ... });

// ❌ stdio: 'pipe' (execFileSync) — 안전해 보이지만 Node 버전 따라 불안정
execFileSync('codex', [...], { stdio: 'pipe' });
```

```bash
# ❌ stdin 리디렉션 없이 호출 — TTY 없는 환경(cron, CI)에서 hang
codex exec --sandbox workspace-write --cd "$(pwd)" "프롬프트"
```

---

## 4. 병렬화 가이드

- **5개 단위 chunked** launch. OpenAI Images API rate limit + 로컬 codex agent 부하 보호.
- 한 batch 완료 후(`wait`) 다음 chunk 시작.
- 단일 호출 평균 소요: 약 3분 (이미지 생성 + 검증).
- chunked 5개 동시: 단일 대비 약 1.6배 시간 (효율 ~70%).

---

## 5. 세컨드 오피니언 모드 추가 규칙

`codex-second-opinion` 용도로 호출 시:

```bash
codex exec \
  --cd "$CLAUDE_PROJECT_DIR" \
  "프롬프트" < /dev/null
```

- 세컨드 오피니언 옵션 정본(`-s read-only`·`-m` 금지·`resume` 금지·`--skip-git-repo-check` 등)은 `.claude/skills/_shared/codex-second-opinion.md` §2 참조.
- CLI 메커닉(stdin `< /dev/null` 닫기, §4 병렬화 가이드)은 본문 그대로 적용.
