# 인포그래픽 HTML 생성 규칙

인포그래픽 HTML 작성 및 렌더링 시 반드시 따를 규칙. 반복 사고 패턴을 차단하기 위한 체크리스트 포함.

---

## 1. 로고 경로 규칙 (CRITICAL — 가장 자주 실수하는 부분)

### 1.1 로고 정본 위치 — asset-images.md §4.10.3 단일 정본

**로고 자산 정본 위치**: `wp-content/illustrations/snshelp-logo.webp`
**정본 룰**: `.ai-rules/asset-images.md §4.10.3 "Footer 로고 (정본, 모든 템플릿 공통)"`. 본 문서는 cross-link이며 변경 시 asset-images.md를 단일 정본으로 갱신한다.

(`illustrations/` 디렉토리는 프로젝트 루트에 **없음**. 항상 `wp-content/illustrations/` 경로로 접근)

### 1.2 HTML이 `wp-content/drafts/images/{slug}/infographic.html`인 경우 — 이게 99% 케이스

**유일하게 허용되는 패턴 (외워서 그대로 박을 것):**
```html
<img src="../../../illustrations/snshelp-logo.webp" alt="snshelp 로고" class="h-7 w-auto"/>
```

**왜 `../../../`인가**:
- 시작: `wp-content/drafts/images/{slug}/`
- `../` → `wp-content/drafts/images/`
- `../../` → `wp-content/drafts/`
- `../../../` → `wp-content/`  ← 여기서 `illustrations/snshelp-logo.webp` 찾음 ✓

### 1.3 절대 금지 패턴 — 시각 검증해도 안 보이고 logo만 깨짐

| 잘못된 패턴 | 왜 안 됨 |
|---|---|
| `../../wp-content/illustrations/snshelp-logo.webp` | `../../` = `wp-content/drafts/` → 거기에 `wp-content/illustrations/` 찾음 → **존재 안 함** |
| `../../../wp-content/illustrations/snshelp-logo.webp` | `../../../` = `wp-content/` → 거기에 `wp-content/illustrations/` 찾음 → **존재 안 함** |
| `/illustrations/snshelp-logo.webp` (absolute) | webp 렌더링 시 file:// 환경에서 root는 디스크 루트라 깨짐 |
| `wp-content/illustrations/snshelp-logo.webp` (no `../`) | HTML 위치 기준 상대경로라 `wp-content/drafts/images/{slug}/wp-content/...` 찾음 |
| `file:///Users/go/.../snshelp-logo.webp` | Chrome Puppeteer가 크로스디렉토리 차단 + 사용자 환경별 다른 path |

### 1.4 검증 명령 (HTML 작성 후 반드시 실행)
```bash
# 정확한 path 사용 여부 확인
node script/audit-infographic-visual.mjs --post=<id>
# 또는 직접 ls로 검증
ls wp-content/drafts/images/<slug>/../../../illustrations/snshelp-logo.webp
```

### 1.5 스크립트에서 동적으로 `/tmp/` 또는 `script/infographic-templates/` 등에 HTML 생성하는 경우

`/tmp/` 또는 임시 경로에 HTML 작성 후 render-infographic.mjs로 렌더링 시 상대경로 작동 안 함 (Chrome 보안 정책 + 크로스디렉토리 차단). 본문 인포그래픽 31종 신규 템플릿(`script/infographic-templates/*.html`)도 같은 룰을 적용한다 — 템플릿 파일은 `script/` 하위에 있어 `wp-content/illustrations/`를 상대 경로로 참조하기 어렵다. **반드시 base64 인라인**:

```javascript
// 스크립트 최상단
import fs from 'fs';
const _logoData = fs.readFileSync('wp-content/illustrations/snshelp-logo.webp');
const LOGO_URL = `data:image/webp;base64,${_logoData.toString('base64')}`;

// 사용: <img src="${LOGO_URL}" alt="snshelp 로고" ...>
```

본문 인포그래픽 카탈로그(`script/infographic-templates/`) 31종은 렌더 스크립트(`render-infographic.mjs`)가 HTML 로드 직전 base64 인라인 치환을 수행한다. 템플릿 HTML에는 `<!-- LOGO_PLACEHOLDER -->` 마커 또는 정본 base64 키 사용. 로고 자산 정본 위치는 §1.1.

---

## 2. 배포 전 시각적 검증 (MANDATORY — 절대 생략 금지)

배치 실행 전 반드시 1개 샘플을 렌더링하고 **Read 도구로 webp 파일을 직접 열어서 눈으로 확인**한다.
`[OK]` 로그 = S3 업로드 성공일 뿐, 이미지 내용이 올바르다는 의미가 아니다.

```
1. 배치 실행 전: 1개 테스트 렌더링
   # 본문 인포그래픽 정본 폭은 1200px — render-infographic.mjs 기본값
   node script/render-infographic.mjs "/tmp/test.html" "/tmp/test.webp" --width=1200 --bg=#F8FAFC
   # HTML <main class="w-[1200px]..."> 와 --width=1200 폭 일치 필수
   # 다른 폭(예: 1600 hero, 800 보조)이라면 --width 를 main 컨테이너 px에 맞춰 명시
   # → 렌더 후 "⚠ 폭 불일치" 경고가 뜨면 --width 를 main 컨테이너 px에 맞춰 수정

2. Read 도구로 1x dim PNG 미리 렌더 결과를 직접 확인 (운영 webp는 2x dim이라 Read 한계 초과 가능, asset-images §4.10.4):
   - 로고 보이는가?
   - 텍스트 색상 진한가?
   - 폰트 크기 읽기 충분한가?
   - 레이아웃 깨진 곳 없는가?
   - 좌우에 배경색 여백이 있는가? → 있으면 --width 불일치
   - **`<main class="w-[Npx]">`의 N과 `--width=N` 인자가 일치하는가? 불일치 시 viewport 클리핑 또는 여백 발생**

3. 이상 없으면 배치 실행
```

---

## 3. 렌더 전 HTML 검증 체크리스트 (CRITICAL)

스크립트에서 `render-infographic.mjs`를 호출하기 전, 생성된 HTML에 대해 반드시 확인:

