#!/usr/bin/env bash
# 로컬(Mac) 구독 모드 워커 — 한국과 동일 방식. run-railway.sh의 "구독 버전".
# ⚠️ run-railway.sh와 유일한 차이 = 결제 경로. 파이프라인·프롬프트·품질 게이트는 100% 동일(seed-prompt-template.md 그대로).
#   - run-railway.sh : Railway 컨테이너 → ANTHROPIC_API_KEY 강제 → 종량제 API 과금($).
#   - run-local.sh   : 이 Mac에 로그인된 Claude Max 구독 → 정액(요금제 한도 안에서 추가비용 0).
# 따라서 맨 위에서 ANTHROPIC_API_KEY를 강제로 unset 한다 — 셸에 키가 잡혀 있어도 구독으로 청구되게.
# env(선택): SLACK_WEBHOOK_URL, PROJECT_ROOT(기본=레포 루트), MODEL(기본 opus).
set -uo pipefail

# ── 0.0 절전 방지: caffeinate로 자기 자신 재실행 → 발행(~12분) 동안 Mac이 잠들지 않게 ──────────
# (pmset가 10:00에 깨워도, 헤드리스 실행은 사용자 활동이 없어 유휴 절전으로 다시 잠들 수 있다.
#  caffeinate -i(유휴)·-s(시스템, AC전원 시) 절전 차단. 스크립트 종료 시 assertion 자동 해제.
#  _CAFFEINATED 가드로 무한 재실행 방지. /usr/bin 절대경로 — PATH 보강 전이라.)
if [ -z "${_CAFFEINATED:-}" ] && [ -x /usr/bin/caffeinate ]; then
  exec env _CAFFEINATED=1 /usr/bin/caffeinate -is "$0" "$@"
fi

# ── 0. 결제 경로 강제: API 키/토큰 제거 → Claude Code가 구독 OAuth로 인증 ──────────────
# (이 한 줄이 "$12 종량제 → Max 구독 정액"의 핵심. 한국이 api 안 쓰는 것과 동일 상태로 만든다.)
unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN
# --max-budget-usd 도 쓰지 않는다(그건 API 비용 캡 개념 — 구독엔 무의미).

# ── 0.1 launchd 환경 보강 (한국 daily-all.sh:33-35 동일): PATH + fd limit ──────────────────
# launchd 기본 PATH는 빈약(claude/node/python3 못 찾음), fd 기본 256 → claude CLI 즉사. 둘 다 보강.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.local/bin:${PATH:-}"
ulimit -n 524288 2>/dev/null || ulimit -n 65536 2>/dev/null || true

PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
cd "$PROJECT_ROOT" || { echo "✗ cd $PROJECT_ROOT 실패"; exit 1; }
LOG_DIR="$PROJECT_ROOT/tmp/local-logs"; mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/run-$(date +%Y%m%d-%H%M%S).log"
MODEL="${MODEL:-opus}"

slack() { [ -n "${SLACK_WEBHOOK_URL:-}" ] && curl -s -X POST -H 'Content-type: application/json' \
  --data "$(python3 -c 'import json,sys; print(json.dumps({"text":sys.argv[1]}))' "$1")" "$SLACK_WEBHOOK_URL" >/dev/null 2>&1 || true; }

# ── 0.5 사전 확인 (구독 모드라 API 키 검사 없음 — 오히려 키가 잡혀 있으면 경고) ──────────
command -v claude >/dev/null || { echo "✗ claude CLI 없음 — curl -fsSL https://claude.ai/install.sh | bash"; exit 1; }
echo "[$(date '+%F %T')] 구독 모드 (ANTHROPIC_API_KEY unset됨 → Max 구독으로 청구). model=$MODEL" | tee -a "$LOG"

# 인증 선검증은 하지 않는다 — claude가 자기 자격(키체인 또는 ~/.claude.json 등 버전/환경별 위치)을
# 알아서 찾으므로, 특정 키체인 서비스명을 하드코딩한 `security find-generic-password` 검사는
# 컨텍스트에 따라 rc=44(not found)를 내며 유효한 로그인을 오판해 발행을 막을 수 있다.
# → 인증 가능 여부의 진짜 신호 = claude 자신의 종료코드(아래 §3 CLAUDE_RC). 못 읽으면 claude가
#   비정상 종료하고, 폴백할 API 키가 없으므로 과금 없이 '실패'로 끝난다. 그걸 발행 차단으로 처리.

# ── 0.6 git: 로컬에 이미 설정된 자격증명(gono92) 사용. 최신 main 동기화 ──────────────────
git config --global --add safe.directory "$PROJECT_ROOT" 2>/dev/null || true
git fetch origin main 2>/dev/null && git pull --ff-only origin main 2>&1 | tee -a "$LOG" || echo "[warn] git pull 실패(계속)" | tee -a "$LOG"

