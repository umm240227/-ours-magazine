#!/usr/bin/env bash
# 매일 오전 자동 블로그 발행 cron 진입점
# launchd가 ~/Library/LaunchAgents/com.snshelp.daily-blog.plist 통해 호출
# prompt: script/cron/daily-blog-prompt.md
#
# 실패 처리: exit 1 시 launchd가 KeepAlive=false라 자동 retry 안 함 — Slack에 실패 알림

set -uo pipefail   # set -e는 끄고 명시적 에러 처리

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOG_DIR="$PROJECT_ROOT/tmp/cron-daily-blog"
DATE=$(date +%Y-%m-%d)
TIME=$(date +%H:%M:%S)
LOG_FILE="$LOG_DIR/$DATE.log"

cd "$PROJECT_ROOT" || exit 1
mkdir -p "$LOG_DIR"

# ── 환경 변수 로드 ────────────────────────────────────
if [ -f .env ]; then
  set -a; source .env; set +a
else
  echo "[$TIME] ERROR: .env 파일 없음" | tee -a "$LOG_FILE"
  exit 1
fi

# PATH 보강 (launchd는 빈 PATH로 시작) ─ Claude Code CLI / node / git / aws / curl 모두 필요
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.local/bin:$PATH"

# launchd 기본 NumberOfFiles=256은 Claude CLI에 부족 (즉시 exit 1로 사망)
ulimit -n 524288 2>/dev/null || ulimit -n 65536 2>/dev/null || true

# ── 사전 점검 ─────────────────────────────────────────
{
  echo "════════════════════════════════════════"
  echo "[$DATE $TIME] 일일 블로그 자동 발행 시작"
  echo "════════════════════════════════════════"
  echo "[env] PATH=$PATH"
  echo "[env] PWD=$(pwd)"
  echo "[env] SLACK_WEBHOOK_URL=${SLACK_WEBHOOK_URL:+(set)}${SLACK_WEBHOOK_URL:-(missing)}"
  echo "[env] ulimit -n (soft)=$(ulimit -n)  hard=$(ulimit -Hn)"
} | tee -a "$LOG_FILE"

# Claude Code CLI 존재 확인
if ! command -v claude &>/dev/null; then
  MSG="❌ Claude Code CLI(\`claude\`) PATH 에 없음. 설치 필요: curl -fsSL https://claude.ai/install.sh | bash"
  echo "$MSG" | tee -a "$LOG_FILE"
  # Slack 실패 알림 (webhook 있을 때만)
  if [ -n "${SLACK_WEBHOOK_URL:-}" ]; then
    curl -s -X POST -H 'Content-Type: application/json' \
      -d "{\"text\":\"$MSG\"}" "$SLACK_WEBHOOK_URL" > /dev/null
  fi
  exit 1
fi

# ── Slack 실패 알림 헬퍼 ────────────────────────────
slack_notify_failure() {
  local phase="$1"
  local detail="$2"
  if [ -z "${SLACK_WEBHOOK_URL:-}" ]; then return; fi
  # 사용자에게 보일 한국어 단계명 (호출부의 영어 키는 코드 식별용으로 유지)
  local phase_ko
  case "$phase" in
    init)         phase_ko="준비" ;;
    result-parse) phase_ko="결과 분석" ;;
    json-schema)  phase_ko="결과 형식 검증" ;;
    topic-empty)  phase_ko="주제 없음" ;;
    *)            phase_ko="$phase" ;;
  esac
  curl -s -X POST -H 'Content-Type: application/json' "$SLACK_WEBHOOK_URL" \
    -d "$(cat <<EOF
{
  "text": "❌ 일일 블로그 자동 발행 실패 ($DATE)",
  "blocks": [
    {"type": "section", "text": {"type": "mrkdwn", "text": "*단계*: $phase_ko\n*상세*: \`\`\`${detail:0:500}\`\`\`\n로그: \`$LOG_FILE\`"}},
    {"type": "context", "elements": [{"type": "mrkdwn", "text": "$(date +%Y-%m-%d\ %H:%M\ KST)"}]}
  ]
}
EOF
)" > /dev/null
}

