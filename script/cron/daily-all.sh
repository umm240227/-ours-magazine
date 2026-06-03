#!/usr/bin/env bash
# 매일 오전 07:30 KST 통합 cron 진입점 (블로그 + 리뷰 → 단일 git push)
# launchd가 ~/Library/LaunchAgents/com.snshelp.daily-all.plist 통해 호출
#
# 흐름:
#   1. 블로그 작성 (script/cron/daily-blog.sh, commit까지)
#   2. 리뷰 작성  (script/cron/daily-product-reviews.sh, commit까지)
#   3. HEAD 변동 있으면 git push origin main 1회 → Vercel 자동빌드 1회
#   4. push 결과 Slack 알림 (블로그·리뷰 각자 결과 Slack은 sub script가 발송)
#
# 한쪽 실패 시: 다른 쪽 commit이 있으면 push. 둘 다 commit 없으면 push 스킵.
# blog cron(07:57)·product-reviews cron(09:30) 분리 운영을 통합하면서 git push 충돌 + 이중 Vercel 자동빌드 제거.

set -uo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOG_DIR="$PROJECT_ROOT/tmp/cron-daily-all"
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

# PATH 보강 + fd limit (launchd 기본 256 → claude CLI 즉사 방지)
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.local/bin:$PATH"
ulimit -n 524288 2>/dev/null || ulimit -n 65536 2>/dev/null || true

{
  echo "════════════════════════════════════════════════════════"
  echo "[$DATE $TIME] 일일 통합 cron 시작 (블로그 + 리뷰 → 단일 push)"
  echo "════════════════════════════════════════════════════════"
  echo "[env] PWD=$(pwd)"
  echo "[env] SLACK_WEBHOOK_URL=${SLACK_WEBHOOK_URL:+(set)}${SLACK_WEBHOOK_URL:-(missing)}"
  echo "[env] ulimit -n (soft)=$(ulimit -n)  hard=$(ulimit -Hn)"
} | tee -a "$LOG_FILE"

# ── Slack helper (push 결과 통합 알림용) ─────────────
slack_send() {
  local text="$1"
  [ -z "${SLACK_WEBHOOK_URL:-}" ] && return
  curl -s -X POST -H 'Content-Type: application/json' \
    -d "{\"text\":\"$text\"}" "$SLACK_WEBHOOK_URL" >/dev/null 2>&1 || true
}

# ── git HEAD 기준점 ───────────────────────────────────
GIT_BEFORE=$(git rev-parse HEAD 2>/dev/null || echo "none")
echo "[git] BEFORE=$GIT_BEFORE" | tee -a "$LOG_FILE"

# ── Phase 1/3: 블로그 ─────────────────────────────────
echo "" | tee -a "$LOG_FILE"
echo "════════════ Phase 1/3: 블로그 시작 [$(date +%H:%M:%S)] ════════════" | tee -a "$LOG_FILE"
BLOG_START=$(date +%s)
set +e
bash "$PROJECT_ROOT/script/cron/daily-blog.sh"
BLOG_EXIT=$?
set -e
BLOG_DURATION=$(($(date +%s) - BLOG_START))
GIT_AFTER_BLOG=$(git rev-parse HEAD 2>/dev/null || echo "none")
[ "$GIT_BEFORE" != "$GIT_AFTER_BLOG" ] && BLOG_COMMITTED=1 || BLOG_COMMITTED=0
echo "════════════ Phase 1/3: 블로그 종료 exit=$BLOG_EXIT, ${BLOG_DURATION}s, committed=$BLOG_COMMITTED ════════════" | tee -a "$LOG_FILE"

# ── Phase 2/3: 리뷰 ───────────────────────────────────
echo "" | tee -a "$LOG_FILE"
echo "════════════ Phase 2/3: 리뷰 시작 [$(date +%H:%M:%S)] ════════════" | tee -a "$LOG_FILE"
REVIEW_START=$(date +%s)
# 후기(daily-product-reviews) 단계 미이전 — 스크립트 부재 시 건너뜀 (정상 종료 처리)
if [ -f "$PROJECT_ROOT/script/cron/daily-product-reviews.sh" ]; then
  set +e
  bash "$PROJECT_ROOT/script/cron/daily-product-reviews.sh"
  REVIEW_EXIT=$?
  set -e
