# 전수조사 메서드론

코드베이스에서 패턴·가드·도메인 동작을 빠짐없이 조사하기 위한 정본 룰.

`/survey` 스킬은 이 문서를 따른다. 사용자가 "전수조사", "모든 사용처", "어디서 사용 중인지", "누락 없이", "전체 감사", "혹시 빠진 데 있어?" 류로 요청하면 이 문서의 절차로 진행한다.

---

## 핵심 원칙

1. **집계는 Bash/rg 전체 출력으로**: Grep 도구는 head_limit에 잘리므로 사용 금지.
2. **분류·정합성 판단은 파일 Read로**: grep 결과만 보고 추정 금지.
3. **키워드 grep만으로 결론 금지**: 키워드가 들어있는 코드만 잡힌다. 가드가 빠진 코드는 키워드도 없으므로 별도 절차(역방향 조사)로 검증한다.
4. **Phase 0에서 조사 유형을 먼저 확정**: 유형이 다르면 절차도 다르다.
5. **다수 sub-agent fan-out은 중단 복구 정본을 따른다**: 글/페이지/후기 1건당 sub-agent를 띄우는 전수조사는 [subagent-checkpoint.md](subagent-checkpoint.md)대로 진행 파일에 실시간 기록하고, 메인은 launch 전 읽어 미완만 재개한다. VSCode 재시작·네트워크 끊김에도 처음부터 다시 하지 않는다.

---

## Phase 0 — 조사 유형 확정

요청을 다음 네 유형으로 분류한다. 한 요청이 두 유형에 걸치면 두 절차를 모두 수행한다.

| 유형 | 의미 | 추가로 수행할 Phase |
|------|------|-------------------|
| **카운트형** | 특정 토큰의 사용처를 빠짐없이 나열·카운트 | Phase 1-3, 5, 6 |
| **가드 정합성형** | 분기 가드(예: `isLoggedIn`, `hasPermission`)의 boolean이 도메인 의도와 일치하는지 검증 | Phase 1-4, 5, 6 |
| **누락 검증형** | 특정 동작에 가드/처리가 들어갔어야 할 위치를 모두 식별 | Phase 1, 2, 4, 5, 6 (전부) |
| **계약 정합성형** | 두 시스템(WP API↔앱, schema↔model 등)의 leaf 필드 단위 매핑이 양쪽 모두 사용되는지 검증 | Phase 1, 1.5, 2, 5(컨텍스트), 6 |

대표 키워드:
- 카운트형: "사용처", "전부", "모든 ~", "어디서 쓰여?"
- 가드 정합성형: "이 가드 제대로 들어갔어?", "권한 분기 정확해?"
- 누락 검증형: "신규 카테고리 관련된 거 다 찾아", "혹시 빠진 데 있어?", "전체 감사"
- 계약 정합성형: "WP에서 내려보내지만 앱에서 안 쓰는 필드", "응답에 있는데 클라가 안 쓰는 필드", "스키마와 model mismatch"

---

## Phase 1 — 조사 범위 확정

다음을 명시한다.

- **조사 대상**: 키워드·식별자·도메인 (예: 색상 토큰, 컴포넌트, "포스트 카테고리 도메인")
- **조사 경로**: 어떤 디렉토리·언어 (예: `src/`, `script/`, `src/pages/`)
- **조사 유형**: Phase 0 결과
- **분류 기준**: 결과를 어떻게 나눌지 (예: A/B/C 카테고리)
- **검증 깊이**: 가드 정합성/누락 검증형이면 어디까지 본문을 검증할지 (컴포넌트 render 함수 포함, getStaticPaths 본문 포함 등)

---

## Phase 1.5 — 전수 leaf 목록 빌드 (계약 정합성형 필수)

**계약 정합성형(WP API↔앱, 스키마↔모델 등)에서 가장 자주 발생하는 실패는 "샘플링 후 일반화"다.** 이를 차단하기 위해 본조사 전에 양쪽 시스템의 모든 leaf 필드를 파일로 추출하고 매핑 테이블을 만든다. 메인 에이전트가 직접 수행한다. 빠지면 그 endpoint·필드는 영원히 안 잡힌다.

### 1.5-1. 양쪽 leaf 목록 추출

**소스 측 (예: WP REST API 응답)**:
- 모든 endpoint 또는 응답 샘플을 직접 Read하여 응답 스키마를 추출
- 각 응답의 모든 leaf 필드(중첩 객체는 재귀적으로 풀어서)를 파일로 저장
- 결과는 `tmp/survey-<topic>-source-fields.txt`에 `endpoint | model | field_path` 형식으로 저장

