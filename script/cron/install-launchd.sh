#!/usr/bin/env bash
# launchd 설치 — ours-magazine 일일 자동 발행(구독 모드)을 한국과 동일하게 무인화.
# plist 템플릿의 경로 플레이스홀더를 현재 머신에 맞게 치환 → ~/Library/LaunchAgents/에 설치 → load.
#
# ⚠️ 선행 조건(중요): 이걸 돌리기 전에 `bash script/cron/run-local.sh`를 수동으로 1편 돌려
#    콘솔 크레딧이 안 줄고(=구독 청구) 정상 발행되는지 먼저 확인할 것. 검증 후 자동화.
#
# 사용: bash script/cron/install-launchd.sh          # 설치 + load (다음 08:00부터 자동)
#       bash script/cron/install-launchd.sh --uninstall   # 해제
set -uo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LABEL="com.ours-magazine.blog-daily"
SRC="$PROJECT_ROOT/script/cron/${LABEL}.plist"
DEST="$HOME/Library/LaunchAgents/${LABEL}.plist"
UID_NUM="$(id -u)"

if [ "${1:-}" = "--uninstall" ]; then
  launchctl bootout "gui/${UID_NUM}/${LABEL}" 2>/dev/null || launchctl unload "$DEST" 2>/dev/null || true
  rm -f "$DEST"
  echo "✓ 해제 완료: $LABEL (plist 제거 + launchctl bootout)"
  exit 0
fi

[ -f "$SRC" ] || { echo "✗ plist 템플릿 없음: $SRC"; exit 1; }
command -v claude >/dev/null || { echo "✗ claude CLI가 PATH에 없음 — 설치 후 재시도"; exit 1; }
mkdir -p "$HOME/Library/LaunchAgents" "$PROJECT_ROOT/tmp/local-logs"

# 1. 경로 치환 (__PROJECT_ROOT__, __HOME__) → DEST
sed -e "s|__PROJECT_ROOT__|${PROJECT_ROOT}|g" -e "s|__HOME__|${HOME}|g" "$SRC" > "$DEST"

# 2. plist 문법 검증
plutil -lint "$DEST" >/dev/null || { echo "✗ plist 문법 오류"; rm -f "$DEST"; exit 1; }

# 3. 기존 것 있으면 내리고 다시 load (idempotent)
launchctl bootout "gui/${UID_NUM}/${LABEL}" 2>/dev/null || true
if launchctl bootstrap "gui/${UID_NUM}" "$DEST" 2>/dev/null; then
  echo "✓ 설치 완료(bootstrap): $DEST"
else
  launchctl load -w "$DEST" && echo "✓ 설치 완료(load): $DEST" || { echo "✗ launchctl load 실패"; exit 1; }
fi

echo ""
echo "스케줄: 매일 10:00(로컬). 다음 실행까지 대기 — load 시 즉시 발행 안 함."
echo "상태 확인 : launchctl print gui/${UID_NUM}/${LABEL} | grep -E 'state|runs|program'"
echo "즉시 테스트: launchctl kickstart -k gui/${UID_NUM}/${LABEL}   (지금 1편 실행 — 구독 청구)"
echo "로그       : tail -f $PROJECT_ROOT/tmp/local-logs/launchd-*.log"
echo "해제       : bash script/cron/install-launchd.sh --uninstall"
echo ""
echo "⚠️ 전제: Mac 켜짐 + GUI 로그인 상태여야 구독 키체인 접근 가능."
