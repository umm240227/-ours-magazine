#!/usr/bin/env bash
# Railway 스케줄러 워커 — 시드 리스트에서 1개 골라 헤드리스 자동 발행 (jp-site-config §8).
# launchd daily-all.sh의 Railway 대응. 매 실행 1편 생성 → md-publish --commit → git push origin main → Vercel.
# env: ANTHROPIC_API_KEY(필수), GIT_PUSH_TOKEN/원격 설정, SLACK_WEBHOOK_URL(선택), MAX_BUDGET_USD(기본 30), CHROME_BIN.
set -uo pipefail

PROJECT_ROOT="${PROJECT_ROOT:-/app}"
cd "$PROJECT_ROOT" || { echo "✗ cd $PROJECT_ROOT 실패"; exit 1; }
LOG_DIR="$PROJECT_ROOT/tmp/railway-logs"; mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/run-$(date +%Y%m%d-%H%M%S).log"

slack() { [ -n "${SLACK_WEBHOOK_URL:-}" ] && curl -s -X POST -H 'Content-type: application/json' \
  --data "$(python3 -c 'import json,sys; print(json.dumps({"text":sys.argv[1]}))' "$1")" "$SLACK_WEBHOOK_URL" >/dev/null 2>&1 || true; }

# 0. 사전 확인
[ -z "${ANTHROPIC_API_KEY:-}" ] && { echo "✗ ANTHROPIC_API_KEY 미설정"; slack "✗ Railway 블로그: ANTHROPIC_API_KEY 미설정"; exit 1; }
command -v claude >/dev/null || { echo "✗ claude CLI 없음 (Dockerfile 확인)"; slack "✗ Railway 블로그: claude CLI 없음"; exit 1; }

# 0.5 git push 설정 (GIT_PUSH_TOKEN = gono92 fine-grained PAT, Contents R/W) + 최신 main 동기화
git config --global --add safe.directory "$PROJECT_ROOT" 2>/dev/null || true
git config user.email "${GIT_AUTHOR_EMAIL:-bot@ours-magazine.jp}"
git config user.name "${GIT_AUTHOR_NAME:-ours-magazine-bot}"
if [ -n "${GIT_PUSH_TOKEN:-}" ]; then
  git remote set-url origin "https://x-access-token:${GIT_PUSH_TOKEN}@github.com/umm240227/-ours-magazine.git" 2>/dev/null || true
fi
git fetch origin main 2>/dev/null && git pull --ff-only origin main 2>&1 | tee -a "$LOG" || echo "[warn] git pull 실패(계속)" | tee -a "$LOG"

# 1. 다음 시드 (content/articles에 아직 없는 첫 시드)
SEED=$(python3 - <<'PY'
import yaml, os
for t in (yaml.safe_load(open('script/cron/seed-topics.yml')) or {}).get('topics', []):
    if not os.path.exists(f"content/articles/{t['slug']}.md"):
        print('\t'.join([t['slug'], t['topic'], t['main_keyword'], t.get('secondary',''), t['category']])); break
PY
)
if [ -z "$SEED" ]; then echo "시드 소진 — seed-topics.yml에 주제 추가 필요"; slack "ℹ️ Railway 블로그: 시드 소진(새 주제 추가 필요)"; exit 0; fi
IFS=$'\t' read -r SLUG TOPIC MAIN_KW SECONDARY CATEGORY <<< "$SEED"
echo "[$(date '+%F %T')] 시드: $SLUG / $TOPIC" | tee -a "$LOG"

# 2. 프롬프트 채우기
PROMPT=$(mktemp)
sed -e "s|{{TOPIC}}|${TOPIC}|g" -e "s|{{MAIN_KEYWORD}}|${MAIN_KW}|g" -e "s|{{SECONDARY}}|${SECONDARY}|g" \
    -e "s|{{CATEGORY}}|${CATEGORY}|g" -e "s|{{SLUG}}|${SLUG}|g" script/cron/seed-prompt-template.md > "$PROMPT"

# 3. 헤드리스 실행 (Opus, 예산 캡, bypassPermissions — 무인 자율)
echo "[$(date '+%F %T')] claude -p 실행 (Opus, 예산 \$${MAX_BUDGET_USD:-30})" | tee -a "$LOG"
cat "$PROMPT" | claude -p --permission-mode bypassPermissions --model opus \
  --max-budget-usd "${MAX_BUDGET_USD:-30}" --add-dir "$PROJECT_ROOT" 2>&1 | tee -a "$LOG"
rm -f "$PROMPT"

# 4. 결과 JSON 추출 (로그 마지막의 단독 JSON)
STATUS=$(python3 - "$LOG" <<'PY'
import sys, json
for line in reversed(open(sys.argv[1]).read().strip().splitlines()):
    line = line.strip()
    if line.startswith('{') and '"status"' in line:
        try: print(json.loads(line).get('status','')); break
        except Exception: pass
PY
)

# 5. status 처리
case "$STATUS" in
  success)
    # md-publish --commit 가 commit까지 함 → origin/main 보다 앞선 commit 있으면 push
    if git log origin/main..HEAD --oneline 2>/dev/null | grep -q .; then
      git push origin main 2>&1 | tee -a "$LOG" \
        && { echo "[$(date '+%F %T')] ✅ 발행+push: $SLUG"; slack "✅ Railway 블로그 발행: $SLUG → Vercel 배포 시작"; } \
        || slack "⚠️ Railway 블로그: $SLUG 생성됐으나 git push 실패 — 토큰/권한 확인"
    else
      slack "⚠️ Railway 블로그: $SLUG success인데 commit 없음 — md-publish --commit 확인"
    fi ;;
  skipped) slack "ℹ️ Railway 블로그 스킵: $SLUG"; exit 0 ;;
  failed|*) echo "[$(date '+%F %T')] ✗ $SLUG status='${STATUS:-no-json}'" | tee -a "$LOG"; slack "✗ Railway 블로그 실패: $SLUG (status=${STATUS:-no-json}) — 로그 확인"; exit 1 ;;
esac