**타겟 측 (예: 앱 코드)**:
- 모든 모델 파일·`response.data[...]`·`post[...]`·TypeScript interface 접근 키를 추출
- 결과는 `tmp/survey-<topic>-target-keys.txt`에 저장

### 1.5-2. 매핑 테이블

`tmp/survey-<topic>-mapping.tsv` 파일에 다음 형식으로 모든 leaf를 한 줄씩 기록한다. 누락 0건이 목표.

```
endpoint	model	field_path	json_key	camelCase	검증_상태
/wp-json/wp/v2/posts	Post	id	id	id	pending
/wp-json/wp/v2/posts	Post	title.rendered	rendered	rendered	pending
...
```

**`wc -l`로 행 수를 명시하고 보고에 포함한다.** "약 N개", "주요 필드만"은 금지. **모든 endpoint × 모든 leaf**를 행으로 만든다.

### 1.5-3. 요청 / 응답 분리 (CRITICAL)

같은 필드명이 요청 body와 응답 모델 양쪽에 있는 경우는 **반드시 별도 행**으로 기록한다. Phase 5 컨텍스트 검증에서 이 구분 없이 hits 카운트만 보고 "사용 중"으로 판정하면 응답 미사용을 놓친다.

### 1.5-4. Sub-agent 위임 시 전체 매핑 전달

Phase 5 분류를 sub-agent에 위임하는 경우, **부분 집합이 아니라 `tmp/survey-<topic>-mapping.tsv` 전체를 첨부**한다. "주요 필드만 검토" 또는 "샘플 10개 기준으로 분류" 류의 위임은 금지.

---

## Phase 2 — 정방향 카운트 (Bash 파이프라인)

Bash 도구에서 `rg` 또는 `grep`을 사용한다. Grep 도구는 사용하지 않는다.

```bash
# 권장: ripgrep
rg -n --hidden -g '!dist/**' -g '!node_modules/**' -g '!.git/**' -g '!tmp/**' \
   'PATTERN' PATH | tee tmp/survey-<topic>.txt
wc -l tmp/survey-<topic>.txt

# 파일별 카운트
awk -F: '{print $1}' tmp/survey-<topic>.txt | sort | uniq -c | sort -rn

# 단순 토큰 추출/카운트 (macOS BSD grep: -P 금지)
grep -rn 'PATTERN' --include="*.tsx" --include="*.ts" --include="*.astro" PATH \
  | sed 's/.*\(EXTRACT\).*/\1/' | sort | uniq -c | sort -rn
```

### 패턴 설계 규칙

- **여러 표기법을 OR로 합쳐 한 번에**: 예 `postCategory|post_category|PostCategory|postCat`. 단일 키워드만 잡으면 표기법 다른 곳을 누락한다.
- **컴포넌트명·함수명·식별자·문자열 리터럴·className·CSS 클래스명**까지 포함.
- 결과가 200줄을 넘으면 `tmp/survey-<topic>.txt`에 저장하고 `wc -l`로 총 건수 확보.
- `head`, `tail`, `sed -n '1,Np'`는 미리보기 전용. 결론 도출에 사용 금지.

---

## Phase 3 — 가드 boolean 정합성 검증 (가드 정합성형 필수)

각 가드 사용처에서 다음을 라인 단위 Read로 검증한다.

1. **가드의 카테고리 (A/B/C 등)** 가 도메인 의도와 일치하는가
2. **boolean 조합** 이 의도된 분기를 정확히 표현하는가 (예: `isActive && role === 'admin'` vs `isActive`만)
3. **가드가 적용되는 블록 범위** 가 의도와 맞는가 (early return? JSX 조건부 렌더? if/else?)

### Read 깊이 규칙

- 파일 첫 N줄만 읽고 분류 종결 금지. **컴포넌트 render/main/handler/SQL 본문 등 핵심 로직 블록을 끝까지 읽는다**.
- 가드 조건의 boolean 조합은 변수 정의·이전 라인 컨텍스트까지 포함해 확인한다.
- "이 함수는 보통 ~할 것"이라는 함수명 기반 추론 금지. 본문을 직접 읽는다.

### 보고 형식 (가드 정합성형)

각 가드 위치에 대해:

