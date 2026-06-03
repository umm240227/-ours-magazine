# 시드 자동 발행 prompt (Railway 헤드리스 — self-contained)

너는 ours-magazine.jp 블로그 자동화를 끝까지 자동 실행한다. 새 세션, 이전 컨텍스트 없음. 작업 디렉터리 = 레포 루트.

## 0. 가장 먼저
`.ai-rules/jp-site-config.md`를 Read. JP 플랫폼/로케일 정본 — KR 스킬·룰과 충돌하는 모든 지점(발행 경로·DB·Naver·draft 경로·/referral·폰트·검증 타깃·본문 GFM·팩트체크)은 **이 문서가 무조건 우선**.

## 1. 시드 (Semrush 발굴 SKIP — 아래 값 신뢰)
- **주제**: {{TOPIC}}
- **메인 키워드**: {{MAIN_KEYWORD}}
- **보조 키워드**: {{SECONDARY}}
- **카테고리**: `{{CATEGORY}}`（content/_taxonomy.json 정본 라벨）
- **슬러그**: `{{SLUG}}`（영문 kebab, =파일명）
- **페르소나**: `.ai-rules/blog-personas.md`에서 카테고리에 맞는 1명 선택 → frontmatter `author`.
- **사이트 성격**: 정보 중심 + 약한 유입(§10). /referral 금지.

## 2. 절차 (topic·keywords 발굴 SKIP, write부터)
- **`.claude/skills/blog/write.md`** 정본대로 일본어 기사 작성: Semrush·네이버 금지. 커뮤니티 페인은 Yahoo!知恵袋/5ch/note/Reddit를 WebSearch/WebFetch로(실제 인용·출처). 통계는 WebFetch로 원문 실재 검증. 본문 **순수 GFM 5단 순서**(§3). FAQ는 `## よくある質問` + frontmatter `faq:[{question,answer}]`. **인포그래픽 ≥3장**(hero typography 1 + 본문 인포/차트 ≥2): `script/hero-templates`·`infographic-templates`(일본어화됨)에서 선택·렌더. **hero는 `--max-height=675`로 렌더**(16:9; 안 주면 세로형 깨짐, write.md). draft = `drafts/{{SLUG}}.md`, 이미지 `drafts/images/{{SLUG}}/`.
- **`.claude/skills/blog/audit.md`** 정본대로 100점까지 보강(답변캡슐 100%, GFM 게이트, **Phase 3.5 적대적 팩트체크 MANDATORY** → frontmatter `_fact_checked` 기록 + 외부 출처 ≥3 마크다운 링크). 검색량·SERP 채점 제외. **보강 루프 최대 8회**, 미달 시 결과 JSON `failed`.
- **발행**: `node script/md-publish.mjs drafts/{{SLUG}}.md --commit` (content/articles + public/images 생성 + git add + **commit까지만, push 금지** — run-railway.sh가 마지막에 1회 push). md-publish 게이트(validate-blog-publish + fact-check-gate + audit-cdn-gate + 이미지품질100 + 답변캡슐) 전부 통과해야 commit. 차단 시 메시지대로 보강 후 재시도.

## 3. 결과 (stdout 마지막에 JSON 단독)
`{"status":"success|failed|skipped", "slug":"{{SLUG}}", "audit_score":N, "audit_cycles":N, "images":N, "url":"...", "notes":"..."}`

## 제약
Semrush·네이버·codex·git push **금지**(commit까지만). /referral 금지. 사용자 확인 대기 없이 끝까지 자동. 막히면 우회 말고 `failed`+막힌 지점 보고.