# ── 1. 다음 시드 (content/articles에 아직 없는 첫 시드) ───────────────────────────────────
SEED=$(python3 - <<'PY'
import yaml, os
for t in (yaml.safe_load(open('script/cron/seed-topics.yml')) or {}).get('topics', []):
    if not os.path.exists(f"content/articles/{t['slug']}.md"):
        print('\t'.join([t['slug'], t['topic'], t['main_keyword'], t.get('secondary',''), t['category']])); break
PY
)
if [ -z "$SEED" ]; then echo "시드 소진 — seed-topics.yml에 주제 추가 필요"; slack "ℹ️ 로컬 블로그: 시드 소진(새 주제 추가 필요)"; exit 0; fi
IFS=$'\t' read -r SLUG TOPIC MAIN_KW SECONDARY CATEGORY <<< "$SEED"
echo "[$(date '+%F %T')] 시드: $SLUG / $TOPIC" | tee -a "$LOG"

# ── 2. 프롬프트 채우기 (seed-prompt-template.md = run-railway.sh와 동일 정본) ──────────────
PROMPT=$(mktemp)
sed -e "s|{{TOPIC}}|${TOPIC}|g" -e "s|{{MAIN_KEYWORD}}|${MAIN_KW}|g" -e "s|{{SECONDARY}}|${SECONDARY}|g" \
    -e "s|{{CATEGORY}}|${CATEGORY}|g" -e "s|{{SLUG}}|${SLUG}|g" script/cron/seed-prompt-template.md > "$PROMPT"

# ── 3. 헤드리스 실행 (구독, bypassPermissions — 무인 자율, --max-budget-usd 없음) ──────────
# claude를 파이프 head로 두어 PIPESTATUS[0]로 종료코드 캡처(tee가 마스킹하지 않게). 비정상 종료 시 별도 경보.
echo "[$(date '+%F %T')] claude -p 실행 (구독 / model=$MODEL)" | tee -a "$LOG"
claude -p --permission-mode bypassPermissions --model "$MODEL" --add-dir "$PROJECT_ROOT" < "$PROMPT" 2>&1 | tee -a "$LOG"
CLAUDE_RC=${PIPESTATUS[0]}
rm -f "$PROMPT"
# claude 비정상 종료 = 인증(키체인/로그인) 실패·토큰만료·네트워크 등. 무인 발행에선 발행 차단(push 금지).
if [ "$CLAUDE_RC" -ne 0 ]; then
  echo "[$(date '+%F %T')] ✗ claude 비정상 종료 (rc=$CLAUDE_RC) — 인증(키체인/로그인)·토큰만료·네트워크 의심. 발행 차단(push 안 함)." | tee -a "$LOG"
  slack "✗ 로컬 블로그: claude 비정상 종료(rc=$CLAUDE_RC) — 발행 차단. 인증(GUI 로그인)/네트워크 확인"
  exit 1
fi

# ── 4. 결과 JSON 추출 (로그 마지막의 단독 JSON) ──────────────────────────────────────────
STATUS=$(python3 - "$LOG" <<'PY'
import sys, json
for line in reversed(open(sys.argv[1]).read().strip().splitlines()):
    line = line.strip()
    if line.startswith('{') and '"status"' in line:
        try: print(json.loads(line).get('status','')); break
        except Exception: pass
PY
)

# ── 5. status 처리 (md-publish --commit 이후 origin/main 앞서면 push) ─────────────────────
case "$STATUS" in
  success)
    if git log origin/main..HEAD --oneline 2>/dev/null | grep -q .; then
      git push origin main 2>&1 | tee -a "$LOG" \
        && { echo "[$(date '+%F %T')] ✅ 발행+push: $SLUG"; slack "✅ 로컬 블로그 발행: $SLUG → Vercel 배포 시작"; } \
        || slack "⚠️ 로컬 블로그: $SLUG 생성됐으나 git push 실패 — 자격증명 확인"
    else
      slack "⚠️ 로컬 블로그: $SLUG success인데 commit 없음 — md-publish --commit 확인"
    fi ;;
  skipped) echo "[$(date '+%F %T')] ℹ️ 스킵: $SLUG"; slack "ℹ️ 로컬 블로그 스킵: $SLUG"; exit 0 ;;
  failed|*) echo "[$(date '+%F %T')] ✗ $SLUG status='${STATUS:-no-json}'" | tee -a "$LOG"; slack "✗ 로컬 블로그 실패: $SLUG (status=${STATUS:-no-json}) — 로그 확인"; exit 1 ;;
esac