```
파일:라인 | 가드 내용 | 도메인 카테고리 | 의도 일치 여부
```

의도 불일치 케이스는 별도 섹션으로 분리하고, 수정 제안은 사용자 결정에 맡긴다.

---

## Phase 4 — 역방향 조사 (누락 검증형 필수)

키워드 grep으로는 "가드/처리가 빠진 위치"를 잡을 수 없다. 다음 절차로 능동 식별한다.

### 4-1. 도메인 의도 목록화

조사 대상 도메인이 영향을 미쳐야 할 동작·UI·이벤트를 도메인 관점에서 모두 나열한다.

예시 (포스트 권한 도메인):
- 페이지 진입점 (pages/*.astro, getStaticPaths)
- 포스트 리스트 (필터, 정렬, 페이지네이션)
- 포스트 상세 (메타, 본문, 댓글)
- 어드민 액션 (편집, 삭제, draft 표시)
- WP REST 호출 (axios get/post, 인증 헤더)
- 토스트·모달·확인 다이얼로그

### 4-2. 각 동작에 대해 코드 매칭

도메인 항목별로 "이 동작이 구현된 위치"를 찾고, 그 위치에 가드가 들어갔는지 검증한다.

```bash
# 도메인 의도별 키워드로 진입점 식별
rg -n 'getStaticPaths|axios\.|api\.|fetch\(' src/

# 진입점에서 가드 키워드가 같이 등장하는지 확인
rg -n -B5 -A5 'deletePost|updatePost' src/ | grep -E 'isAdmin|hasPermission|role'
```

### 4-3. 가드 미적용 위치 보고

도메인 의도 항목 중 "가드가 들어갔어야 하는데 안 들어간" 위치를 별도 섹션으로 보고한다. 의도가 불명확하면 사용자에게 확인을 요청한다.

### 4-4. 다중 데이터 소스 정합성 별도 조사

여러 데이터 소스(WP REST + 로컬 fallback + 캐시 등)를 OR로 묶어 합성하는 코드는 키워드 grep으로 누락이 안 잡힌다. 다음을 별도로 수행한다.

```bash
# 도메인 관련 모든 데이터 소스를 동시에 OR로 매칭
rg -n 'wp-json|fallback|localCache|cachedPost' src/
```

각 소스 본문을 Read로 직접 검증해 "한쪽 소스만 보고 다른 쪽 분기를 누락한 케이스"를 식별한다.

---

## Phase 5 — 분류

카운트만으로 구분이 안 되는 경우 Read로 직접 본문을 읽고 분류한다. 50건 이상이면 서브에이전트에 분류만 위임 가능 (아래 "서브에이전트 활용" 참조).

```bash
# 컨텍스트 포함 추출
rg -n -B3 'PATTERN' PATH
```

### 5-1. 매칭 hits 수 ≠ 사용 판정 (CRITICAL)

**hits ≥ 1이면 "사용 중"으로 단정하는 것이 가장 흔한 실패 패턴이다.** 다음 컨텍스트 구분 없이 판정 금지.

| 매칭 컨텍스트 | 판정 |
|---|---|
| 응답 파싱 (`response.data.key`, `post.key`, JSON.parse) | **응답 사용 중** |
| 요청 body 작성 (`{ key: value }`, post body) | **응답 미사용** (요청만 씀) |
| docstring·주석 (`// key: ...`, `/** @param key */`) | **미사용** |
| 주석 처리된 코드 (`// xxx.key`) | **미사용** |
| 이름 충돌 (다른 도메인의 동명 필드) | **해당 endpoint 컨텍스트만 사용 중 / 그 외 미사용** |
| 외부 SDK 응답 (예: 다른 라이브러리의 동명 필드) | **API 응답 미사용** |

각 매칭 행에 대해 **반드시** 해당 라인 ±5 컨텍스트를 Read하고 위 표 중 어느 컨텍스트인지 분류한 뒤에만 "사용 중" 판정을 내린다.

### 5-2. 매칭 0건이면 추가 표기법 검증

snake_case로 0건이어도 camelCase·중간변형(예: `postCategory`, `post_category`)으로 다시 grep하여 0건임을 확정한다. 두 표기 모두 0건일 때만 "미사용".

### 5-3. fire-and-forget endpoint는 응답 전체가 미사용

코드가 `void` 또는 `await`만 하고 반환값을 받지 않으면 그 endpoint의 응답 leaf 전체가 미사용이다. 호출 측 함수 시그니처를 직접 Read해서 반환값 사용 여부를 확인한다.

---

## Phase 6 — 결과 보고

```
## [조사 대상] 전수조사 결과

### 요약
- 조사 유형: 카운트형 / 가드 정합성형 / 누락 검증형 / 계약 정합성형
- 조사 범위: [디렉토리/파일 수]
- 총 사용 건수: [정확한 숫자, 명령 출력 그대로]
- 분류별: [카테고리 A] N건, [카테고리 B] N건

### 상세
| 파일 | 라인 | 분류 | 비고 |
|------|------|------|------|
| ... | ... | ... | ... |

### 의도-구현 정합성 (가드 정합성형)
- ✅ 정합 N건
- ⚠️ 의심 N건 (위치·의도 추정·확인 필요 사항 명시)

### 누락 위치 (누락 검증형)
- 도메인 의도 항목별로 "가드 적용 / 미적용" 매트릭스
- 미적용 위치는 파일:라인 + 의도 추정 + 사용자 확인 요청

### 보고서 검증
- 모든 수치는 명령 출력 원본에서 인용. 추정·반올림 금지.
- 상세가 길면 `tmp/survey-<topic>.txt` 경로 함께 명시.
```

---

## macOS 환경 제약

- **`grep -P` / `grep -oP` 사용 금지**: BSD grep에 없음. 에러.
- 대체: `grep -E` (확장 정규식) + `sed` 조합.
  ```bash
  # ❌ 금지: grep -oP '(?<=color: )colors\.\w+'
  # ✅ 대체: grep 'color:' | sed 's/.*color: \(colors\.[a-zA-Z0-9_]*\).*/\1/'
  ```
- `grep -r`, `grep -E`, `rg`는 사용 가능.

---

## 절대 금지 사항

- **Grep 도구로 전수 카운트 금지** — head_limit에 잘림. 반드시 Bash 사용.
- **`grep -P` 사용 금지** — macOS BSD grep에 없음.
- **상위 N개 미리보기로 결론 금지** — `head`/`tail`/도구 출력 잘림은 전수조사 근거가 아님.
- **출력 길이 핑계로 생략 금지** — 전체 결과를 파일로 저장하고 `wc -l`로 검증.
- **"약 N건", "추정 N%" 금지** — 모든 수치는 명령 출력에서 그대로 인용.
- **샘플링 후 일반화 절대 금지** — "앞 10개를 보니 대부분 ~", "주요 필드만 검토", "대표 endpoint만 봄"은 전수조사 아님.
- **함수명·파일명 기반 동작 추론 금지** — 본문을 직접 Read로 확인.
- **컴포넌트 render/main 본문 미확인 채 결론 금지** — Phase 3 Read 깊이 규칙 준수.
- **키워드 grep만으로 누락 0건 단정 금지** — 누락 검증형은 Phase 4 역방향 조사 필수.
- **서브에이전트에 전수조사 전체 재위임 금지** — 분류만 위임 가능. 위임 시 leaf 전체 매핑(tsv) 첨부 필수.
- **서브에이전트 결과를 그대로 통과 금지** — "미사용/사용 중" 판정의 핵심 행은 메인이 직접 grep + Read 재검증해야 한다.
- **hits ≥ 1 → 사용 중 단정 금지** — 요청 body, docstring, 주석, 이름 충돌, 외부 SDK 매칭은 응답 사용이 아님. Phase 5-1 표대로 컨텍스트 분류 후 판정.
- **요청 / 응답 동명 필드 통합 카운트 금지** — 요청과 응답을 별도 행으로 검증.
- **응답 전체 leaf를 한 묶음으로 보고 판정 금지** — 중첩 객체는 부모만 보지 말고 자식 leaf까지 행으로 풀어서 검증.
- **근거 없는 퍼센트/비율 금지** — 계산식 없는 "95% 준수" 금지.

---

## 블로그 본문/figure/SEO 전수조사 (글 1편당 sub-agent 1개 — CRITICAL)

블로그(`wp-content/posts/*.md`)의 본문·figure·alt·figcaption·외부 링크·출처·구조·SEO meta 등 콘텐츠 차원 전수조사는 **글 1편당 sub-agent 1개씩 띄워서 진행**한다. 8개씩 병렬로 cycle을 돌린다.

**왜**: 블로그 결함은 글마다 컨텍스트가 달라 batch sub-agent 1개에 N편을 묶으면 결함이 누락된다. 메인이 batch 단위 grep으로 catch 못하는 결함 유형(figure-figcaption 의미 mismatch, sub-agent reasoning leak이 figcaption에 박힘, 여러 글에 동일한 generic placeholder table, 인포그래픽 SAMPLE_DATA placeholder, 본문 이미지 폭 표준 미달 등)은 batch 위임 시 빠진다. 글 1편당 독립 sub-agent라야 catch한다.

**필수 절차**:

1. 대상 글 ID 리스트 확정 (`wp-content/posts/*.md` 전체 또는 결함 의심 후보)
2. 8개씩 cycle: 한 cycle 안에서 sub-agent 8개를 동시에(같은 메시지에 Agent tool 8개 호출) launch
3. 각 sub-agent 프롬프트 필수 포함:
   - 대상 글 pid 1개
   - `wp-content/posts/{pid}.md` 전체 Read 강제
   - 24차원 검사 항목 명시 (empty-figure / alt-figcap-mismatch / alt-fragment / alt-placeholder / figcap-leak / figcap-placeholder / 빈em·orphan p·빈헤딩·빈div·빈ol / footnote 없는 section / anchor URL 깨짐 / 본문 블록 중복 / generic placeholder table / example.com URL / H1 잔존 / sub-agent meta leak / URL encoding 깨짐 / 한자 leak / 수치 불일치 / n8n / 본문↔figure 출처 / blockquote 중첩 / heading 직후 본문 없음)
   - **AI 직접 판단 1차 + audit-*.mjs 병행 + gap 기록** ([audit-script-loop.md](audit-script-loop.md) 정본): AI가 본문·이미지를 직접 판단하고, audit-*.mjs를 병행 실행해 diff를 `tmp/script-gap/{pid}.json`에 기록. 스크립트 점수만으로 통과 결론 금지
   - 산출 경로: `tmp/per-post-audit/{pid}.json`
   - 출력 형식: `{pid, slug, total_figures, defects:[{type, level:high|medium|low, detail, fix}], script_gaps:[...], summary}`
   - 보고 한 줄: `"pid={pid} 결함={N}" 1줄`
4. cycle 완료마다 다음 cycle launch (rate limit 대응: 한 번에 8개 초과 금지)
5. 모든 cycle 종료 후 결과 종합 + 메인이 패턴 분류 → 일괄 fix 또는 글마다 sub-agent fix. **script-gap 취합 → audit-*.mjs 개선 + 수렴 플래그 갱신** (audit-script-loop.md §4)

**금지**:
- ❌ batch sub-agent에 N편 묶어서 위임 (결함 누락·stale 데이터 catch·figcap-leak·empty-figure 등 정밀 결함 오분류 유발)
- ❌ "sample N편만 검증" 식 부분 검사 (live page 검증을 sample로만 하면 표준 미달 글 누락)
- ❌ "audit 점수 100점이면 통과" 식 결론 (audit 자체 사각지대 — dry-run / srcset / 의미적 결함 / 인포그래픽 텍스트 wrap orphan 미검출)

**fix 단계도 동일**: 결함이 있는 글마다 sub-agent 1개씩 띄워서 수정한다. 단순 패턴(orphan p, 빈 em 등)은 메인이 일괄 정규식 fix 후 잔여만 sub-agent.

---

## 후기 작성·감사 전수조사 (후기 1건당 sub-agent 1개 sonnet — CRITICAL)

후기(`src/data/reviews/*.json`)의 작성·자연스러움·100점 검증·누적 분포 감사는 **후기 1건당 sub-agent 1개(sonnet)씩 띄워서 진행**한다. 8개씩 병렬 cycle.

**왜**: 후기 결함은 글마다 컨텍스트가 다르다 — 페르소나×톤×평점×약점×직전 30건 jaccard×SEO 정합 7개 축이 1건마다 독립. batch sub-agent에 N건 묶으면 한 sub-agent가 N건 페르소나·톤 매트릭스를 동시에 평가하면서 미세 정합(persona↔tone↔rating, 자기 노출, AI 티, 부정 위주) 결함이 빠진다. 모델은 sonnet 고정 (`claude-sonnet-4-6`, 정본 `.ai-rules/review-policy.md §6`).

**필수 절차 (write 모드 — `/review write`, `/review auto`)**:

1. 작성할 review 1건 메인이 생성 → audit sub-agent (sonnet) 1개 launch
2. sub-agent 프롬프트 필수 포함:
   - 모델: `claude-sonnet-4-6` (Agent tool `model: "sonnet"`)
   - 대상 review 1건 + 직전 30건 reviewBody + 누적 분포 컨텍스트
   - `.ai-rules/review-policy.md` Read 강제
   - 100점 산식 4 카테고리 평가 (필수 50 + 다양성 25 + 자연스러움 20 + SEO 5)
   - 출력: `{score, byCategory, defects, hint, retry: yes|no}`
3. 100점 미달 시 메인이 hint와 함께 재작성, 최대 3회 시도 (AC-31)
4. 8개 병렬: 메인이 1 cycle에 8건 review를 동시 생성·검증 (Agent tool 8개 호출)

**필수 절차 (audit 모드 — `/review audit`)**:

1. 대상 후기 ID 리스트 확정 (platform/title 또는 `--all`)
2. 8개씩 cycle, 한 cycle 안에서 sub-agent 8개를 동시 launch
3. 각 sub-agent 프롬프트 필수 포함:
   - 모델: `claude-sonnet-4-6` (Agent tool `model: "sonnet"`)
   - 대상 reviewId 1개
   - reviews JSON 전체 Read 강제 + 해당 review 객체 추출
   - `.ai-rules/review-policy.md` Read 강제
   - 검사 차원: persona 매트릭스 적합·톤 일치·평점 분포·약점 누적·자기 노출·AI 티·부정 위주·jaccard·SEO 정합·brand 노출 금지
   - 산출: `tmp/per-review-audit/{reviewId}.json`
   - 한 줄 보고: `"reviewId={id} 점수={N}/100" 1줄`
4. cycle 완료마다 다음 cycle launch
5. 모든 cycle 종료 후 메인이 분포 집계 → 종합 보고

**금지**:
- ❌ batch sub-agent에 N건 묶기 (persona·tone 매트릭스 정합 결함 누락)
- ❌ Sonnet 외 모델 사용 (`.ai-rules/review-policy.md §6` 위반)
- ❌ "누적 통계 통과면 개별 후기 통과" 결론 (단일 후기 SEO·brand 결함 별도 검증 필수)

---

## 페이지 SEO 전수조사 (정적 .astro + 운영 URL 1건당 sub-agent 1개 sonnet — CRITICAL)

페이지 SEO(메타·OG·JSON-LD·canonical·robots·sitemap·H1·schema)는 **정적 `.astro` 파일 1개 = sub-agent 1개 + 운영 URL 1개 = sub-agent 1개**로 진행. 두 축은 분리한다 (정적은 빌드 시점 정합, 운영은 dist+CDN+brotli·gzip+amplify rewrite 반영). 8개씩 병렬 cycle, 모델 sonnet.

**왜**: 페이지 SEO 결함은 페이지마다 다른 컨텍스트 — `pageH1`·`serviceTitle`·`datePublished` prop, FAQ/HowTo schema 유무, dynamic [slug] fallback, og:image 경로 등. batch sub-agent에 N페이지 묶으면 100점 체크리스트 항목 중 페이지별 미세 결함(canonical trailing slash, og:image 절대 URL, schema.org @context 등)이 누락된다. 운영 URL은 dist 빌드 결과 + Amplify rewrite + CloudFront cache까지 반영해야 하므로 정적 .astro 검사로 대체 불가.

**필수 절차 (정적 .astro 검사)**:

1. 대상 `src/pages/**/*.astro` 파일 리스트 확정 (dynamic `[slug].astro`는 대표 instance만 — slug 값 1개로 고정해 sub-agent 위임)
2. 8개씩 cycle, sub-agent 8개 동시 launch (Agent tool `model: "sonnet"`)
3. 각 sub-agent 프롬프트 필수 포함:
   - 대상 `.astro` 파일 경로 1개
   - `.ai-rules/seo-policy.md` Read 강제 (페이지 100점 체크리스트 정본)
   - 파일 + DefaultLayout prop 정합 검증
   - 산출: `tmp/per-page-audit/{slug-or-path}.json` 형식 `{file, score:0~100, checklist:[...], defects:[...]}`
   - 한 줄 보고: `"page={path} 점수={N}/100" 1줄`

**필수 절차 (운영 URL 검사)**:

1. 대상 URL 리스트 확정 (sitemap.xml 또는 `.claude/skills/console-watch/console-catalog.md` 기반)
2. 8개씩 cycle, sub-agent 8개 동시 launch (Agent tool `model: "sonnet"`)
3. 각 sub-agent 프롬프트 필수 포함:
   - 대상 URL 1개
   - `WebFetch` 또는 `curl` 헤더+본문 받아오기
   - `.ai-rules/seo-policy.md` Read 강제
   - 검사 차원: HTTP 200·canonical·meta description·og:image·twitter:image·JSON-LD `@context`·H1 유무·robots noindex·X-Robots-Tag·schema.org type 정합·sitemap lastmod
   - 산출: `tmp/per-url-audit/{url-hash}.json`
   - 한 줄 보고: `"url={url} 점수={N}/100" 1줄`

**금지**:
- ❌ batch sub-agent에 N페이지 묶기 (페이지별 prop 정합 결함 누락)
- ❌ 정적 검사만으로 운영 통과 결론 (Amplify rewrite·CloudFront cache·brotli 미반영)
- ❌ Sonnet 외 모델 사용

---

## 인포그래픽·본문 figure 시각 검증 (이미지 1개당 sub-agent 1개 sonnet — CRITICAL)

본문 이미지(`<img>`/`<figure>`)의 시각 검증은 **이미지 1개당 sub-agent 1개(sonnet)씩** 진행. 모든 종류 포함:

1. **HTML 인포그래픽** (`script/audit-infographic-visual.mjs` 1차 자동 게이트 통과 후 multimodal 재검증)
2. **codex 일러스트** (자동 검사 도구 없음, multimodal이 유일 검증)
3. **matplotlib 차트** (자동 검사 도구 없음, multimodal이 유일 검증)
4. **figcaption ↔ 이미지 내용 mismatch** (AC-룰-2)

8개씩 병렬 cycle, 모델 sonnet.

**왜**: 시각 결함은 이미지마다 컨텍스트가 다르다 — 텍스트 겹침, 폰트 크기, 대비, 출처 라벨, 통계 일치, figcaption 일관성, 금지 색상, footer 로고. batch sub-agent에 N개 이미지 묶으면 multimodal Read attention이 분산되어 미세 결함(축 라벨 깨짐, 인포 텍스트 wrap orphan, codex 인물 단독 등장 등)이 빠진다.

**필수 절차**:

1. 대상 이미지 리스트 확정 (post + figureIdx + imageUrl)
2. 8개씩 cycle, sub-agent 8개 동시 launch (Agent tool `model: "sonnet"`)
3. 각 sub-agent 프롬프트 필수 포함:
   - 대상 이미지 URL 1개 + 종류(infographic-html / codex / matplotlib / screenshot) + 인접 figcaption 1줄
   - HTML 인포그래픽: `script/audit-infographic-visual.mjs --post=<id>` 1차 결과 첨부
   - `.ai-rules/asset-images.md` Read 강제 (§4.8·§4.10 시각 검증 정본)
   - `.ai-rules/infographic-html.md` Read 강제 (인포그래픽 한정)
   - multimodal Read로 이미지 직접 시각 확인 — 텍스트 겹침/라벨/폰트/대비/데이터 일치/출처 일치/figcaption 정합
   - 산출: `tmp/per-image-audit/{postId}-{figureIdx}.json` 형식 `{postId, figureIdx, imageUrl, type, score:0~100, defects:[{rule, severity, detail, fix}]}`
   - 한 줄 보고: `"img={postId}#{figureIdx} 결함={N}" 1줄`

**금지**:
- ❌ batch sub-agent에 N개 이미지 묶기 (multimodal attention 분산 → 미세 결함 누락)
- ❌ 자동 게이트(audit-infographic-visual.mjs) 통과만으로 시각 통과 결론 (wrap orphan / 인물·장면 일러스트 / figcaption mismatch 미검출 사각지대)
- ❌ Sonnet 외 모델 사용

---

## "대상 1개당 sub-agent 1개" 패턴을 쓰는 감사 vs 안 쓰는 감사 (판단 기준 — CRITICAL)

전수조사·감사에서 **무조건 sub-agent를 박지 않는다.** 대상이 여러 개라도 아래 기준으로 판단한다.

**sub-agent 1개당 1대상 (8병렬)을 쓴다 — 대상마다 독립 컨텍스트·판단이 필요할 때**:
- 블로그 글 전수조사 (글마다 본문·결함 컨텍스트 다름)
- 인포그래픽·figure 시각 검증 (이미지마다 multimodal attention 필요)
- 후기 작성·감사 (페르소나×톤×평점 매트릭스 1건마다 독립)
- 페이지 SEO 채점 (`.astro`/운영 URL 1개마다 100점 체크리스트 독립 판단) — `/audit site` Phase 2·3
- 공통점: **판단에 LLM 추론·multimodal·컨텍스트가 1대상마다 필요**. 메인 1개 컨텍스트로 N개를 보면 누락/샘플링됨.

**sub-agent를 쓰지 않는다 — 다음 경우 메인 직접 또는 스크립트가 맞다**:
- **브라우저 MCP 공유 작업** (`/audit`의 a11y·responsive 단계의 `mcp__playwright__browser_*`): 단일 브라우저 인스턴스를 공유하므로 sub-agent 8개가 동시에 navigate하면 충돌. 메인이 순차 navigate가 정답.
- **기계적 검증을 스크립트가 더 잘 하는 경우** (`/audit`의 sitemap 단계의 URL 상태·canonical curl 검증): `script/sitemap-verify-audit.mjs`가 수백 URL을 한 번에 처리. LLM 판단이 필요 없는 단순 HTTP/정규식 검증은 스크립트가 sub-agent보다 빠르고 정확.
- 공통점: **도구가 직렬 자원(브라우저)이거나, 판단이 기계적(스크립트로 충분)**.

→ 점검: "이 감사가 대상마다 LLM 추론·multimodal·독립 컨텍스트를 요구하는가?" YES면 sub-agent, NO(브라우저 공유/스크립트 충분)면 메인·스크립트. `/audit`의 site 단계만 SEO 채점이라 sub-agent를 쓰고, a11y·responsive·sitemap 단계는 도구 특성상 안 쓴다.

---

## 서브에이전트 활용 (분류 단계에서만)

Phase 5에서 분류 항목이 50건 이상일 때 서브에이전트에게 **분류만** 위임 가능. 프롬프트에 다음을 반드시 포함한다.

```
아래 [파일:라인 또는 leaf 매핑 tsv 전체]를 Read로 직접 읽고, 각각 [분류 기준]으로 분류해라.
- 추측 금지. 본문을 읽고 boolean 조합·블록 범위를 그대로 보고할 것.
- 함수명만 보고 동작 추론하지 말 것.
- hits ≥ 1이라도 자동 "사용 중" 판정 금지. 매칭 라인 ±5 컨텍스트를 Read해서:
  - 응답 파싱(response.data.key/JSON.parse) → 사용 중
  - 요청 body/docstring/주석/이름충돌/외부SDK → 미사용
  중 어디인지 분류해서 보고할 것.
- snake_case가 0건이면 camelCase도 grep해서 둘 다 0인지 확정.
- 결과는 "endpoint | model | field | hits_snake | hits_camel | 컨텍스트 | 판정" 형식.
```

**계약 정합성형 위임 시**: Phase 1.5에서 만든 `tmp/survey-<topic>-mapping.tsv` **전체**를 첨부한다. 부분집합 위임 금지.

집계·역방향 조사·정합성 판단·요청/응답 분리는 메인 에이전트가 직접 수행한다.

---

## 메인 에이전트 검증 의무

- 서브에이전트 결과를 그대로 사용자에게 전달하지 않는다. 핵심 주장은 직접 코드를 Read로 검증한 후 보고.
- 추측 기반 결과("아마 ~", "일반적으로 ~")는 거부하고 재조사.
- 비교 분석 시 양쪽 코드 모두 직접 검증. 한쪽만 보고 다른 쪽을 추측으로 대비시키지 말 것.
- **sub-agent가 "사용 중"으로 판정한 항목 중 핵심 의심 행(hits 1~5건, 도메인이 다른 파일에서 매칭, docstring 위주 매칭)은 메인이 직접 컨텍스트 grep + Read로 재검증**.
- **계약 정합성형 보고 전 자기 검증**: Phase 1.5 매핑 tsv의 모든 행이 보고서에 등장하는지 `wc -l`로 비교.

---

## 경로 규칙 (snshelp-astro 프로젝트)

- 페이지: `src/pages/`
- 레이아웃: `src/layouts/`
- 위젯/컴포넌트: `src/widgets/`, `src/shared/`
- 스타일: `src/styles/`
- 에셋: `src/assets/`, `public/`
- 스크립트: `script/`
- WP 데이터: `wp-content/`

조사 결과 파일: `tmp/survey-<topic>.txt` (gitignore 됨).
