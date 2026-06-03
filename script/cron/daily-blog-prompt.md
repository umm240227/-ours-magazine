# 일일 자동 블로그 발행 prompt (cron headless 실행용)

이 prompt는 [`daily-blog.sh`](./daily-blog.sh)가 `claude -p`로 호출하는 자동 실행 지시문이다. 새 세션이라 이전 컨텍스트 없음 — self-contained.

발행은 md-publish.mjs(content/articles + public/images + git push origin main → Vercel). WordPress/S3 사용 금지.

---

`/blog create auto`

위 단일 명령을 끝까지 자동 실행한다. 사용자 확인 없이.

- `.claude/skills/blog/SKILL.md` §3-A `create auto` 모드 흐름 정본 그대로 따른다 (Phase 1~8 + 🔵 모두 자동 결정 + 보강 무제한 + status=publish + **git commit까지만 — git push 호출 금지**).
- 발행은 `node script/md-publish.mjs <draft.md> --commit` (content/articles + public/images 생성 + git add + **commit까지만**). `--push` 쓰지 말 것.
- `git push`는 통합 cron(`daily-all.sh`)이 리뷰 단계까지 마친 뒤 마지막에 1회만 수행한다. 이 prompt 흐름 안에서 `git push origin main`을 직접 실행하지 않는다.
- 모든 정책 (seo-policy §1.9 / §1.10, asset-images §4.8.2~§4.10.6, blog-personas §2.5, write·audit·publish 단계 blog/write.md·blog/audit.md·blog/publish.md)을 그대로 적용.
- Phase 8 직후 결과 JSON을 stdout 마지막에 단독 출력 — JSON 외 텍스트 없음. daily-blog.sh가 파싱해서 Slack 알림 전달.

**이미지 게이트 (HARD — 우회 금지)**:
- `_draft.images` ≥ 3장 (hero 1 + 본문 ≥ 2) 필수. 누락 시 `md-publish.mjs` exit 2 차단.
- hero는 **항상 typography 인포그래픽 1장** (asset-images §4.8.2). photo·screenshot·chart는 hero 금지(본문 보조 이미지로만). `script/hero-templates/` 정본 3종(`title-typography.html` · `v2-stat-hero.html` · `v3-split.html`, 모두 16:9 1200×675 viewport 강제) 중 글 주제에 맞는 1개 선택. 같은 hero 템플릿이 직전 5편 연속이면 다른 템플릿 강제. 선택한 템플릿은 frontmatter `_draft.hero_template`에 `v1`/`v2`/`v3` 또는 파일명으로 기록. T07~T16 카탈로그는 본문 인포그래픽 전용 — hero 금지(§4.10.3 본문 다양성 룰).
- 본문 이미지에는 인포그래픽(§4.10) 또는 스크린샷(§4.8.3, `script/capture-screenshot.mjs` 사용) 또는 차트(§4.10) 최소 1장 포함.
- Phase 5 SKIP 금지. 시간 초과로 멈추면 `{"status":"failed","phase":"image-verify"}` 출력 후 종료.

**100점 보강 게이트 (HARD — 우회 금지)**:
- audit 단계(blog/audit.md) 결과 `_audit_score < 100`이면 publish 금지. `md-publish.mjs`가 frontmatter `_audit_score` 검사해 100 미만이면 exit 2 차단.
- 100 미달 시 audit 단계(blog/audit.md) Top 5 개선안을 write 단계(blog/write.md)에 전달해 재작성 → audit 재실행 → 100 도달까지 무제한 반복.
- 매 audit-write 사이클 종료 시 frontmatter `_audit_score`·`_audit_cycles` 갱신.
- 시간 초과(전체 실행 60분 이상)로 100 미도달 시 `{"status":"failed","phase":"audit-loop","error":"100점 미도달, cycles=N, last_score=M"}` 출력 후 종료. 다음 trigger(익일 07:57) 재시도.

Pre-flight·승인 대기 SKIP. 끝까지 자동.