# ── Claude CLI 호출 ──────────────────────────────────
PROMPT_FILE="$PROJECT_ROOT/script/cron/daily-blog-prompt.md"
if [ ! -f "$PROMPT_FILE" ]; then
  slack_notify_failure "init" "작업 지시 파일 없음: $PROMPT_FILE"
  echo "[ERROR] prompt 파일 없음" | tee -a "$LOG_FILE"
  exit 1
fi

echo "[$(date +%H:%M:%S)] Claude CLI 실행 시작 (-p headless 모드)" | tee -a "$LOG_FILE"

# `claude -p` headless 단발 실행. stdin으로 prompt 전달, stdout/stderr 로그
START_TS=$(date +%s)

set +e
cat "$PROMPT_FILE" | claude -p 2>&1 | tee -a "$LOG_FILE"
CLAUDE_EXIT=${PIPESTATUS[1]}
set -e

END_TS=$(date +%s)
DURATION=$((END_TS - START_TS))

echo "[$(date +%H:%M:%S)] Claude CLI 종료. exit=$CLAUDE_EXIT, duration=${DURATION}s" | tee -a "$LOG_FILE"

# ── 결과 처리 ─────────────────────────────────────────
# Claude stdout 끝에서 결과 JSON 추출 (blog SKILL.md §3-A 정본 출력)
# 강건 파서: JSON이 ```json 코드펜스로 감싸이고 뒤에 '종료' 로그가 붙어도 파싱.
# (이전 "끝줄이 JSON" 정규식은 코드펜스·후행 로그에 깨져 .json 미생성·Slack 알림 실패 원인이었음)
RESULT_JSON=$(cat "$LOG_FILE" | python3 -c '
import sys, json
s = sys.stdin.read()
s = s.replace("```json", "\n").replace("```", "\n")
starts = [i for i, c in enumerate(s) if c == "{"]
for st in reversed(starts):
    depth = 0
    for j in range(st, len(s)):
        if s[j] == "{": depth += 1
        elif s[j] == "}":
            depth -= 1
            if depth == 0:
                cand = s[st:j+1]
                try:
                    obj = json.loads(cand)
                    if isinstance(obj, dict) and "status" in obj:
                        print(json.dumps(obj, ensure_ascii=False))
                        sys.exit(0)
                except json.JSONDecodeError:
                    pass
                break
sys.exit(1)
' 2>/dev/null)

if [ -z "$RESULT_JSON" ]; then
  TAIL_LOG=$(tail -30 "$LOG_FILE" | tr -d '"' | head -c 500)
  slack_notify_failure "result-parse" "결과 분석 실패(응답 형식 오류). 종료코드=$CLAUDE_EXIT, 로그 끝부분: $TAIL_LOG"
  exit 1   # 파싱 실패는 CLAUDE_EXIT가 0이어도 항상 실패 처리
fi

# JSON 저장
echo "$RESULT_JSON" > "$LOG_DIR/$DATE.json"

# 결과 상태별 Slack 알림
STATUS=$(echo "$RESULT_JSON" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("status",""))')

# ── JSON schema 검증 ──────────────────────────────────
# status 허용값 확인 (알 수 없는 값이면 md-publish가 이미 파일 생성했을 수 있으므로 수동 확인 경고)
case "$STATUS" in
  success|failed|no_topic|skipped) ;;
  *)
    slack_notify_failure "json-schema" "예상하지 못한 상태값='${STATUS}'. 블로그가 이미 발행됐을 수 있으니 수동 확인이 필요합니다."
    echo "[$(date +%H:%M:%S)] ✗ 예상 못한 status='${STATUS}' — 블로그 발행 여부 수동 확인" | tee -a "$LOG_FILE"
    exit 1
    ;;
esac