### 경로/구조
- [ ] `src=` 속성에 `../` 상대경로가 있는가? → `/tmp/` 또는 `script/infographic-templates/` 렌더링 시 반드시 base64 인라인(§1.5)으로 치환
- [ ] `<img>` 태그의 `alt` 속성이 비어있지 않은가?
- [ ] Tailwind CDN + Pretendard 폰트 로드 태그가 있는가?
- [ ] `<body style="background:...">` 배경 색상이 명시되어 있는가? (렌더러 `--bg=` 인자 추출 기준)
- [ ] 컨테이너 너비·높이 정본 확인:
  - **본문 인포그래픽**: `w-[1200px]` + 가변 높이(콘텐츠 fit, 고정 비율 아님, **모바일 정본 — CRITICAL**). 렌더: `--width=1200 --max-height=2000`. helpsns.com 트래픽 90%+가 모바일이라 모바일 viewport(390px)에서 native 폰트가 본문 16px와 동등 이상으로 보이도록 폰트 floor 상향(§4.3.2).
  - **Hero**: `w-[1200px] h-[675px]` (16:9, SNS 카드·og:image 표준 유지). 렌더: `--width=1200`.
  - 다른 폭 사용 시 viewport 불일치로 여백·클리핑 발생. asset-images §4.10.1 정합.

### 폰트 크기
- [ ] `font-size: 10px`, `font-size: 11px`, `font-size: 12px` 가 있는가? → 13px/14px 이상
- [ ] `text-[10px]`, `text-[11px]`, `text-[12px]` Tailwind 클래스가 있는가? → `text-[13px]`/`text-[14px]`

### 색상 대비 (WCAG AA — a11y 필수)
- [ ] **글자 색상에 알파 사용 금지** — 보조 텍스트를 흐릿하게 깔보내려는 디자인 의도가 저DPR 디스플레이·모바일에서 가독성 파괴
  - `color: rgba(R,G,B,X)` 금지 → 명시적 hex(`#FFFFFF`, `#000000`, `#FCA5A5` 등) 또는 alpha 없는 `rgb()`
  - Tailwind `text-white/N`, `text-black/N` 금지 → `text-white`, `text-black`
  - 텍스트 요소의 `opacity-60|70|80|90` 클래스 금지 → 클래스에서 제거
  - 텍스트 요소의 inline `style="opacity:0.6~0.9"` 금지 → 인라인 style에서 토큰만 제거
  - **허용**: 배경·테두리 알파(`background:rgba(...)`, `border:rgba(...)`)와 절대 위치 장식 요소의 `opacity-10|15|20` (워터마크 이모지 등)
  - **자동 차단**: `audit-infographic-visual.mjs`의 `text-alpha-banned` 룰
- [ ] `text-gray-400` / `text-slate-400` / `text-zinc-400` 사용하는가? → **절대 금지**, `text-gray-700` 이상 사용
- [ ] `text-gray-500` / `text-slate-500` 을 13px 이하 텍스트에 사용하는가? → `text-gray-700`으로 교체
- [ ] `color: #9CA3AF` (gray-400) / `color: #94A3B8` (slate-400) 등 하드코딩 저대비 색상? → `#374151` 이상