else
  echo "[review] daily-product-reviews.sh 없음 — 리뷰 단계 건너뜀" | tee -a "$LOG_FILE"
  REVIEW_EXIT=0
fi
REVIEW_DURATION=$(($(date +%s) - REVIEW_START))
GIT_AFTER_REVIEW=$(git rev-parse HEAD 2>/dev/null || echo "none")
[ "$GIT_AFTER_BLOG" != "$GIT_AFTER_REVIEW" ] && REVIEW_COMMITTED=1 || REVIEW_COMMITTED=0
echo "════════════ Phase 2/3: 리뷰 종료 exit=$REVIEW_EXIT, ${REVIEW_DURATION}s, committed=$REVIEW_COMMITTED ════════════" | tee -a "$LOG_FILE"

# ── Phase 3/3: 통합 git push ──────────────────────────
echo "" | tee -a "$LOG_FILE"
echo "════════════ Phase 3/3: 통합 git push [$(date +%H:%M:%S)] ════════════" | tee -a "$LOG_FILE"
echo "[git] BEFORE=$GIT_BEFORE  AFTER_BLOG=$GIT_AFTER_BLOG  AFTER_REVIEW=$GIT_AFTER_REVIEW" | tee -a "$LOG_FILE"

if [ "$GIT_BEFORE" = "$GIT_AFTER_REVIEW" ]; then
  echo "[push] commit 없음 — push 스킵 (Vercel 자동빌드 미발생)" | tee -a "$LOG_FILE"
  PUSH_STATUS="skipped"
else
  set +e
  git push origin main 2>&1 | tee -a "$LOG_FILE"
  PUSH_EXIT=${PIPESTATUS[0]}
  set -e
  if [ "$PUSH_EXIT" -eq 0 ]; then
    PUSH_STATUS="success"
    echo "[push] ✅ git push 완료 — Vercel 자동빌드 트리거됨" | tee -a "$LOG_FILE"
  else
    PUSH_STATUS="failed"
    echo "[push] ❌ git push 실패 (exit=$PUSH_EXIT)" | tee -a "$LOG_FILE"
  fi
fi

# ── 통합 Slack 알림 (push 결과 + 블로그·리뷰 요약) ────
TOTAL_DURATION=$((BLOG_DURATION + REVIEW_DURATION))
BLOG_STATE=$([ "$BLOG_COMMITTED" = "1" ] && echo "✅ 작성 완료" || ([ "$BLOG_EXIT" -eq 0 ] && echo "⚠️ 변경 없음" || echo "❌ 오류(코드 $BLOG_EXIT)"))
REVIEW_STATE=$([ "$REVIEW_COMMITTED" = "1" ] && echo "✅ 작성 완료" || ([ "$REVIEW_EXIT" -eq 0 ] && echo "⚠️ 변경 없음" || echo "❌ 오류(코드 $REVIEW_EXIT)"))

case "$PUSH_STATUS" in
  success)
    slack_send "🚀 *일일 자동 작업 완료 ($DATE)*\n• 블로그: $BLOG_STATE\n• 후기: $REVIEW_STATE\n• 사이트 반영: ✅ 배포 시작 (5-10분 후 www.ours-magazine.jp 반영)\n• 총 소요: $((TOTAL_DURATION/60))분"
    ;;
  skipped)
    slack_send "⚠️ *일일 자동 작업 — 배포 없음 ($DATE)*\n• 블로그: $BLOG_STATE\n• 후기: $REVIEW_STATE\n• 두 작업 모두 새 변경 없음 → 사이트 반영 생략. 각 작업 알림에서 원인을 확인하세요."
    ;;
  failed)
    slack_send "❌ *일일 자동 작업 — 사이트 반영 실패 ($DATE)*\n• 블로그: $BLOG_STATE\n• 후기: $REVIEW_STATE\n• 사이트 반영: ❌ 수동 반영 필요 (로그: \`$LOG_FILE\`)"
    ;;
esac

# 종료 코드: push 실패면 1, 두 단계 모두 fail이면 1, 그 외 0
if [ "$PUSH_STATUS" = "failed" ]; then
  exit 1
fi
if [ "$BLOG_EXIT" -ne 0 ] && [ "$REVIEW_EXIT" -ne 0 ]; then
  exit 1
fi
exit 0