# success 시 필수 필드 검증
if [ "$STATUS" = "success" ]; then
  # [JP override] md-publish.mjs 출력 계약(jp-site-config §5·§11): audit_score·slug·url. WP final_score·post_id 폐기.
  AUDIT_SCORE=$(echo "$RESULT_JSON" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("audit_score",""))' 2>/dev/null || echo "")
  SLUG_VAL=$(echo "$RESULT_JSON" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("slug",""))' 2>/dev/null || echo "")
  URL_VAL=$(echo "$RESULT_JSON" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("url",""))' 2>/dev/null || echo "")

  SCHEMA_ERRORS=""
  [ "$AUDIT_SCORE" != "100" ] && SCHEMA_ERRORS="${SCHEMA_ERRORS}audit_score=${AUDIT_SCORE:-없음}(100 필수) "
  [ -z "$SLUG_VAL" ] && SCHEMA_ERRORS="${SCHEMA_ERRORS}slug없음 "
  [ -z "$URL_VAL" ] && SCHEMA_ERRORS="${SCHEMA_ERRORS}url없음 "

  if [ -n "$SCHEMA_ERRORS" ]; then
    slack_notify_failure "json-schema" "발행 성공으로 보고됐으나 필수 정보 누락: $SCHEMA_ERRORS"
    echo "[$(date +%H:%M:%S)] ✗ JSON schema 오류: $SCHEMA_ERRORS" | tee -a "$LOG_FILE"
    exit 1
  fi
fi

case "$STATUS" in
  success)
    if [ -n "${SLACK_WEBHOOK_URL:-}" ]; then
      PAYLOAD=$(echo "$RESULT_JSON" | python3 -c '
import sys, json
r = json.load(sys.stdin)
# f-string 표현식 안에 백슬래시/큰따옴표가 들어가면 SyntaxError가 나므로 값을 먼저 변수로 뺀다.
title = r.get("title", "-")
slug = r.get("slug", "-")
persona = r.get("persona", "-")
score = r.get("audit_score", 0)
cycles = r.get("audit_cycles", 0)
url = r.get("url", "")
dur = r.get("duration_minutes", 0)
section = (
    f"*제목*: {title}\n"
    f"*주소*: `{slug}`\n"
    f"*작성자*: {persona}  ·  *점수*: {score}/100  ·  *보강*: {cycles}회\n"
    f"*URL*: <{url}|{url}>\n"
    f"*소요*: {dur}분"
)
blocks = [
    {"type": "section", "text": {"type": "mrkdwn", "text": section}},
    {"type": "context", "elements": [{"type": "mrkdwn", "text": "사이트 배포 5-10분 후 www.ours-magazine.jp 반영(Vercel)"}]},
]
print(json.dumps({"text": "📝 일일 블로그 자동 발행 완료", "blocks": blocks}, ensure_ascii=False))
')
      curl -s -X POST -H 'Content-Type: application/json' \
        -d "$PAYLOAD" "$SLACK_WEBHOOK_URL" > /dev/null
    fi
    echo "[$(date +%H:%M:%S)] ✅ 발행 완료 (duration=${DURATION}s)" | tee -a "$LOG_FILE"
    exit 0
    ;;
  no_topic)
    REASON=$(echo "$RESULT_JSON" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("reason","-"))')
    slack_notify_failure "topic-empty" "주제 도출 0개 — $REASON"
    echo "[$(date +%H:%M:%S)] ⚠ no_topic" | tee -a "$LOG_FILE"
    exit 0   # 정상 종료 (오늘 발행 스킵)
    ;;
  skipped)
    REASON=$(echo "$RESULT_JSON" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("reason","-"))')
    echo "[$(date +%H:%M:%S)] ⚠ skipped — $REASON (Semrush 한도/codex 쿨다운 등, 정상 종료)" | tee -a "$LOG_FILE"
    [ -n "${SLACK_WEBHOOK_URL:-}" ] && slack_notify_failure "skipped" "오늘 발행 스킵 (정상): $REASON" || true
    exit 0   # 정상 종료 (한도·쿨다운으로 의도된 스킵 — 실패 아님)
    ;;
  failed|*)
    PHASE=$(echo "$RESULT_JSON" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("phase","unknown"))')
    ERR=$(echo "$RESULT_JSON" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("error","-"))')
    slack_notify_failure "$PHASE" "$ERR"
    exit 1
    ;;
esac