### WCAG AA 대비비 기준 (13-14px 일반 텍스트 → 4.5:1 이상 필요)
| Tailwind 클래스 | 흰 배경 대비비 | 판정 |
|---|---|---|
| text-gray-400 (#9CA3AF) | 2.5:1 | ❌ 불합격 |
| text-gray-500 (#6B7280) | 4.6:1 | ⚠️ 아슬아슬 (쓰지 말 것) |
| text-gray-600 (#4B5563) | 7.5:1 | ✅ 합격 |
| text-gray-700 (#374151) | 10.7:1 | ✅ 합격 |

---

## 4. 스타일 최소 기준 (본문 1200폭 가변높이 / hero 1200x675 정본)

본문 인포그래픽 정본 폭이 **1200px** 이고 모바일 viewport(390px)에서 native 폰트가 본문 16-18px와 동등 이상으로 보이도록 폰트 floor 상향. helpsns.com 트래픽 90%+ 모바일. asset-images §4.10.1 폰트 표준과 정합.

**모바일 환산 비율**: 1200px → 390px viewport = 0.325x. 인포 안 폰트를 모바일 native px로 환산하려면 0.325 곱하면 됨.

| 항목 | 최솟값 / 권장 (인포 안) | 모바일 native 환산 (0.325x) | 비고 |
|---|---|---|---|
| H1 / 메인 타이틀 | `80-110px` | 26-36px | font-black, line-height 1.1 |
| H2 / 섹션 제목 | `56-72px` | 18-23px | font-bold |
| H3 / 카드 타이틀 | `48-60px` | 16-20px | font-bold |
| 본문 / 카드 텍스트 | `40-50px` (권장 출발점) | **13-16px** (본문 default와 동등) | **글마다 조정 가능** — 텍스트 양 많으면 낮춰서 줄바꿈·잘림 해소. 가독되면 OK (고정 강제 아님, §4.3.2 우선순위) |
| label / chip / 보조 | `30-38px` | 10-12px | tracking-widest 권장 |
| stat-value (큰 숫자 강조) | `100-140px` | 33-46px | font-black + 단위는 50% 작게 |
| stat label | `30-38px` | 10-12px | 숫자 위/아래 |
| 흰색 텍스트 투명도 | `≥ 0.85` (배경 다크) / 0 (라이트) | — | `text-white/85` 미만 금지 |
| 컬러 텍스트 | 명시적 hex (`#0A0A0A`, `#374151` 등) | — | `rgba` 저투명도 대신 |

**Hero 인포그래픽 (1200x675, 16:9 유지)**: og:image / Twitter Card / SNS 공유 표준이라 16:9 유지. 폰트 표는 별도 적용 (현재 hero 템플릿 폰트 그대로). Hero 본문 텍스트는 **§4.7 ellipsis 금지 룰** 별도 적용.

### 4.1 텍스트 글자수 한계 (AC-룰-6 정본)

`audit-infographic-visual.mjs`가 자동 검증하는 글자수 한계. 위반 시 `risk:medium` 또는 `risk:high`.

| 항목 | 글자수 한계 | 비고 |
|---|---|---|
| 헤드라인 (H1·메인 타이틀) | **6-28자** | 의미 단위 `<br>` 명시 |
| 섹션 제목 / 카드 타이틀 | **4-20자** | 명사구 또는 동사형 종결 |
| stat-value (큰 숫자) | **≤ 8자** | 단위 포함 (예: "1,874억 원" OK) |
| stat label | **4-14자** | 명사구 |
| 카드 본문 텍스트 | **≤ 60자/카드** | 같은 grid 안 카드 간 길이 편차 ≤ 평균의 40% (§5 라인브레이크 균형 룰) |
| figcaption | **≤ 120자** | 1-2문장, 출처 형식은 §6 검증 |

### 4.2 금지 어휘 사전 (AC-룰-6 정본)

`audit-infographic-visual.mjs --update-dictionary` 옵션으로 갱신 가능한 사전. 발견 시 `risk:high`.

- 과장: "이른바", "무려", "엄청난", "혁명적"
- 책임 회피·과대 약속: "100% 보장", "확실한 수익", "노력 없이", "쉽게 돈벌기"
- 자동·수동 표현 모호화: "자동 적립", "자동 누적", "자동 수익"
- 풀이 없는 외래어/약어: ROI / CAC / LTV / 객단가 / affiliate (인포그래픽 안 직접 노출 금지, 본문에서 풀어서 설명 후 인용)

seo-policy §1.8.1 정본 룰을 인포그래픽 텍스트 검증 범위로 확장한다.

---

## 4.3. 모바일 viewport 가독성 (MANDATORY — 트래픽 90%+ 모바일)

helpsns.com 실측 트래픽 비중이 모바일 90%+ 이므로 모든 본문 인포그래픽은 **모바일 viewport(360-430px)에서 텍스트 가독성**을 최우선 기준으로 설계한다.

### 4.3.1 단일 자산 정본 (`<picture>` 금지)

- **본문 인포그래픽 = 1200 폭 + 가변 높이 단일 webp**. `<picture>` 듀얼 자산 금지 (관리 비용 ↑, 자산 sync 결함 위험)
- 폭은 항상 1200px 정본. 높이는 **콘텐츠 길이에 맞춤** (고정 비율 금지 → 콘텐츠보다 길면 빈 여백 발생)
- main 컨테이너에 `h-[Npx]` 고정 + `mt-auto` 푸터 패턴 절대 금지. 콘텐츠 자연 흐름 → 푸터가 콘텐츠 바로 다음에 위치
- 렌더 옵션: `--width=1200 --max-height=2000` (콘텐츠 길이가 이를 초과하면 자동 trim. 초과 안 하면 빈 공간 없이 trim)
- Hero만 16:9 (1200x675) 유지 (SNS 공유 카드 표준)
- 본문 인포그래픽은 16:9·고정 비율(1200x675·1024x576 등)이 아닌 1200 폭 + 가변 높이로만 만든다

### 4.3.2 모바일 viewport 환산 폰트 검증 (CRITICAL — 본문 16px와 동등 이상)

본문 인포그래픽 1200폭이 모바일 viewport 390px(iPhone 13 기준)에 표시되면 약 32% 축소(390/1200≈0.325). 인포 안 폰트가 실제 모바일 디스플레이에서 몇 px로 보이는지:

| 인포 안 폰트 | 모바일 390px viewport 환산 (0.325x) | 가독성 판정 |
|---|---|---|
| 16px | 5.2px | ❌ 안 보임 |
| 22px | 7.2px | ❌ 본문보다 작음 |
| 26px | 8.5px | ❌ 본문보다 작음 |
| 32px | 10.4px | ⚠️ 본문보다 작음 |
| 40px | 13.0px | ✅ 최소 합격 (본문 16px 근접) |
| 44px | 14.3px | ✅ 본문과 동등 |
| 50px | 16.3px | ✅ 권장 |
| 56px | 18.2px | ✅ 카드 타이틀 |
| 88px | 28.6px | ✅ 헤드라인 |

**핵심 룰 (우선순위 — CRITICAL)**: 인포그래픽 안 텍스트는 모바일에서 읽히면서도 **줄바꿈·잘림·과잉여백이 없어야** 한다. 글마다 텍스트 양이 다르므로 **폰트는 고정값으로 강제하지 않는다.**

**우선순위 (위에서부터)**:
1. **내용 유지** — 텍스트를 깎아서 폰트를 맞추지 않는다 (긴 글은 긴 대로 다 담는다)
2. **세로 높이 가변** — 컨테이너 height를 콘텐츠에 fit. `main h-[Npx]` 같은 고정 height 금지 (하단 여백·잘림 원인)
3. **폰트는 가독 범위에서 글마다 조정** — 위 1·2를 지키면서 모바일 가독 하한을 넘기게 폰트를 그 글에 맞춰 정한다

**가독 하한 (권장 — 고정 강제 아님)**:
- 본문/카드 텍스트: 모바일 환산 ≥ 14px (인포 40px대). 표·정보 밀도 높은 글은 더 낮춰도 가독되면 OK
- label/chip/보조: 30px대 (본문보다 작은 위계)
- **긴 텍스트가 컨테이너를 넘쳐 줄바꿈(한두 글자 orphan)·잘림이 나면, 폰트를 그 글에 맞게 낮추거나 폭을 넓혀 해소한다.** "44px 무조건"으로 강제해 넘치게 두는 것이 금지 (이게 widow·잘림의 근본 원인).
- 한 인포그래픽에 정보가 너무 많아 어떤 폰트로도 모바일 과밀이면, **폰트를 낮추기 전에 정보량 자체를 줄인다**(예: 카드 5개→3개, §4.3.3 정보 밀도 룰).

### 4.3.3 정보 밀도 룰 (한 화면 = 핵심 1개)

세로로 긴 인포그래픽은 모바일 viewport에서 여러 스크롤로 나뉜다. 사용자가 한 번에 보는 첫 화면(상단 약 1/3) 안에 **반드시 메인 메시지가 들어가야** scroll 시작 동기 유발.

- 1200폭 가변높이 안에서 vertical zone 분할(높이 비율 기준): 상단 hook → main → detail → summary·로고 순서
- 한 zone 안 메시지 1개 한정. zone 간 점프 화살표(▼ 또는 step indicator) 권장

### 4.3.4 카드 stack 규칙

- 카드 N개 정렬: **수직 stack 단일 열**(`grid-cols-1`)이 모바일 정본. 가로 multi-column 금지
- 단 카드 3개 이하 + stat-value(큰 숫자) 비교: `grid-cols-2` 또는 `grid-cols-3` 허용. 단 카드 안 본문 텍스트 ≤ 4단어
- §4.5 카드 그리드 패턴은 hero·예외 케이스 한정

### 4.3.5 자동 게이트

`script/audit-infographic-visual.mjs` 추가 검사 룰 (예정):
- `aspect-ratio-non-mobile` — 본문 인포그래픽 폭이 1200 아니면 `risk:high` -15
- `font-below-mobile-floor` — **참고 신호로만**(고정 감점 아님). 폰트가 낮아도 줄바꿈·잘림 없이 모바일에서 읽히면 정상(글마다 다름). 자동 게이트는 "너무 작아 안 읽힘"(모바일 환산 10px 미만 등 극단) 경고만. 폰트 크기를 floor로 hard 감점하지 않는다 — 최종 판정은 AI multimodal Read (§4.0.1 5번)
- `card-multi-column-mobile` — 본문 인포그래픽에 `grid-cols-2` 이상 + 카드 본문 ≥ 5단어 검출 시 `risk:high` -15

---

## 4.5. 카드 그리드 패턴 (모바일 우선 — CRITICAL)

helpsns.com 트래픽 90%+ 모바일. **한 줄에 카드를 많이 넣으면 모바일에서 과밀·텍스트 깨짐**(네가 본 "한 줄 5개" 문제). §4.3.4 "수직 stack 단일 열이 모바일 정본"이 우선이다.

### 규칙 (모바일 우선 정본)
- **기본은 1열 수직 stack**(`grid-cols-1`) 또는 **2열**까지. 카드 본문에 문장(≥ 5단어)이 있으면 **1열 강제**.
- **3열 이상은 카드 본문이 매우 짧을 때만**(stat-value 숫자 비교, 라벨 1-2단어). 5열·6열처럼 한 줄에 정보 많이 넣기 **금지**.
- 카드/항목 수가 많으면(예: 10개 기능) **세로로 쌓거나 2열 그리드로 분배**한다 — 한 줄에 5개 늘어놓지 말 것.
- **정보가 한 인포그래픽에 너무 많으면 폰트·열을 욱여넣기 전에 정보량을 줄이거나 인포그래픽을 나눈다**(§4.3.3 한 화면 핵심 1개).
- `flex flex-wrap` 금지(마지막 줄 짝 안 맞음) — `grid grid-cols-N` 사용하되 위 모바일 열 수 제한을 지킨다.

### 표(table) — 모바일 가로 스크롤·잘림 금지 (CRITICAL)
인포그래픽·본문 안 표가 모바일 폭을 넘으면 **잘려서 안 보인다**(네가 본 "표 좌우 스크롤 안 돼 잘림"). 표는:
- **인포그래픽 안에서는 표를 쓰지 말고 카드/막대 비교로 재구성**(표는 모바일에서 가로 스크롤이 안 되거나 잘림). 부득이 표면 열 수를 모바일에 맞게 줄인다(3-4열 이내).
- **본문 HTML 표**(인포그래픽 아닌 글 본문)는 반드시 `<div class="overflow-x-auto">`로 감싸 가로 스크롤 가능하게 한다. 감싸지 않으면 모바일에서 잘림.

### 예시
```html
<!-- ❌ 잘못: 4 카드 + flex-wrap → 마지막 1개 떨어짐 -->
<div class="flex flex-wrap gap-3">
  <div class="rounded-2xl ...">카드 1</div>
  <div class="rounded-2xl ...">카드 2</div>
  <div class="rounded-2xl ...">카드 3</div>
  <div class="rounded-2xl ...">카드 4</div>
</div>

<!-- ✅ 올바름: 4 카드 → grid-cols-4 (또는 2x2) -->
<div class="grid grid-cols-4 gap-3">
  ...4 cards
</div>
<!-- 또는 -->
<div class="grid grid-cols-2 gap-3">
  ...4 cards in 2x2
</div>
```

---

## 4.0.0. 블로그 인포 전수조사 메타 누적 시스템 (MANDATORY — 시스템 자가 학습)

블로그 인포그래픽 작업·전수조사 중 AI(메인 + sub-agent)가 발견한 **메타 인사이트**(반복 패턴 / 잘못된 룰 / 사각지대 / 신규 템플릿 후보)를 그때그때 누적 → 작업 종료 후 메인이 종합 검토 → **이 정본 / 인포 템플릿 / `script/audit-infographic-visual.mjs`를 일괄 업데이트**한다.

이 시스템 없으면 한 번 작업 끝나도 정본·도구는 그대로 → 다음 작업 때 같은 결함 반복 발견 → 사용자가 매번 같은 지적. 시스템이 작업하면서 자가 진화해야 한다.

### 누적 경로

```
tmp/survey-insights/blog-infographic/{TS}/
  ├─ template-candidates.md      신규 인포 템플릿 후보 (반복 사용 패턴 → script/infographic-templates/ 추가 후보)
  ├─ audit-script-issues.md      audit-infographic-visual.mjs 룰 오류 (false positive / false negative)
  ├─ rule-gaps.md                .ai-rules/infographic-html.md / asset-images.md 사각지대
  ├─ pattern-frequency.md        결함 패턴 빈도 (N편 반복 → 코드/룰 자동 차단 후보)
  └─ design-decisions.md         사용자 의도 vs AI 해석 불일치 (도넛 → progress bar 같은 변경 사고)
```

`{TS}`는 작업 시작 시각 (YYYYMMDD-HHMMSS).

### 누적 항목 작성 형식

각 항목은 Markdown bullet으로 누적. AI(메인 또는 sub-agent)가 작업 중 발견 즉시 append.

예시:
```markdown
## template-candidates.md

- **유튜브 알고리즘 도넛 3대 지표** — 2026-05-29 / post-419 figure[4/5]
  - 패턴: 도넛 SVG (stroke-dasharray) + % 텍스트 + 라벨 + 출처
  - 재사용 가능성: 알고리즘 합격선 SNS 플랫폼별 N편 반복
  - 권장: `script/infographic-templates/donut-3metrics.html`

## audit-script-issues.md

- **detectMobileReadability 폰트 floor 26px** — 사고 후 44px 상향
  - 모바일 환산 9.4px → 본문 16px보다 작음
  - 정본 §4.3.2 갱신 완료 / audit-mjs `detectFontBelowMobileFloor` 신설

## design-decisions.md

- **도넛 → progress bar 변경 사고** — 사용자 의도 어긋남
  - 사용자: "도넛 유지 + % 명시"
  - AI: "차트 데이터 명시 = progress bar 변경"
  - 학습: 디자인 형태 변경은 1줄 사전 확인 (§4.0.3에 룰화)
```

### 종합 검토 절차 (작업 종료 후 필수)

1. **누적 자료 통합**: `tmp/survey-insights/blog-infographic/{TS}/*.md` 5개 메인이 Read
2. **분류 → 일괄 patch**:
   - 정본 룰 → `.ai-rules/infographic-html.md` / `asset-images.md` 편집
   - 신규 인포 템플릿 → `script/infographic-templates/` 추가 + `schema.json` 페어
   - audit-mjs 룰 → `script/audit-infographic-visual.mjs` 편집
   - 코드 게이트 → `script/render-infographic.mjs` / `script/wp-publish-new.mjs` 등 추가
3. **종합 보고**: `tmp/blog-infographic-{TS}-meta-report.md` (인사이트 + 적용 patch 요약)
4. **사용자 승인 후 commit**: 정본/템플릿/audit-mjs 변경은 한 commit으로 묶음

### Sub-agent 위임 시 메타 누적 의무 (블로그 인포 작업 한정)

블로그 인포 작업 sub-agent 프롬프트에 다음 강제 포함:

```
작업 중 발견한 메타 인사이트는 즉시 다음 파일에 append:
- 신규 템플릿 후보: tmp/survey-insights/blog-infographic/{TS}/template-candidates.md
- audit-mjs 룰 오류: tmp/survey-insights/blog-infographic/{TS}/audit-script-issues.md
- 정본 룰 사각지대: tmp/survey-insights/blog-infographic/{TS}/rule-gaps.md
- 결함 패턴 빈도: tmp/survey-insights/blog-infographic/{TS}/pattern-frequency.md
- 디자인 변경 사고: tmp/survey-insights/blog-infographic/{TS}/design-decisions.md

발견 즉시 append. 작업 끝까지 미루지 말 것.
```

---

## 4.0. AI 작업 흐름 자가 검증 체크리스트 (MANDATORY — CRITICAL)

AI가 인포그래픽 HTML 작성·수정·렌더 시 **렌더 직후 webp를 Read tool로 직접 시각 확인 + 아래 체크리스트 전부 통과해야** 사용자에게 보고 가능. 통과 못하면 자가 수정 → 재렌더 → 재검증 무한 반복. 사용자가 검증자 역할 하게 만들지 말 것.

**자동 게이트(`audit-infographic-visual.mjs`)는 cron·일괄 채점 용도이고, 시각·의미 결함(widow·빈 여백·차트 데이터·% 누락)은 정적 분석으로 못 잡음. AI multimodal Read가 유일한 검증 경로.**

### 4.0.1 렌더 후 자가 검증 체크리스트 (8개 항목)

| # | 항목 | 검증 방법 | 위반 시 fix |
|---|---|---|---|
| 1 | webp Read로 시각 확인 (DPR=1 렌더 사용해야 한 변 < 2000 → Read 가능) | `RENDER_DPR=1 node script/render-infographic.mjs ...` | DPR=2 webp는 Read 못함 — DPR=1로 검증용 임시 webp 따로 생성 |
| 2 | **widow/orphan** — H1/H2/H3/li 마지막 줄에 3글자 이하 단독 남음 없음 | webp 시각 확인 | 명시 `<br>` 의미 단위 삽입, 폰트 약간 축소, 문구 단축 |
| 3 | **빈 여백** — 콘텐츠 끝 ~ 푸터 사이 빈 공간 없음 (콘텐츠 짧으면 trim 자동) | webp 시각 + main에 `h-[Npx]` + `mt-auto` 패턴 검출 | main `h-[Npx]` 제거 → 콘텐츠 fit, mt-auto 제거 → 푸터가 콘텐츠 바로 따라옴 |
| 4 | **차트 데이터 명시** — bar/donut/pie 라벨에 실제 값 + 단위 + % | webp 시각 + 라벨 의미 확인 | normalized 값(100/100) 금지, 도넛 segment에 % 명시 필수 |
| 5 | **폰트 — 글마다 개별 조정 (고정 floor 금지)** — 텍스트 양·컨테이너 폭에 맞춰 글마다 다른 크기. 가독 하한선만 권장(본문 모바일 환산 ≥ 14px ≈ 인포 40px대, label ≈ 30px대), 단 **고정값 강제 아님** | webp 시각 (줄바꿈·잘림 없이 한 줄/의도된 줄에 들어가는지 + 모바일에서 읽히는지) | **우선순위: ① 내용 유지(텍스트 깎지 않음) ② 세로 높이 가변(컨테이너 콘텐츠 fit) ③ 폰트를 가독 범위에서 글마다 조정.** 긴 텍스트면 폰트를 그 글에 맞게 낮추거나 폭을 넓혀 줄바꿈 해소 — "44px 무조건"으로 강제해 넘치게 하지 말 것 |
| 6 | **Hero ellipsis 없음** — `...` 또는 `…`로 핵심 정보 잘림 없음 | webp 시각 + HTML 텍스트 길이 | 부제 단축 (60자 이내), `text-overflow:ellipsis` 제거 |
| 7 | **figcaption ↔ 차트 데이터 정합** — 본문 figcaption의 수치가 차트 안에 동일 표기 | webp 시각 + figcaption 비교 | 차트 라벨을 figcaption 수치와 일치하게 수정 |
| 8 | **모바일 한 화면 핵심 메시지** — webp 첫 1/3 (모바일 viewport 첫 화면) 안에 핵심 메시지 포함 | webp 시각 (상단 영역) | 헤더에 핵심 메시지 배치, decorate 요소는 하단으로 |

### 4.0.2 사용자 보고 절차

```
[메인이 인포 작업 흐름]
1. HTML 작성
2. 렌더 (--width=1200 --max-height=2000 DPR=2 운영용)
3. 검증용 임시 렌더 (RENDER_DPR=1 /tmp/check.webp)
4. Read tool로 webp 시각 확인
5. 8개 체크리스트 자가 적용 — 위반 0개 ?
   - NO: HTML 수정 → 2번부터 반복
   - YES: 다음 단계
6. S3 업로드 + CF 무효화
7. 사용자에게 결과 보고
```

**금지**:
- ❌ 렌더 결과 webp 확인 안 하고 사용자에게 보고 (시각 결함 미발견)
- ❌ "사용자 의도 확인 부탁" 식으로 검증을 사용자에게 위임 (디자인 변경, 도넛 vs progress bar 같은 의도 결정은 사전에 묻기)
- ❌ "audit script 통과했으니 OK" — 정적 분석이 시각·의미 결함은 못 잡음
- ❌ 자가 검증 1회만 — 위반 발견 시 fix → 재렌더 → 재검증을 위반 0개까지 반복

### 4.0.3 디자인 변경 사전 확인 의무

옛 자산을 다른 형태로 변경(도넛 → progress bar / 가로 → 세로 / 일러스트 → 텍스트)할 때 사용자에게 1줄 사전 확인:
- "기존 [A 형태] 유지 vs [B 형태] 변경 중 어느 쪽?"
- 의도가 명확히 드러난 사용자 요청이 없으면 **기존 시각 형태 유지**가 default

---

## 4.4. 차트 시각화 데이터 명시 (MANDATORY — CRITICAL)

bar / pie / donut / line / radar 등 데이터 시각화 차트 안에 **실제 수치 + 단위 + (필요 시) 비율을 명시적으로 표기**한다. normalized 값(예: "100 vs 100")이나 segment에 % 누락 등 의미 없는 표기 절대 금지.

### 4.4.1 룰

- **bar chart**: 막대 위/안에 **실제 값 + 단위** 라벨 (예: "700억", "1.2만", "5%"). normalized 값(100/100 등) 금지
- **donut/pie chart**: 각 segment에 **이름 + 비율 %** 명시 (예: "CTR 10%"). 이름만/% 누락 금지
- **line chart**: x축 라벨 + y축 단위 + 핵심 변곡점 값 라벨
- **radar chart**: 각 축에 비율 + 단위
- 데이터 출처는 figcaption 또는 차트 하단 footer에 "출처: XXX 2024" 형태로 명시
- 동일 데이터를 두 번 표시 금지(예: 도넛 + 그 옆 막대로 같은 값)

### 4.4.2 자동 게이트

`script/audit-infographic-visual.mjs` 추가 검사 룰 (예정):
- `chart-normalized-label` — 차트 라벨이 100/100 / 50/50 등 동일 normalized 값 검출 시 `risk:high` -15
- `chart-percent-missing-donut` — donut/pie chart segment에 % 표기 누락 검출 시 `risk:high` -15
- `chart-axis-label-missing` — line/bar chart에 x/y축 라벨 누락 검출 시 `risk:medium` -10

### 4.4.3 위반 패턴 (금지 예시)

- 비교 차트에 normalized 값("100 vs 100" 등)만 표시하면 안 된다 → 차트만 봐서는 실제 데이터 의미를 알 수 없다. figcaption의 실제 수치(예: "700억 조회·2.5배 참여율")와 차트 시각이 분리되면 정보 가치가 0이다. **차트는 반드시 figcaption 데이터와 1:1 정합**.
- 도넛/파이 차트에 segment 이름만 적고 % 표기를 누락하면 안 된다 → 각 segment가 몇 %인지 알 수 없고 figcaption 수치(예: "CTR 10%·시청 유지율 50%·평균 시청률 70%")와 정합이 깨진다.

---

## 4.7. Hero 본문 텍스트 ellipsis 금지 (MANDATORY)

Hero (1200x675) 본문 텍스트 영역에 `text-overflow: ellipsis` 또는 `-webkit-line-clamp`로 텍스트가 **`...`로 짤려서 핵심 정보가 손실되는 패턴 금지**. 디자인 의도(짧은 hook)라도 정보 손실은 가치 손실.

### 4.7.1 룰

- Hero 본문 텍스트는 컨테이너 안에 **완결된 문장으로 들어가야** 한다 (마침표·!·? 끝)
- `text-overflow: ellipsis`로 끊은 `...`는 검출 시 `risk:high`
- `-webkit-line-clamp: N` 사용 시 N줄 안에 완결되도록 본문 텍스트 단축 필수
- 본문 텍스트 80-100자 한도 (한국어 기준). 넘으면 hero가 아니라 본문 paragraph로 분리

### 4.7.2 자동 게이트

`script/audit-infographic-visual.mjs` 추가 검사 룰 (예정):
- `hero-ellipsis-truncation` — 렌더 결과에서 마지막 줄 끝이 `…` 또는 `...` 검출 시 `risk:high` -15
- `hero-text-overflow` — HTML에 `text-overflow: ellipsis` + 본문 텍스트 100자 초과 검출 시 `risk:high` -15

### 4.7.3 위반 패턴 (금지)

데이터·수치·핵심 키워드가 ellipsis로 잘리면 hero가 보내는 메시지가 무력화. 본문 텍스트는 "구독자 1만 + CTR 4%+ + 시청 지속률 50%" 같은 핵심 수치를 **끝까지** 보여줘야 한다.

### 4.7.4 Hero 제목·부제 widow/orphan 금지 (MANDATORY — §5.2 hero 확장)

§5.2 줄바꿈 widow/orphan 금지 룰을 **Hero에도 동일 적용**. Hero `<h1>` 제목이 자동 wrap되어 마지막 줄에 3글자 이하 widow 남으면 `risk:high`.

**위반 패턴**:
- `<h1>유튜브 인플루언서 구독자 1만 만들기</h1>` 폰트 80px + 1072px 가용 → 17자 한 줄 fit 못함 → "유튜브 인플루언서 구독자 1만 만들" / "기" widow (X)

**코드 차원 강제** (정본 — 자동 게이트):
- `script/_batch-replace-hero.mjs`의 `balanceTitleWrap(rawMain, fontSize)` 함수가 자동 처리:
  - `charsPerLine = Math.floor(1072 / fontSize)` (한국어 1em ≒ 1자)
  - main.length > charsPerLine이면 가운데에 가장 가까운 공백 위치에 `<br>` 삽입 → 균형 분할
  - 양쪽 line 길이가 charsPerLine 안에 들어가면 widow 없음
- 새 hero 템플릿 작성 시 같은 패턴 적용. 또는 한 줄에 fit 가능한 main만 사용 (`HERO_MAIN_MAX_CHARS = 14`로 축소)

**자동 게이트** (`script/audit-hero-templates.mjs` 추가 룰 예정):
- `hero-h1-widow` — 렌더 결과의 `<h1>` 영역에 마지막 줄 3글자 이하 단독 남으면 `risk:high` -15
- `hero-subtitle-widow` — `<p>` 부제 영역 동일 검출 -10

---

## 5. 라인브레이크 균형 룰 (MANDATORY — 같은 grid 안 카드 일관성)

같은 `grid grid-cols-N` 안에 들어가는 카드들은 **각 슬롯(라벨/본문/출처)별로 줄 수가 같아야 한다.** 한 카드만 1글자 넘어가서 줄바꿈이 추가로 생기면 시각적으로 망함. 사람 디자이너는 이 경우 반드시 문구 또는 폰트 사이즈를 조정한다.

### 강제 규칙
- 같은 grid 안 카드들의 **같은 슬롯 본문 텍스트 길이 차이 ≤ 평균의 40%**
- `<br>` 명시 줄바꿈 갯수가 카드별로 같아야 함 (차이 ≥ 2면 자동 차단)
- 자동 검출: `audit-infographic-visual.mjs`의 `line-break-balance` 규칙

### 조정 방법 (우선순위 순)
1. **문구 단축**: 너무 긴 카드의 텍스트를 다른 카드 길이에 맞춰 줄임
2. **`<br>` 명시 삽입**: 모든 카드에 동일 위치 `<br>` 삽입해 줄바꿈 강제
3. **폰트 사이즈 축소**: 14px → 13px (다른 카드들과 같이 조정)
4. **카드 width 조정**: cols 줄여서 카드 폭 확장 (`grid-cols-3` → `grid-cols-2`)

### 5.1. 카드 안 li/체크리스트 균형 (MANDATORY)

같은 `<ul>` 안 `<li>` 텍스트 길이도 균형 맞춰야 함. 한 li만 길어서 줄바꿈되면 시각적으로 깨짐.

- 같은 ul 안 li 텍스트 길이 차이 ≤ 평균의 50% AND 절대 차이 < 5자
- 자동 검출: `list-item-balance` 룰
- 조정: 문구 단축 (가장 긴 li를 줄여서 다른 li 길이에 맞춤)

### 5.2. 줄바꿈 orphan/widow 금지 (MANDATORY — CRITICAL)

텍스트가 줄바꿈된 마지막 줄에 **1-2글자만 남는 widow/orphan 패턴 절대 금지**. 시각적으로 매우 어색하고 디자인 품질 파괴.

**위반 예시**:
- `<h1>광고주 협업 진입선 1만 구독 5단계 로드<br>맵</h1>` — 마지막 줄 "맵" 1글자 (X)
- `<p>구독 1만 + 구독 전환율 3% 가 광고주 협업 진입<br>선</p>` — 마지막 줄 "선" 1글자 (X)
- `<li>채널 컨셉 페르소나 확정하기<br>위해</li>` — 마지막 줄 "위해" 2글자 (X)

**룰**:
- 자동 줄바꿈(브라우저 자연 wrap)으로 마지막 줄에 **3글자 이하** 단독 남으면 다음 중 하나 조치:
  - (a) 문구 단축 (가장 강력)
  - (b) 명시적 `<br>` 삽입해 의미 단위로 끊기
  - (c) `word-break: keep-all` + `<wbr>` 명시
  - (d) 폰트 크기 살짝 줄임 (한 줄 안 fit)
  - (e) 컨테이너 폭 확장
- 명시적 `<br>` 사용 시 마지막 줄에 **5글자 이상** 보장
- 위반 검출: `audit-infographic-visual.mjs`의 `line-widow` 룰 (예정) — `risk:high` -10

**검증 방법**: 렌더 결과 webp를 Read tool로 시각 확인. 마지막 줄에 1-2단어만 남으면 위반.

### 5.3. 인포그래픽 한국어 줄바꿈 default (MANDATORY)

본문 인포그래픽 `<body>`에 **반드시 `word-break: keep-all`** 적용. 영어 단어 wrap 룰을 한국어에 적용하면 어절 중간에서 끊겨서 가독성 파괴.

```css
body { word-break: keep-all; }
```

§5.2 orphan/widow 룰과 결합해 한국어 의미 단위 줄바꿈 보장.

예: Phase 카드 안 체크리스트 `["데이터 수집", "컨셉·톤 고정", "주제 일관성 확립"]` 6/8/10자 OK. 하지만 `["시리즈화", "재방문율 + DM 친밀도", "알고리즘 추천 안정화"]` 4/14/12자 → "재방문율 + DM 친밀도" 단축 필요 (예: "재방문 + DM 친밀도" 13자, 또는 "재방문율·DM 친밀" 10자).

### 예시
```html
<!-- ❌ 잘못된 패턴: 한 카드만 텍스트 길이 다름 -->
<p>설정에서 전환 완료까지. 무료, 언제든 되돌리기 가능.</p>  <!-- 23자 — 한 카드만 길어서 줄바꿈 추가 -->
<p>한국 약 2,500만 명.</p>  <!-- 9자 -->
<p>데이터 보존 기간.</p>  <!-- 7자 -->

<!-- ✅ 올바른 패턴: 모든 카드 동일 길이/줄 수 -->
<p>설정에서 전환 완료까지<br>무료, 언제든 되돌리기 가능</p>  <!-- 명시 br, 2줄 -->
<p>전 세계 Instagram MAU<br>한국 약 2,500만 명</p>  <!-- 명시 br, 2줄 -->
<p>도달·노출·프로필 방문<br>데이터 보존 기간</p>  <!-- 명시 br, 2줄 -->
```

---

## 6. a11y 자동 게이트 (MANDATORY — 렌더 후 강제 실행)

인포그래픽 HTML 렌더링(`render-infographic.mjs`) 직후 **반드시** `audit-infographic-visual.mjs` 실행해 통과해야 다음 단계 진입 가능. write 단계(blog/write.md) Phase 5에서 강제.

```bash
node script/audit-infographic-visual.mjs --post=<id>
```

### 검사 항목
- WCAG AA 대비비 (일반 4.5:1 / large 3:1)
- wrap 위험 (grid-cols-3/4 카드 안 큰 폰트 텍스트 overflow)
- 라인브레이크 균형 (§5 룰)
- 폰트 크기 (§4 최소 기준)
- 금지 색상 (#999, #A5C0FF 등)

### 차단 조건
- **risk:high 1건이라도 잔존 → 즉시 차단**, 수정 후 재실행
- risk:medium 다수 → 경고 + 가능하면 수정
- 3회 재실행 후에도 risk:high 잔존 → 발행 중단 + 사용자 보고

### 우회 금지
`--skip-audit` 같은 우회 옵션 절대 추가하지 않는다. 결함이 있으면 반드시 고친다.

---

## 7. 푸터 로고 표준 템플릿

```javascript
// 스크립트 최상단 (모듈 레벨)
import fs from 'fs';
const _logoData = fs.readFileSync('wp-content/illustrations/snshelp-logo.webp');
const LOGO_URL = `data:image/webp;base64,${_logoData.toString('base64')}`;

// 동적 HTML 생성 스크립트에서 표준 푸터
function makeFooter(bg = '#F8FAFC') {
  const isDark = bg === '#0F172A' || bg === '#1E293B';
  const border = isDark ? 'border-top:1px solid rgba(255,255,255,0.12)' : 'border-top:1px solid rgba(0,0,0,0.08)';
  const siteColor = isDark ? 'color:rgba(255,255,255,0.85)' : 'color:#1E293B';
  const tagColor = isDark ? 'color:rgba(255,255,255,0.75)' : 'color:#64748B';
  // LOGO_URL은 반드시 base64 인라인 — file:// 사용 금지
  return `
  <footer class="flex items-center justify-between pt-3 mt-4" style="${border}">
    <div class="flex items-center gap-2">
      <img src="${LOGO_URL}" alt="snshelp 로고" class="h-7 w-auto"/>
      <span class="font-bold text-[14px]" style="${siteColor}">snshelp.com</span>
    </div>
    <span class="text-[13px]" style="${tagColor}">SNS 마케팅 셀프 서비스</span>
  </footer>`;
}
```

---

## 5. 인포그래픽 유형별 HTML 템플릿 위치

| 유형 | 위치 | 용도 |
|---|---|---|
| Hero 인포그래픽 (typography 8종) | `script/hero-templates/*.html` | 글 대표 이미지(featured_media), 1200×675 정본 |
| 본문 인포그래픽 카탈로그 (31종) | `script/infographic-templates/*.html` | 글 상단 한눈 요약 + 본문 섹션 보조, 폭 1200×N 정본 |
| 글 단위 신규 인포그래픽 | `wp-content/drafts/images/{slug}/infographic.html` | 카탈로그를 복사해 글 데이터로 치환 |
| 차트·섹션 이미지 | `wp-content/drafts/images/{slug}/chart-*.html` | 글 H2 직후 보조 차트 (mini-chart-bar / pricing-table 등 카탈로그 사용) |

본문 인포그래픽 카탈로그(`script/infographic-templates/`) 31종 정본은 asset-images §4.10.3 표를 참조. 임시 경로에서 렌더링하는 경우 §1.5 base64 인라인 룰 적용.

---

## 6. 일괄 수정 스크립트 위치

| 스크립트 | 용도 |
|---|---|
| `script/fix-infographic-readability.mjs` | 전체 infographic.html 가독성 일괄 수정 (투명도·폰트 크기) + S3 업로드 |
| `script/render-infographic.mjs` | 단일 HTML → WebP 렌더링 (Puppeteer 기반, 폭 1200 기본값. `--width=N`으로 hero 1200×675·본문 1200×N 모두 처리) |
| `script/wp-media-replace.mjs` | WP 미디어 1장 교체 (두 S3 키 + 5 variants 일괄 덮어쓰기 + CloudFront wildcard invalidation) |

본문 차트·섹션 이미지 일괄 갱신은 `render-infographic.mjs` + `wp-media-replace.mjs` 조합으로 일원화한다. 글 1편 단위 처리는 asset-images §4.7.1, 동시성·lock 룰은 wordpress-integration.md §3.1 참조.

### 6.1 a11y 자동 게이트 추가 검사 (AC-룰-6 정합)

§6 a11y 자동 게이트(`audit-infographic-visual.mjs`)는 다음을 추가 검증한다.

- 텍스트 글자수 한계(§4.1 표): H1 6-28자, stat-value ≤ 8자, 카드 본문 ≤ 60자, figcaption ≤ 120자
- 금지 어휘 사전(§4.2): 과장·과대 약속·풀이 없는 외래어 매칭
- figcaption 형식 검증: 출처 인용 시 `"출처: {기관/플랫폼}, {YYYY}."` 또는 `"이미지: {라이선스/출처}"` 또는 `"예시 이미지"` 만 허용

금지 어휘 사전 갱신은 `node script/audit-infographic-visual.mjs --update-dictionary` 절차로 운영. 정본은 asset-images §4.10.8.
