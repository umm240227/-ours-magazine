# 이미지 자산(asset) 관리 규칙

snshelp-astro의 정적 이미지(아이콘·로고·배너·일러스트 등) 추가·사용 규칙. 이미지 작업 시 이 문서 정본.

> 정적 이미지는 S3 + CloudFront(`assets.helpsns.com`) 외부화 운영. Astro Image / Picture 컴포넌트는 사용하지 않으며 `image.service: noop` 설정.

---

## 1. 인프라 — assets.helpsns.com (CloudFront + S3)

| 항목 | 값 |
|---|---|
| **Origin S3 버킷** | `s3://snshelp-resource-bucket/static/...` |
| **CDN 도메인** | `https://assets.helpsns.com/static/...` |
| **CloudFront 인증서** | `*.helpsns.com` (Sectigo wildcard) |
| **Cache-Control** | `public, max-age=31536000, immutable` (1년, immutable) |
| **content-type** | aws s3 sync 자동 매핑. svg는 `image/svg+xml` 확인 |

URL 매핑 규칙: 로컬 경로 `src/assets/{rel}` → CDN URL `https://assets.helpsns.com/static/{rel}`

매핑 테이블: [tmp/asset-migration/asset-map.json](../tmp/asset-migration/asset-map.json) (230개, dimension 포함).

---

## 2. 신규 이미지 추가 절차 (필수)

### 2.1 단계

```bash
# 1. src/assets/ 안 적절한 디렉토리에 파일 추가
#    예: src/assets/images/renewal/main/new_banner.webp

# 2. S3 sync (changed-only, 자동 차분 업로드)
cd $CLAUDE_PROJECT_DIR
aws s3 sync src/assets/ s3://snshelp-resource-bucket/static/ \
  --cache-control "public, max-age=31536000, immutable" \
  --metadata-directive REPLACE \
  --exclude "*" \
  --include "*.png" --include "*.jpg" --include "*.jpeg" \
  --include "*.webp" --include "*.avif" --include "*.gif" --include "*.svg"

# 3. 매핑 테이블 갱신 (dimension 측정 포함)
node tmp/asset-migration/measure-and-remap.mjs

# 4. 코드에서 사용 (§3 참조)
```

### 2.2 사전 점검

- 파일명: kebab-case 영문 (`new-banner.webp`) 또는 의미 있는 한글
- **확장자 표준**: WebP (사진·일러스트·UI), SVG (벡터·아이콘·로고). **PNG/JPG 신규 추가 금지** (sharp로 webp 변환 후 추가)
- 파일 크기: 모바일 LCP 위해 단일 이미지 200KB 이하 권장
- 디멘션: 실사용 표시 크기의 1.5~2x (Retina 대응)

### 2.2-1 PNG/JPG → WebP 변환 (필수, 자동화됨)

신규 이미지가 PNG/JPG로 받았다면 **반드시 WebP로 변환 후 사용**한다.

**자동 변환 인프라** (이미 적용):
- **`script/render-infographic.mjs`** — Chrome headless로 PNG 캡처 후 sharp WebP 변환 (기본 quality=85). 출력 확장자 `.webp` 권장. 1.5MB PNG → 63KB WebP (-80% 검증)
- **`script/wp-publish-new.mjs`** — `_draft.images[N].file`이 PNG/JPG면 업로드 직전 `ensureWebp()`가 자동 WebP 변환 (같은 디렉토리에 .webp 파일 생성). WP `/media POST`에 `image/webp`로 전송

즉 신규 글 워크플로에서는 PNG 입력해도 자동 WebP. 단, 직접 `aws s3 cp`나 별도 스크립트로 업로드할 땐 사전 변환 필수.

```bash
# 단일 파일
node -e "
const sharp = require('sharp');
sharp('input.png').webp({ quality: 85, alphaQuality: 100, effort: 6 }).toFile('output.webp');
"

# 일괄 변환 + 원본 .recycle 이동
node tmp/asset-migration/png-to-webp.mjs
```

품질 권장:
- 알파 채널 있음(투명 PNG): `quality: 90, alphaQuality: 100` (lossless 가까운 품질)
- 사진/배너: `quality: 85` (시각 차이 거의 없음, 50-80% 용량 절감)
- 단순 아이콘: SVG 우선. 못 만들면 webp `quality: 80`

PNG → WebP 변환 시 평균 50% 내외 용량 절감 기대.

### 2.3 자동화 스크립트

신규 이미지가 많을 때 (10+개) 일괄 처리:
- [tmp/asset-migration/measure-and-remap.mjs](../tmp/asset-migration/measure-and-remap.mjs) — sharp로 dimension 측정 → asset-map.json
- [tmp/asset-migration/migrate-imports.py](../tmp/asset-migration/migrate-imports.py) — 코드의 `import 'assets/...'` 자동 치환

---

## 3. 코드에서 사용하는 패턴 (필수)

### 3.1 표준 패턴 — `const` 객체로 직접 정의

```ts
// ✅ 권장 — dimension까지 명시 (CLS 방지)
const HeroBanner = {
  src: 'https://assets.helpsns.com/static/images/renewal/main/hero.webp',
  width: 1200,
  height: 630,
};

<img
  src={HeroBanner.src}
  width={HeroBanner.width}
  height={HeroBanner.height}
  alt="SNS헬프 메인 배너"
  loading="lazy"
  decoding="async"
/>
```

### 3.2 dimension 정보 출처

- **자동**: `tmp/asset-migration/asset-map.json` (sharp로 측정된 정확한 width/height)
- **수동 사용 시**: `src/assets/...` 파일을 sharp 또는 `file -b` 명령으로 측정해 width/height 명시

### 3.3 직접 URL 인라인 사용 (소규모 1회성)

```tsx
<img
  src="https://assets.helpsns.com/static/images/icons/check.svg"
  alt="확인"
  width={16}
  height={16}
/>
```

소규모/1회성 아이콘은 const 정의 없이 인라인 가능. 단 width/height는 필수.

### 3.4 동일 이미지 여러 곳에서 사용

→ 공통 모듈(`src/shared/common/assetUrls.ts` 등)에 const 정의 후 import.
중복 정의 금지.

---

## 4. 금지 사항 ❌

### 4.1 Astro `<Image>` / `<Picture>` 컴포넌트 사용 금지
- `image.service: noop` 설정으로 비활성화됨
- 사용 시 `Cannot find name 'Image'` 또는 dimension 누락 에러
- 대신 일반 `<img>` 태그 + width/height 직접 명시

### 4.2 `import Foo from 'assets/...'` 패턴 금지
- Astro Image 처리 활성화될 가능성
- 대신 const 객체로 직접 외부 URL 정의 (§3.1)

### 4.3 외부 도메인 직접 hotlink 금지
- 외부 사이트 이미지 src로 직접 사용 금지 (mixed content + 도메인 사라질 위험)
- 필요 시 자체 인프라(S3 또는 CloudFront)에 다운로드 후 사용

### 4.4 width/height 생략 금지
- CLS(Layout Shift) 발생 → Core Web Vitals 점수 저하
- 모든 `<img>` 태그는 width/height 명시 (또는 CSS aspect-ratio 명시)

### 4.5 PNG/JPG 신규 추가 금지
- 신규 이미지는 모두 WebP로 변환 후 추가 (§2.2-1). PNG/JPG 그대로 업로드 X
- 변환 도구: `tmp/asset-migration/png-to-webp.mjs` (sharp 기반 일괄)
- 즉석 변환 명령어:
  ```bash
  node -e "const s=require('sharp'); s('input.png').webp({ quality: 90, alphaQuality: 100, effort: 6 }).toFile('output.webp')"
  ```
  품질 기준: 알파 PNG는 quality 90 + alphaQuality 100. 사진·배너는 quality 85. SVG는 변환 불필요.

### 4.5.1 `public/` 디렉토리 셀프호스팅 금지 (CRITICAL)

신규 이미지·아이콘·로고를 `public/`에 두는 **셀프호스팅 금지**. 정본은 `src/assets/` → `aws s3 sync` → `https://assets.helpsns.com/static/...` CDN 외부화 (§1, §1.1).

**왜**: 셀프호스팅 시 (a) 빌드 산출물 크기 증가, (b) CDN 캐싱·압축·HTTP/2 push 혜택 없음, (c) 같은 자산이 origin·CDN 두 곳에 중복되어 정합성 깨짐.

**예외 (public/에 두는 게 정답인 케이스, 좁게)**:
- `public/favicon.svg`, `public/favicon.ico` — 브라우저 표준 위치
- `public/robots.txt`, `public/llms.txt`, `public/sitemap*.xml` — 표준 라우트
- `public/manifest.json`, PWA 자산 — 표준 위치
- 그 외 새 이미지·로고·아이콘은 모두 `src/assets/` 경유

**위반 시그널**: `public/icons/*.png` 같은 새 디렉토리·파일이 PR에 보이면 즉시 `src/assets/`로 이동 + S3 sync 처리.

### 4.5.2 WP 본문 img URL 변환 룰 (CRITICAL)

helpsns.com Astro는 WP REST API content.rendered를 가져와 [src/shared/common/utils/blogImage.ts](../src/shared/common/utils/blogImage.ts) 의 `localizeContentHtml`로 img 태그를 변환한다. 두 가지 변환 룰을 반드시 지켜야 한다.

**(1) `normalizeUrl` 정규식 — `wp-content/uploads` 보존**:

```ts
// ✅ 올바름
.replace(/https:\/\/52\.79\.247\.124\/wp-content\/uploads/g, 'https://assets.helpsns.com/wp-content/uploads')

// ❌ 잘못됨 (wp-content/uploads 누락 → 404)
.replace(/https:\/\/52\.79\.247\.124\/wp-content\/uploads/g, 'https://assets.helpsns.com')
```

**왜**: `wp-content/uploads` 경로를 누락하면 변환된 URL이 `https://assets.helpsns.com/2026/05/0-hero.png` 형태가 되어 403 응답. 글 리스트·상세 hero 이미지가 전부 깨진다. 올바른 매핑은 `wp-content/uploads/2026/05/0-hero.png` 그대로 보존.

**(2) `localizeContentHtml` — img의 srcset/sizes 제거 (S3 변형 sync 부재 대응)**:

WP는 출력 시점에 자동으로 사이즈 변형 srcset을 부여한다 (`-182x300.webp`, `-621x1024.webp` 등). 이 변형들은 WP origin Apache(52.79.247.124)에만 존재하고 **S3+CDN(assets.helpsns.com)에는 sync되지 않음**. 모바일 브라우저가 srcset의 작은 사이즈를 자동 선택해 fetch하면 mixed content + 404로 이미지 안 보임.

대응: `localizeContentHtml`이 srcset/sizes attribute를 제거하고 src(1200px 원본)만 남김. 모바일도 src로 fetch하며 `max-width: 100%` CSS로 viewport에 맞춰 축소.

**왜**: srcset 변형 URL이 origin `http://52.79.247.124/...`이면 HTTPS 페이지에서 mixed content + CDN 404로 모바일 본문 인포그래픽이 빈 영역으로 렌더된다.

**향후 복구 옵션**: wp-publish-new.mjs에 사이즈 변형 자동 S3 sync 추가하면 srcset 유지 검토 가능. 그 전까지는 srcset 제거가 정본.

### 4.6 `d14icj3tspgnn2.cloudfront.net` 직접 사용 금지 (WP 블로그 이미지 포함)
- WP 미디어 라이브러리 원본 origin은 같은 CloudFront지만 **alternate domain `assets.helpsns.com`이 정본**이다. 모든 신규 코드/포스트는 `assets.helpsns.com`만 사용
- 적용 범위: `wp-content/posts/*.md` 본문 `<img src=...>`, `_media.json`, src 코드, 스크립트, 환경변수
- 옛 URL을 발견하면 sed 일괄 치환 후 영향받은 글 wp-push
- WP 신규 업로드 시 `wp-publish-new.mjs`가 `CLOUDFRONT_DOMAIN=assets.helpsns.com` 환경변수로 자동 처리. `.env`에 반드시 다음 3개 설정:
  ```
  S3_BUCKET=snshelp-resource-bucket
  S3_PREFIX=blog
  CLOUDFRONT_DOMAIN=assets.helpsns.com
  ```
- WP 본문에 직접 `<img>` 블록을 추가할 때(중복 이미지 교체·신규 삽입 등)도 src URL은 반드시 `https://assets.helpsns.com/blog/...`

### 4.7 블로그 글 신규 발행 시 항상 codex 이미지 신규 생성 (재활용 금지)

신규 글 작성 시 **codex CLI로 매번 fresh 이미지 생성** 필수. `_media.json` 재활용 금지.

- **목표 슬롯**: 글당 4장 (대표 1 + 본문 핵심 H2당 1장 = 3장)
- **생성 위치**: `wp-content/drafts/images/{slug}/{N}-{purpose}.png` (publish 후 `.recycle/drafts/`로 이동)
- **자동 등록**: `wp-publish-new.mjs`가 각 이미지를 `POST /wp-json/wp/v2/media`로 WP 라이브러리에 등록 → media id 발급 → `assets.helpsns.com` URL 부여 → 본문 `[[IMG:N]]` placeholder 자동 치환 → `_draft.images[N].featured=true` 또는 첫 이미지가 `featured_media`로 자동 지정
- **frontmatter `_draft.images[N]` 형식**:
  ```json
  {
    "file": "wp-content/drafts/images/{slug}/0-hero.png",
    "alt": "글 메인 키워드 자연 포함 alt 텍스트",
    "title": "media library title (선택)",
    "caption": "figcaption 텍스트 (선택)",
    "featured": true
  }
  ```
- **실패 처리**: codex 5회 재시도 모두 실패 → **발행 중단**. 사용자에게 보고. `_media.json` 재활용 fallback 없음
- **재활용 금지 조건**: 어떠한 경우에도 `_media.json` 기존 이미지를 신규 글에 재활용하지 않음. 시간·비용 절감 명목 회귀 금지

### 4.7.1 발행된 글의 사진 교체 시 두 S3 키 모두 덮어쓰기 (MANDATORY)

WP가 사진을 등록할 때 같은 이미지가 **두 S3 키에 별도 저장**된다:
1. **본문 src**: `saved-images/YYYY/MM/img-{HASH}.png` — 본문 `<img src>` 참조
2. **featured_media URL**: `blog/YYYY/MM/{TIMESTAMP}/img-{HASH}.png` + **사이즈 variants** (`-300x171.png`, `-1024x585.png`, `-768x439.png`, `-150x150.png`, 원본) — Astro hero banner + Astro reading order 참조

기존 글의 사진을 교체할 때 **두 키 + 5 variants 모두 덮어쓰지 않으면** 본문은 새 사진, 썸네일은 옛 사진, OG/Twitter card는 또 다른 사진으로 production 불일치 발생.

**필수 절차 (`wp-media-replace.mjs` 자동 또는 수동 등가)**:

자동 (권장):
```bash
node --env-file=.env script/wp-media-replace.mjs <media-id> /path/to/NEW.webp \
  --alt="..." --caption="..."
# 두 S3 키 + 5 variants 일괄 덮어쓰기 + CF wildcard invalidation + WP /media PATCH 한 번에 처리
```

수동 등가:
```bash
# 1) 본문 src 키 덮어쓰기
aws s3 cp NEW.webp s3://snshelp-resource-bucket/saved-images/YYYY/MM/img-HASH.png \
  --content-type image/webp --cache-control no-cache

# 2) featured_media 키 + 사이즈 variants 5개(원본 + 4 사이즈) 덮어쓰기
for size in "" "-300x171" "-1024x585" "-768x439" "-150x150"; do
  aws s3 cp NEW.webp s3://snshelp-resource-bucket/blog/YYYY/MM/TIMESTAMP/img-HASH${size}.png \
    --content-type image/webp --cache-control no-cache
done

# 3) CloudFront 무효화 — 글당 1개 wildcard path 통합 (월 1000 path 무료 한도 보호)
aws cloudfront create-invalidation --distribution-id E3EIN06IFGMYRE \
  --paths "/wp-content/uploads/{slug}*"
```

**5 variants 정본 목록**: `-300x171`, `-1024x585`, `-768x439`, `-150x150`, 원본 (5종 = 4 사이즈 + 원본). WP가 자동 생성하는 사이즈 변형 정본이며, 같은 미디어 ID에 묶여 있다. 5개 중 1개라도 누락하면 모바일 srcset 또는 OG card 깨짐.

**자동 검출**: `audit-post-html.mjs`의 `featured-media-path-mismatch` 룰이 두 키 mismatch 검출 (medium). `audit-body-images.mjs --strict` 모드는 5 variants 누락도 검출.

**동시성**: 본 절차는 `wordpress-integration.md §3.1` 진입점 lock 게이트의 영향을 받는다. routine 또는 1회성 마이그레이션 lock 활성 시 wp-media-replace.mjs는 exit 75로 종료된다.

### 4.7.2 codex 호출 룰 (MANDATORY — stdin 처리 + 병렬화)

**정본**: `.ai-rules/codex-calls.md` — Node.js/bash 패턴, 금지 패턴, 병렬화 가이드 전체 수록.

**요약**:
- Node `spawn`/`spawnSync`: `stdio: ['ignore', 'pipe', 'pipe']` 또는 `['ignore', 'inherit', 'inherit']` 필수. stdin = `'ignore'` 강제 (= /dev/null). stdout/stderr는 캡처 필요 시 `'pipe'`, 즉시 출력 필요 시 `'inherit'`
- bash: `codex exec ... < /dev/null` 필수
- `stdio: 'inherit'` (단일 string) / stdio 미지정(`execFileP`) / `stdio: 'pipe'` (단일 string) / stdin을 `'pipe'`로 두고 입력 안 닫음 모두 금지 — codex가 stdin을 무한정 기다리며 hang 유발
- **timeout 300s 필수**: `spawnSync({ timeout: 300_000 })` 또는 `AbortController` + setTimeout 300s. 300s 초과 시 자동 kill + retry 큐
- 병렬화: 5개 단위 chunked, 단일 평균 3분, chunked 5개 효율 ~70%
- **§6.3 batch script 작성 시 동일 룰 적용**: 본문 인포그래픽 일괄 재렌더 batch script는 위 stdin pipe 처리 + timeout 300s 룰을 반드시 따른다. 위반 시 codex hang으로 batch 전체 stall.

### 4.8 톤앤매너 preamble (모든 codex 프롬프트 강제 prepend)

snshelp 블로그 사진형 이미지는 **photorealistic 일관 스타일**을 정본으로 한다. 모든 codex 프롬프트는 다음 preamble을 그대로 앞에 붙여 호출한다.

```
[snshelp brand style preamble]
Photorealistic style. Korean cultural context (한국 자영업자, 한국 카페, 한국 매장, 한국 마케터 등 명시 권장).
Brand color accents allowed: primary blue #3B70FF, deeper blue #2553D7, soft background #F1F5FF.
Natural daylight or soft studio lighting. Modern, clean, slightly warm tone.
Subject framed at rule-of-thirds. Shallow depth of field acceptable.
NO text overlay (Korean or English). NO watermarks. NO logos of real brands.
NO extra fingers, distorted faces, or AI-typical artifacts.
[end preamble]

[task-specific prompt]
{원본 프롬프트}

[output]
Save to wp-content/drafts/images/{slug}/{N}-{purpose}.png at exact 1792x1024 (16:9).
```

**금지**:
- 일러스트·플랫·만화·3D 렌더링 스타일 혼용 금지 (사진형 일관)
- 영문/한글 텍스트를 이미지 안에 박지 말 것 (figcaption으로 처리)
- 실제 브랜드 로고(스타벅스, 인스타그램 UI 등)를 그대로 넣지 말 것 — 일반화된 형태로

### 4.8.1 사진 프롬프트 구체성 룰 (MANDATORY — generic 금지)

codex 프롬프트는 **글의 메인 키워드 + 페르소나 + 구체 시나리오**를 반드시 반영. 단순 platform mapping (`youtube → Korean YouTuber working at desk`) 금지.

**필수 포함 요소**:
1. **메인 키워드 직접 반영**: 글 주제의 핵심 동사·결과 (예: "릴스 만들기" → 스마트폰으로 영상 녹화하는 장면, "광고 효율" → 노트북 대시보드에서 그래프 확인하는 장면)
2. **페르소나 구체화**: 단순 "Korean creator" 금지. 글의 타깃 페르소나 그대로 (예: "20대 카페 사장", "1인 마케터", "패션 D2C 브랜드 마케터", "유튜브 크리에이터 부업 취준생")
3. **구체 시나리오**: 무엇을 하는 순간인가 (예: "고객 댓글에 답글 다는 순간", "광고 캠페인 결과 발견한 순간", "릴스 첫 1만 조회 본 순간")
4. **환경 디테일**: 한국 맥락 카페·매장·홈오피스·스튜디오 + 도구·소품 명시
5. **감정·표정**: 단순 "working" 금지. "집중", "발견", "안도", "고민" 등 1개

**금지 패턴 (generic)**:
- ❌ "Korean creator working on laptop" — 너무 일반
- ❌ "Korean YouTuber at desk" — 글 주제 매칭 X
- ❌ "Person using social media" — 페르소나 0

**올바른 패턴 (글 특성 반영)**:
- ✅ "20대 한국 카페 사장이 매장 카운터 옆 스마트폰으로 릴스 첫 시청 1만 알림 보고 놀라는 순간, 자연 채광 카페, 따뜻한 톤"
- ✅ "30대 한국 1인 마케터가 노트북 대시보드에서 광고 ROAS 3배 결과 발견, 깔끔한 홈오피스, 차 한잔 옆"
- ✅ "한국 식품 매장 사장님이 위생 체크리스트 앞치마 차림으로 점검, 자연 채광 매장, 차분한 표정"

**자동 검증** (write 단계 `blog/write.md` Phase 5):
- codex 결과 Read 시 "Korean creator working" / "person using laptop" 같은 generic 시그널이 보이면 → 프롬프트 재작성 후 재시도
- 같은 페르소나·동일 구도 글이 5편 이상 반복되면 시각적 다양성 부족 → 시나리오 변형 강제

### 4.8.2 hero 이미지 룰 (MANDATORY — typography 단일 종류 고정)

블로그 글 hero(featured/대표) 이미지는 **항상 타이포그래피(typography) 인포그래픽 1장**으로 고정한다. photo·screenshot·chart는 hero에 사용 금지. 본문 보조 이미지로만 사용.

**hero 정본 템플릿 (CRITICAL — `script/hero-templates/` 디렉터리, 8종)**:

| 파일 | 용도 | 강제 viewport | 핵심 placeholder |
|---|---|---|---|
| `script/hero-templates/title-typography.html` | 제목·문구 중심 hero | `<main class="w-[1200px] h-[675px]">` (16:9) | `{{TITLE}}`, `{{SUBTITLE}}`, `{{CATEGORY}}`, `{{YEAR_TAG}}` |
| `script/hero-templates/v2-stat-hero.html` | 수치 강조 hero (자주 사용) | `<main class="w-[1200px] h-[675px]">` (16:9) | `{{TITLE}}`, `{{STAT_VALUE}}`, `{{STAT_LABEL}}`, `{{CATEGORY}}` |
| `script/hero-templates/v3-split.html` | 좌측 패널 + 우측 컨텐츠 hero | `<main class="w-[1200px] h-[675px]">` (16:9) | `{{TITLE}}`, `{{LEFT_LABEL}}`, `{{RIGHT_CONTENT}}` |
| `script/hero-templates/v4-quote-hero.html` | 1차 출처 인용 강조 (blockquote 비주얼) | `<main class="w-[1200px] h-[675px]">` (16:9) | `{{TITLE}}`, `{{QUOTE_TEXT}}` (≤ 80자), `{{QUOTE_SOURCE}}`, `{{YEAR_TAG}}` |
| `script/hero-templates/v5-checklist-hero.html` | Do/Don't 체크리스트 hero | `<main class="w-[1200px] h-[675px]">` (16:9) | `{{TITLE}}`, `{{DO_ITEMS}}` (3-5), `{{DONT_ITEMS}}` (3-5) |
| `script/hero-templates/v6-comparison-hero.html` | A vs B 비교 hero | `<main class="w-[1200px] h-[675px]">` (16:9) | `{{TITLE}}`, `{{LEFT_LABEL}}`, `{{LEFT_VALUE}}`, `{{RIGHT_LABEL}}`, `{{RIGHT_VALUE}}` |
| `script/hero-templates/v7-timeline-hero.html` | 변화·과정·연도별 hero | `<main class="w-[1200px] h-[675px]">` (16:9) | `{{TITLE}}`, `{{MILESTONES}}` (3-5개 연도+이벤트) |
| `script/hero-templates/v8-persona-hero.html` | 페르소나 페인포인트 강조 hero | `<main class="w-[1200px] h-[675px]">` (16:9) | `{{TITLE}}`, `{{PERSONA_LABEL}}`, `{{PAIN_LINE}}`, `{{INSIGHT_LINE}}` |

**스키마 정본**: `script/hero-templates/schema.json` — 각 템플릿의 placeholder + 길이 제약(JSON Schema draft-07) 정본. 신규 글 hero 생성 시 schema 검증 통과 필수.

**산출 방법**:
- 위 8개 정본 템플릿 중 글 주제에 맞는 1개를 선택해 placeholder 치환 (schema.json 제약 준수)
- Chrome headless로 1200×675 webp 렌더 (`script/render-infographic.mjs <input.html> <output.webp> --width=1200`, height는 16:9 trim)
- 또는 `script/_batch-replace-hero.mjs --post=<id>`로 일괄 처리 (S3 업로드 + WP /media POST + featured_media PATCH 자동)
- 모바일 가독성 규격은 §4.8.5 강제
- 자동 검증: `node script/audit-hero-templates.mjs` 통과 필수 (sample data로 렌더 → §4.8.5 통과)

**`script/infographic-templates/style-T*.html` (T07~T16)는 본문 인포그래픽 전용** — hero 사용 금지. T* 카탈로그는 §4.10.3 본문 인포그래픽 카탈로그에 포함. hero에 T*를 쓰면 16:9 viewport가 강제되지 않아 비율 깨짐.

**템플릿 다양성 룰**:
- 같은 hero 템플릿(v1~v8)이 직전 5편 연속이면 다음 글은 다른 템플릿 강제. 신규 5종(v4-v8) 포함 8종 전체에 적용
- 선택한 hero 템플릿은 frontmatter `_draft.hero_template`에 파일명(예: `v4-quote-hero`)으로 기록
- 같은 주제 클러스터에서도 5편 윈도 안에서 같은 템플릿 반복 금지

**Why**: hero가 같은 사진 일변도면 AI 양산 인식이 생기고 CTR이 떨어진다. typography hero는 글의 핵심 수치·개념을 즉시 노출해 모바일 썸네일(372×210)에서도 정보 전달이 가능하다. 모바일 list 썸네일이 16:9 강제 crop이므로 hero가 16:9가 아니면 핵심 콘텐츠가 잘림.
**How to apply**: write 단계(blog/write.md) Phase 5에서 `script/hero-templates/` 정본 3종 중 1개 선택 → render-infographic.mjs로 1200×675 webp 생성 → §4.8.5 모바일 가독성 규격 통과 확인.

### 4.8.3 스크린샷 본문 이미지 룰 (MANDATORY — 신뢰도 단서)

스크린샷은 hero에 사용 금지 (§4.8.2). 본문 보조 이미지로만 사용.

**언제 스크린샷이 사진/일러스트보다 우월한가**: 글이 "공식 정책", "플랫폼 통계", "실제 대시보드 결과"를 인용할 때 — 캡처가 "1차 출처 본 듯한" 단서를 준다.

**산출 방법 (Chrome headless)**:
```
script/capture-screenshot.mjs --url=<공식 페이지/대시보드 URL> \
  --out=wp-content/drafts/images/{slug}/{N}-screenshot.png \
  --crop=16:9 --width=1792 --bg=#ffffff
```

**가공 룰**:
- 개인 식별 정보(이메일·실명·계정ID) → blur 또는 redact
- 실제 브랜드 UI(YouTube/Instagram 로고)는 그대로 OK (인용 fair use, 단 figcaption에 출처 명시)
- 캡처는 광각 영역보다 핵심 패널 중심으로 crop (수치·그래프가 보이게)
- figcaption 형식: `"출처: {플랫폼명}, {캡처 일자}"` 필수
- **figcaption ↔ 이미지 일치 룰 (§4.8.6 정합)**: "출처:/자료:/기관명/연도/통계 수치" 인용은 인포그래픽/차트 또는 본 항목의 스크린샷(공식 페이지/대시보드 캡처)에만 사용. 사진·인물·일러스트에 출처 표기 금지

**금지**:
- 광고·결제 화면 캡처 (개인정보 위험)
- 다른 SNS 도움 서비스 경쟁사 화면 캡처 (저작권 분쟁 위험)
- 가짜 screenshot mockup (실제처럼 보이는 합성) — `[Mock]` figcaption 명시 안 하면 사용 금지

### 4.8.5 Hero 이미지 모바일 가독성 정본 (CRITICAL — 모든 typography hero 강제)

블로그 hero(featured_media) 이미지는 PC + 모바일에서 모두 잘 보여야 한다. 썸네일이 모바일에서 372×210 또는 더 작게 표시되므로 hero 내부 글자가 충분히 크고 진해야 한다.

**hero 16:9 1200×675 기준 강제 규격**:

| 요소 | 폰트 사이즈 | 색상 | 굵기 | 비고 |
|------|-------------|------|------|------|
| **제목 (메인 타이틀)** | ≥ 56px | `#FFFFFF` (다크 BG) / `#0B1220` (라이트 BG) | font-black (900) | **32자 max** (초과 시 자동 단축 + 부제로 prepend) |
| **부제 (서브타이틀)** | ≥ 40px | white BG: `rgba(255,255,255,0.95)` / dark text: `#0B1220` | font-bold (700) 이상 + text-shadow `0 2px 8px rgba(0,0,0,0.3)` (다크 BG에만) | **60자 max** (strict). opacity ≤ 0.85 금지 |
| **카테고리 배지** | ≥ 24px | `#FFFFFF` (다크 BG) | font-bold (700) | 배경 `rgba(255,255,255,0.22)` border `rgba(255,255,255,0.45)` (대비 확보) |
| **연도 태그 / 우상단 식별자** | ≥ 18px | `rgba(255,255,255,0.9)` | font-bold (700) | opacity ≤ 0.55 금지 |
| **로고 + snshelp.com** | 로고 박스 ≥ 60×60px / 텍스트 ≥ 22px (브랜드명) / ≥ 14px (URL) | white BG: `#FFFFFF` / 텍스트: `text-white` 또는 `#0B1220` | font-black + font-semibold | URL은 opacity ≥ 0.9 |
| **stat label** | ≥ 14px | `rgba(255,255,255,0.9)` 이상 | font-bold | tracking-widest |
| **stat value (V2 hero)** | 64~132px (자동 산정) | `#FFFFFF` | font-black | 한글 단위(만/억/명/회/배 등)는 분리해서 55% 작게 + `nowrap` |

**금지 패턴** (audit script `audit-infographic-visual.mjs` 자동 검출 + risk:high 차단):
- ❌ `text-white/85` 미만 (white BG 텍스트 opacity)
- ❌ `text-white/55` 미만 (보조 텍스트도 0.7 이상)
- ❌ font-weight 400 (subtitle/body에서) — 모바일 LCD에서 얇아져 읽기 어려움. 최소 500
- ❌ 제목 32자 초과를 줄바꿈 2-3줄로 처리 (모바일에서 4줄 됨) — 무조건 자르고 부제 prepend
- ❌ 부제 60자 초과 (모바일에서 5줄 됨)
- ❌ stat value를 `nowrap` 없이 표시 (한글 단위 시 줄바꿈 발생)
- ❌ 카테고리 배지 폰트 23px 이하 (모바일 list 372px 환산 7.4px → 불가독)
- ❌ 로고 박스 60×60 미만 (모바일 썸네일에서 점으로 보임)
- ❌ 부제 폰트 40px 미만 (모바일 list 372px 환산 12.4px 미만 → 흐릿)

**모바일 시뮬레이션 검증 룰** (스케일 0.31 = 372px / 1200px):
- 1200×675 hero를 **372×210 (모바일 list 썸네일)** 로 축소: 모든 글자 픽셀 × 0.31
  - 제목 56px → 17.4px (통과)
  - 부제 40px → 12.4px (가독 마지노선 통과)
  - 카테고리 배지 24px → 7.4px (가독 마지노선 통과)
  - 로고 박스 60px → 18.6px (썸네일에서 식별 가능)
- 1200×675 hero를 **1000×563 (모바일 상세 페이지 풀폭)** 로 축소: 글자 × 0.83
  - 부제 40px → 33px (확실히 가독)
  - 배지 24px → 20px (확실히 가독)

**Why**: 모바일 트래픽 비중 70%+. 썸네일에서 글자 안 읽히면 클릭 안 됨. 룰 정본화 + audit 자동 검증으로 영구 차단. 모바일 LCD에서 서브타이틀의 light weight + 낮은 opacity 조합은 가독성 한계 이하로 떨어지므로 표 기준을 강제한다.
**How to apply**: 모든 typography hero 템플릿(`script/hero-templates/*.html`) + `script/_batch-replace-hero.mjs` placeholder 치환 로직에서 위 표를 강제. audit-infographic-visual.mjs는 이 룰을 자동 검증해 risk:high로 차단.

**신규 5종 슬롯별 폰트 사이즈 정합 (v4-v8)**:

위 폰트 표는 8종 hero 전체(v1-v8)에 동일 적용된다. 신규 5종에서 추가로 강제되는 슬롯:

| 템플릿 | 추가 슬롯 | 최소 폰트 |
|---|---|---|
| v4-quote-hero | blockquote 본문 | ≥ 48px |
| v5-checklist-hero | Do/Don't 항목 | ≥ 36px |
| v6-comparison-hero | 좌·우 라벨 | ≥ 56px |
| v7-timeline-hero | 연도 마커 | ≥ 40px |
| v8-persona-hero | 페인 라인 (pain line) | ≥ 44px |

각 슬롯의 폰트는 `audit-hero-templates.mjs` + `audit-infographic-visual.mjs detectMobileReadability`로 자동 검증한다. 위 표 미달 시 risk:high.

### 4.8.4 글당 최소 이미지 수 게이트 (HARD GATE — `wp-publish-new.mjs` 자동 차단)

블로그 글 1편당 `_draft.images` 최소 **3장** (hero 1 + 본문 보조 ≥ 2):
1. **Hero 1장**: §4.8.2 typography hero 1장 (`featured: true` 명시)
2. **본문 보조 ≥ 2장**: 인포그래픽(§4.10) 또는 차트(§4.10) 또는 사진/스크린샷. 둘 중 최소 1장은 인포그래픽/차트(정보 전달) 필수. 두 장이 동일 종류·동일 페르소나·동일 구도 반복은 금지

**예외 없음**: 텍스트 전용 페이지(About, 정책 페이지 등)도 hero + 본문 이미지 ≥ 2장 필수. 모든 모드(`/blog write`·`/blog create`·`/blog create auto`·수동 호출)에 동일 적용.

**구현**: `script/wp-publish-new.mjs`가 `images.length < 3` 시 exit code 2 차단. publish 단계(blog/publish.md) Phase 0.6 게이트는 추가로 시각 검증 4중 통과를 요구한다.

**Why**: cron 자동 발행 모드에서 LLM이 Phase 5 이미지 생성을 SKIP한 채 빈 본문으로 publish하는 사고가 발생할 수 있다. 코드 게이트가 빈 이미지를 차단하면 prompt 일탈에도 안전하다. 본문 이미지 ≥ 2장은 GEO/E-E-A-T 측면에서도 본문 정보 밀도를 보장하며, 모바일 사용자의 스크롤 흐름 가독성을 확보한다.
**How to apply**: publish 단계(blog/publish.md) 호출 전 `_draft.images`에 최소 3개(hero 1 + 본문 ≥ 2) 등록. 누락 시 exit 2로 차단되어 발행 안 됨.

### 4.8.6 본문 단독 일러스트 금지 + figcaption 정합 룰 (CRITICAL — AC-룰-1·2)

블로그 본문 `<figure>`로 단독 삽입되는 codex 인물·장면 일러스트는 사용 금지. hero(§4.8.2)와는 별개로 본문도 동일 룰을 적용한다.

**금지 (위반 시 미디어 영역 −20)**:
- 본문 `<figure>` 안 codex 생성 인물 일러스트 (`<img>` src가 `saved-images/` 또는 1792×1024 dimension)
- 본문 단독 풍경·라이프스타일 일러스트
- "Korean creator at desk" 같은 generic AI 일러스트

**적용 범위 명확화**:
- **본문 `<figure>` 단독 삽입**만 금지. 인포그래픽 HTML 내부의 디자인 요소(아이콘 풍 일러스트, 작은 보조 그림, 헤더 일러스트)는 §4.10.1 / §4.10.2(a) 룰을 따르며 허용
- 페르소나 일러스트 `persona-{slug}.webp`(author 페이지·byline 노출용)는 본 룰 적용 범위 제외 (blog-personas §3.5)

**허용되는 본문 이미지 4종**:
1. HTML+Chrome headless 인포그래픽 (§4.10.1) — `script/infographic-templates/` 31종 카탈로그
2. matplotlib/Mermaid 정보 차트 (§4.10, §4.11)
3. 실제 스크린샷 (§4.8.3) — 공식 페이지/대시보드 캡처. figcaption에 "출처: {플랫폼명}, {캡처 일자}" 필수
4. 1차 출처 실사진 또는 stock 라이선스 사진 — figcaption에 "출처: {기관/플랫폼}, {연도}" 또는 "(이미지: {라이선스/출처})" 필수

**figcaption ↔ 이미지 일치 룰 (AC-룰-2, 위반 시 미디어 영역 −10)**:
- figcaption에 "출처:", "자료:", 기관명(식약처/통계청/Statista 등), 연도(YYYY), 통계 수치가 포함되는 경우, 해당 이미지는 그 출처의 데이터를 직접 시각화한 인포그래픽/차트여야 함
- 인물·풍경·라이프스타일 사진/일러스트에 통계 출처 표기 금지
- 사진/일러스트는 figcaption 형식 `"이미지: {라이선스/출처}"` 또는 `"예시 이미지 (생성형 AI)"` 만 허용
- AI 일러스트 본문 사용 자체가 금지되므로 AI 일러스트 + 출처 mismatch는 이중 차단

**자동 검증**:
- `script/audit-body-images.mjs`가 본문 `<img>` src의 `saved-images/` 매칭 + 1792×1024 dim 매칭 + figcaption 출처 인용 패턴을 검출
- `script/audit-blog-image-quality.mjs`가 합산 보고서 생성 + 위반 글의 미디어 영역 점수 산정

**대체 절차**:
- 기존 codex 인물 일러스트가 본문에 있는 글은 §4.8.3 스크린샷 또는 §4.10 인포그래픽/차트로 대체. 대체 자산이 없으면 `<figure>` 블록 자체 삭제 (단 §4.8.4 최소 이미지 ≥ 3 충족 필수)
- 제거된 codex 일러스트 webp 자산은 `.recycle/legacy-ai-illustrations/` 로 이동 (즉시 삭제 금지)

### 4.9 codex 일러스트 시각 검증 강제 게이트 (CRITICAL — 미통과 시 publish 차단)

codex 생성 직후 **반드시 Claude multimodal Read tool로 시각 검증** (publish 또는 draft 저장 전 강제 게이트). 위반 시 write 단계(blog/write.md) Phase 5에서 진행 중단 + 사용자 보고 (cron 모드면 Slack 실패 알림).

**검증 체크리스트** (모두 통과해야 합격):
1. **의도 매칭**: 프롬프트에서 요구한 주체·구도·맥락이 실제로 이미지에 있는가
2. **AI 실패 신호 없음**:
   - 손가락 6개 이상 / 손이 기형
   - 얼굴 일그러짐 / 눈 비대칭 / 좌우 다른 표정
   - 깨진 텍스트 (한국어·영어 모두) — 안 박았어야 함
   - 비정상 비례 (다리 3개, 팔 합쳐짐 등)
3. **톤앤매너 일치** (§4.8): photorealistic, brand color tone, 한국 맥락
4. **비율 정확**: 요청한 1792×1024 (16:9) 또는 다른 명시 비율
5. **메시지 가치**: 글 H1/H2 맥락에 도움이 되는가 (의미 없는 추상 X)

**실패 시 재생성 절차** (최대 5회):
- **기존 파일 덮어쓰기 금지**. `{N}-{purpose}-v2.png`, `-v3.png`, ... 로 새로 저장
- **프롬프트 동일 재실행 금지**. 매번 프롬프트 변형:
  - 시도 2: 실패 원인을 명시적으로 부정 (예: "without distorted hands", "without text in image")
  - 시도 3: 구도·각도 변경 (close-up → wide shot, side angle → front)
  - 시도 4: 주체·배경 단순화 (인물 → 객체 중심, 복잡한 배경 → 단색)
  - 시도 5: 다른 visualization 방향 (사진 → 가까운 photorealistic 인포그래픽 등)
- 5회 후에도 실패 → **발행 중단** 사용자 보고. 재활용 fallback 없음

**구현 가이드**: write 단계(blog/write.md) Phase 5에서 codex 호출 → Read tool로 PNG 평가 → 실패면 프롬프트 변형 후 codex 재호출 → 통과한 버전을 `_draft.images[N].file`로 등록.

**강제 게이트 (CRITICAL — 위반 시 publish 차단)**:
- Phase 5에서 codex로 생성한 **모든** 일러스트는 위 5개 체크리스트 모두 통과해야 다음 phase 진입 가능
- 5회 재생성 후에도 통과 못 한 일러스트가 있으면:
  - 사용자 모드(`/blog create [<시드>]`): 사용자 보고 + 결정 받기
  - **cron 자동 모드(`/blog create auto`): 해당 글 발행 중단 + Slack 실패 알림 + status JSON `{"status":"failed","phase":"image-verify","error":"..."}` 출력**
- 게이트 결과를 `tmp/image-verify-{slug}.md`에 기록 (어떤 일러스트가 N회 시도 후 통과/실패)

**"의도 매칭" 검증 강화 룰**:
- 글 H1/H2 맥락이 시각적으로 직접 드러나는가? 추상적인 generic 사진(카페 분위기, 폰 잡는 손 등)은 무의미 → 실패 처리
- 정보 전달이 필요한 이미지인데 텍스트 라벨이 없으면 무조건 실패 → §4.10에 따라 matplotlib/Mermaid로 재작성

### 4.9.1 인포그래픽 Reviewer (독립 sub-agent) — 본문-데이터 일치 검증

`render-infographic.mjs`로 생성한 인포그래픽(≤2000px라 Claude Read 가능)은 별도 sub-agent가 본문 데이터와 시각화 정합성을 검증한다.

**호출 위치 (work 하네스 통합)**:
- `/work` 또는 `/spec` 하네스의 **Reviewer 단계**에서 자동 호출 (Plan → Reviewer ↔ Builder → Evaluator 흐름의 Reviewer)
- `/blog` 워크플로우의 **Phase 5 codex 검증 직후** + **Phase 6 audit 단계(blog/audit.md) Evaluator 단계** 양쪽 게이트로 호출
- 본 6항목 + AC-감사-1 자동 검사 항목(width<1200, AI 일러스트, figcaption mismatch, 최소 이미지 ≥ 3, 레거시 식별자 0건)은 같은 호출 사이클에서 통합 보고된다 (`audit-blog-image-quality.mjs` 합산 보고서)

**인포그래픽 Reviewer (sub-agent로 즉시 실행)**:

평가 대상:
- 인포그래픽 산출물 (`wp-content/drafts/images/{slug}/*.webp`, dimension ≤ 2000px이라 Read 가능)
- 글 본문 (`wp-content/posts/draft-{slug}.md` 또는 `{id}.md`)
- 인포그래픽 HTML 소스 (`wp-content/drafts/images/{slug}/*.html`)

검증 항목 (모두 통과해야 합격):

1. **차원 한계 통과** — `file <path>` 결과 width·height 둘 다 ≤ 2000px (§4.10.4 룰). 위반 시 ❌
2. **본문-시각 데이터 일치** — 인포그래픽 안에 표시된 수치·항목·매트릭스 점수가 본문(비교 표, 정의 단락, 시나리오)의 실제 값과 일치하는가. 예: 인포그래픽이 "Sora 영상품질 5점"인데 본문 비교 표에 "Sora ★★★ 3점"이면 ❌
3. **데이터 출처 표기 일치** — 인포그래픽 caption·footer의 출처(예: "[2차 분석] 2024-2026 자체 조사")와 본문 인용 라벨이 일관된가
4. **일러스트 자산 누락 없음** — 시각적으로 빈 박스가 보이는가 (img src 경로 오류로 일러스트가 누락된 채 캡처되어 그대로 발행되는 사고 패턴). Read tool로 시각 확인 + Chrome stderr `ERR_FILE_NOT_FOUND` grep
5. **alt 정보량** — figcaption + img alt 합쳐서 ≥ 80자, 인포그래픽 안의 핵심 수치·항목이 alt에 텍스트로 들어가 있는가 (Read 불가 환경의 LLM·스크린리더 대응)
6. **§4.10.3 다양성** — 같은 주제 클러스터에서 연속 2편이 같은 템플릿을 쓰지 않았는가 (wp-content/posts/*.md grep)

**실패 시 재생성**:
- (2)·(3) 데이터 불일치 → 인포그래픽 HTML 안 SAMPLE_DATA 교체 후 `render-infographic.mjs` 재실행
- (4) 일러스트 누락 → img src 경로 점검 (§4.10.1 src 경로 룰), 재렌더 + WP 미디어 재업로드 + S3 cp
- (5) alt 부족 → figcaption·alt 재작성

**Reviewer 출력 형식** (`tmp/infographic-review-{slug}.md`):
```markdown
| 항목 | 결과 | 인용 |
|---|---|---|
| 차원 한계 ≤2000 | ✅ 1200×1979 | file output |
| 본문-시각 일치 | ❌ Sora 영상품질 (인포 5점 / 본문 ★★★ 3점) | line N |
| 출처 표기 일관 | ✅ | … |
| 일러스트 누락 | ✅ 4장 모두 표시 | … |
| alt 정보량 | ✅ 152자, 매트릭스 5종 포함 | line 45 |
| 템플릿 다양성 | ✅ tools-comparison 정본, 직전 글은 steps-guide | grep 결과 |
| 종합 | ❌ 재생성 필요 |
```

**호출 예시**:
```
인포그래픽 Reviewer에게 위임 (Agent tool, subagent_type=general-purpose):
- 평가 파일: wp-content/drafts/images/{slug}/infographic.webp + .html + 글 draft md
- 정본: asset-images.md §4.9, §4.10.0~4.10.4
- 도구: Read (webp, ≤2000px이라 차원 한계 통과), Bash (file, grep)
- 출력: tmp/infographic-review-{slug}.md
- 추측 금지. 본문 라인 인용 + 인포그래픽 시각 인용 (Read 통과 시) 모두 필수
- Pre-flight 없이 즉시 실행
```

**재시도 한도 + 강제 게이트 (CRITICAL — 위반 시 publish 차단)**:

- 최대 **3회** 재생성 시도 (HTML 데이터·src 경로·alt·다양성 fix → render-infographic.mjs 재실행 → Reviewer 재호출)
- 모든 6항목(차원·데이터 일치·출처·일러스트 누락·alt·다양성) 통과해야 다음 phase 진입 가능
- 3회 후에도 미통과:
  - 사용자 모드: 사용자 보고 + 수동 수정 옵션 제시
  - **cron 자동 모드(`/blog create auto`): 해당 글 발행 중단 + Slack 실패 알림 + status JSON `{"status":"failed","phase":"infographic-verify","error":"잔존 결함 항목"}` 출력**
- 추가 정적 감사(`audit-infographic-visual.mjs`, §4.10.7) **별도로 통과 필수** — high/medium risk 발견 시 별도 fix 사이클

**시각 검증 두 단계 (모두 통과 필수)**:

| 단계 | 도구 | 검출 | 차단 |
|---|---|---|---|
| (a) 인포그래픽 Reviewer (sub-agent, Claude Read) | multimodal vision | 본문-데이터 불일치, 빈 박스, 시각 결함, 색상 이상, 구도 깨짐, alt 정합 | 3회 후 미통과 시 발행 차단 |
| (b) 정적 HTML 감사 (audit-infographic-visual.mjs) | 정적 분석 | wrap 위험, 금지 색상(#999), 폰트 미스매치, footer 누락 | high risk 발견 시 발행 차단 |

(a)와 (b)는 보완 관계. (b)는 빠르게 wrap·색상 검출, (a)는 픽셀 결과의 의미적 검증.

### 4.10 정보가 필수인 이미지는 codex 금지 — matplotlib/Mermaid 정본

**텍스트·수치·라벨이 정보 전달의 핵심인 이미지**는 codex로 생성하지 않는다. 이유:
- AI 영상 도구는 텍스트 렌더링이 약함 → 라벨이 깨지거나 mock-up처럼 빈 막대만 생성
- "텍스트 오버레이 금지"(§4.8) 룰 때문에 그래도 만들면 정보 가치 0인 추상 이미지가 됨
- AI가 수치를 환각해서 잘못된 데이터 생성 위험

**codex 금지 이미지 종류** (반드시 matplotlib/Mermaid):
- 도구·서비스 비교표 (Tool A vs B vs C)
- 통계 차트 (막대·선·파이·산점도)
- 표·매트릭스 (행·열 라벨 필수)
- 다이어그램 (시스템 구조, ER, 시퀀스)
- 타임라인·로드맵

**codex 허용 이미지 종류**:
- 인물·풍경 사진형 (한국 자영업자, 매장 내부, 마케터 작업 모습)
- 제품·소품 클로즈업
- 분위기·무드 컷
- **단, 글 H1/H2 맥락이 시각적으로 명확히 드러나야 함** — 추상적 generic 이미지는 무의미. 예: "AI로 릴스 만드는 글"의 본문 이미지면 화면에 AI 영상 도구 인터페이스가 보이거나, 노트북에 영상 생성 진행 막대가 보이는 등 구체적 단서 필요.

### 4.10.0 블로그 글 상단 인포그래픽 위치 (정본)

**모든 블로그 글은 다음 상단 구조를 갖는다**:

```
1. TL;DR (한눈에 보는 핵심 5가지) ← 강조 헤딩 + 5개 bullet
2. 인포그래픽 (한눈 요약 이미지) ← 글의 핵심을 시각화한 1장
3. 권위 출처 blockquote (선택, 강한 1차 출처 인용)
4. H2 본문 시작
```

**원칙**:
- 인포그래픽은 글 전체 핵심을 한 장에 응축 (도구 비교, 통계, 단계, 비교, 시나리오 등 글 주제에 맞게)
- TL;DR 텍스트와 인포그래픽이 시각·텍스트 더블 채널 — 스크롤만 해도 글 정수 파악
- audit 본문 이미지 ≥ 2장 충족을 위해 본문 중간에 1장 더 배치 (페르소나 시나리오 또는 알고리즘 신호 섹션 등)

### 4.10.1 인포그래픽은 HTML + Chrome headless 정본 (matplotlib 사용 지양)

**matplotlib는 한계가 명확하다** — 폰트 렌더링, 색감, 일러스트 결합, 카드 레이아웃 어떤 면에서도 web 디자인 수준에 못 미친다. 매번 "누가 봐도 Python 차트" 결과가 나옴.

따라서 **블로그 인포그래픽 정본은 HTML+Tailwind+Pretendard를 Chrome headless로 PNG 캡처**한다.

**워크플로우**:
```bash
# 1. HTML 작성 (script/infographic-templates/ 카탈로그 31종에서 선택)
# 2. 일러스트는 wp-content/drafts/images/{slug}/ 에 codex 생성 + 검증 (§4.9)
# 3. Chrome headless 렌더링 (폭 1200 정본):
node script/render-infographic.mjs \
  wp-content/drafts/images/{slug}/infographic.html \
  wp-content/drafts/images/{slug}/infographic.webp \
  --width=1200
# (옵션: --max-height=2000 --bg=#F6F8FB --bottom-padding=32)
```

**디자인 원칙** (인포그래픽 정본 스타일, 2026 모바일 우선 — seo-policy §1.6 외부 참고 9, 11):
- **가로 1200 고정, 세로는 콘텐츠 fit (CSS dim max 2000)** — render 스크립트가 폭 1200으로 캡처 후 하단 배경색 영역 자동 trim. DPR=2 적용 시 실제 webp dim은 2400×N (asset-images §4.10.4). 모바일 viewport 414px 기준 ×34% 축소 → 본문 24px이 약 8px로 표시되지만 Retina 디스플레이가 2x scale로 받아 선명. 데스크탑 viewport에서는 prose 컨테이너 100% 풀폭(최대 1240px). 본문 인포그래픽 폭 정본은 **1200px** — `render-infographic.mjs` default. hero와 동일 폭으로 통일해 prose 100% 풀폭 보장 (AC-룰-3 정합).
- **폰트 사이즈 표준** (폭 1200 기준):
  - H1 / 헤더 큰 제목: **72-88px** font-black
  - H2 / 섹션 제목: **40-48px** font-bold
  - H3 / 서브 제목: **30-36px** font-bold
  - 본문 / 카드 텍스트: **22-26px**
  - label / chip / 보조: **18-22px**
  - stat-value (큰 강조 수치): **88-120px** font-black
  - stat label: **18-22px**
- **패딩·여백 표준** (폭 1200 기준):
  - main padding: `py-16 px-12`
  - 카드 padding: `p-10`
  - 카드 간격: `gap-8` 또는 `mb-8`
  - 헤더 일러스트: 폭 400px (폭 1200 기준 33%)
- **레이아웃 (폭 1200 CRITICAL)** — 1200 viewport는 폭이 넓어 grid 4열까지 자연 수용:
  - **헤더 stack 순서**: ① 카테고리 뱃지/chip (최상단) → ② 일러스트 (가운데, `flex justify-center mb-6`) → ③ H1 → ④ 부제. 일러스트가 뱃지보다 위면 글 정체성·맥락 표시가 늦어 첫 화면 인상 약함
  - **헤더 좌우 split 허용 (폭 1200)**: 일러스트 400px + 텍스트 영역 800px → H1 자연 배치 가능. 좁은 viewport(600) 한정 금지였던 룰은 폭 1200에서 해제
  - **4지표·다중 데이터 카드**: `grid-cols-4` 자연 (각 카드 가용 폭 약 250px). 5개 이상이면 `grid-cols-3` + 마지막 row centered, 또는 `grid-cols-2` 2×3
  - **추천 조합 카드**: `grid-cols-2` 또는 `grid-cols-3` 모두 가능. 각 카드 내부 horizontal stack 충분히 들어감
  - **푸터**: 좌우 split 자연 (로고·이름 좌, 출처·날짜 우)
  - **5컬럼 매트릭스 표**: 셀 크기 자연 크게(`w-16 h-16`) + 폰트 22px + th 18px
  - **헤더 일러스트**: stack 시 폭 400px 가운데, split 시 폭 400px 좌측
  - **모바일 stack 보조 룰**: 글 본문 prose 컨테이너가 414px 미만으로 표시될 때, CSS aspect-ratio가 자동 축소된다. 폰트 표준이 폭 1200 기준 큰 사이즈라 ×0.34 축소 후에도 가독 (24px → 8.2px Retina 2x → 16.4px 디스플레이 픽셀)
- **정보 밀도 축소**: 한 인포그래픽에 5-7개 핵심 요소만. 더 많으면 §4.10.5 분할 룰 적용.
- **Premium minimalism (2026 핵심)**: "보기 좋게"가 아닌 "즉시 명확하게" 우선. 색·요소·텍스트 모두 정보 전달에 직접 기여해야 함. 장식만 있는 요소 금지.
- **Data storytelling**: 모든 데이터 X, **핵심 1-3개 데이터 강조**. 나머지는 요약. AI 인용·LLM 추출 시 핵심 수치가 명확해야 함.
- **Human-centered design**: 과한 기술 디자인 backlash. 일러스트는 사용자 페르소나·시나리오 중심 (소상공인 사장님·1인 마케터·인플루언서 등). codex 톤앤매너 preamble (§4.8) 적용.
- **Timeline format 강세**: 변화·진화·과정·역사를 다루는 글이라면 **타임라인 인포그래픽 우선** (§4.10.3 카탈로그 event-timeline 또는 steps-guide). 시간 기반 스토리텔링은 인간이 가장 쉽게 이해.
- **원본 데이터 우선 (§1.7 E-E-A-T 2026 연결)**: 인포그래픽 안 수치는 작성자가 직접 수집·측정한 1차 데이터 또는 1차 출처(공식 발표·System Card) 인용. 스톡 이미지·일반 추정치 금지.
- **Pretendard 폰트** (CDN: `https://cdn.jsdelivr.net/gh/orioncactus/[email protected]/dist/web/static/pretendard.css`)
- **Tailwind CDN** (`https://cdn.tailwindcss.com`)
- **컬러 시스템**:
  - primary: `#3B70FF`
  - strong: `#2553D7`
  - soft: `#F1F5FF`, `#E8F1FF`
  - 배경: `#F6F8FB`
  - 카드 배경: `#FFFFFF` + `shadow-[0_2px_12px_rgba(0,0,0,0.04)]`
  - 보조: `#FF6B35` (warm), `#F5EFE0` (베이지)
- **텍스트 색상 (WCAG AA 이상 필수)**:
  - body / 본문: `#0A0A0A` (default, 거의 검정)
  - secondary text / 카드 안 설명: `#444` (contrast 9.74:1, AAA) — 이전 `#666` 사용 시 모바일 작은 글자에서 흐림
  - label / chip / footer 보조: `#555` (contrast 7.46:1, AAA) — 이전 `#999` (2.85:1) 사용 금지
  - 어두운 배경(#1A3DA8, #FF6B2C) 위 보조 텍스트: `#D6E2FF` 또는 `#FFEEDC` (밝게) — `#A5C0FF`·`#FFD9C2` 같은 낮은 contrast 사용 금지
  - **금지 색상**: `text-[#999]`, `text-[#A5C0FF]`, `text-[#FFD9C2]`, `text-[#B6BBC5]` 등 모바일 축소 시 가독 어려운 흐린 톤
- **구조**: 헤더(제목 + 일러스트) + 데이터 카드 섹션들 + 추천 카드 + 푸터(snshelp 로고)
- **일러스트**: codex로 생성한 modern flat 스타일 (§4.8 preamble 적용)
- **둥근 모서리**: `rounded-[28px]` ~ `rounded-[32px]` (모바일 친화)
- **공간**: 충분한 여백, 섹션 간 gap-6 이상

**템플릿 위치**: `script/infographic-templates/{용도}-template.html` — 신규 글마다 복사 후 데이터 변경.

**참고 작품**: `wp-content/drafts/images/ai-reels-infographic/` (인포그래픽 완성본 + 일러스트 4장 — tools-comparison 정본 기준점)

**img src 경로 규칙 (CRITICAL)**:

HTML 안의 `<img src="...">`는 **HTML 파일이 있는 폴더 기준 상대 경로**로 작성한다. Chrome headless는 `file://`로 HTML을 열기 때문에 경로가 잘못되면 일러스트가 빈 박스로 캡처되고, 그게 그대로 WebP로 변환·발행되어 운영 글에 노출된다.

- ✅ **올바른 형식 (같은 폴더)**: `<img src="./illust-1-hero.png">` 또는 `<img src="illust-1-hero.png">`
- ✅ **올바른 형식 (자산 라이브러리 참조)**: `<img src="../../wp-content/illustrations/{name}.webp">` — 단, HTML이 `script/infographic-templates/`에 있을 때
- ❌ **금지**: `<img src="../wp-content/drafts/images/{같은폴더명}/illust-1.png">` — HTML이 이미 그 폴더 안에 있는데 다시 `../wp-content/...`로 시작하면 이중 경로(`drafts/images/wp-content/drafts/images/...`)가 되어 404
- ❌ **금지**: `<img src="/wp-content/...">` (절대 경로) — `file://` 컨텍스트에서 `/wp-content`는 루트 파일시스템을 가리켜 항상 실패

**렌더 후 검증**: render-infographic.mjs 실행 직후 산출물 file size가 비정상적으로 작거나(< 50KB), Chrome stderr에 `Failed to load resource: net::ERR_FILE_NOT_FOUND`가 보이면 즉시 src 경로 점검. 발행 후에는 CDN(assets.helpsns.com) 캐시까지 박혀 복구 시 미디어 재업로드 + 본문 src/id/dimension 수동 갱신이 필요하므로 발행 전에 막아야 한다.

**S3 파일 덮어쓰기 시 CloudFront invalidation 필수 (CRITICAL)**:

같은 S3 key로 파일을 덮어쓴 경우(예: 인포그래픽 디자인 수정 후 같은 filename으로 재업로드) CloudFront edge 캐시가 옛 파일을 30일까지 노출한다. **반드시 invalidation 실행**:

```bash
# snshelp-resource-bucket의 CloudFront Distribution ID
aws cloudfront create-invalidation --distribution-id E3EIN06IFGMYRE \
  --paths '/wp-content/uploads/2026/05/<filename>.webp'
# 또는 폴더 단위
aws cloudfront create-invalidation --distribution-id E3EIN06IFGMYRE \
  --paths '/wp-content/uploads/2026/05/*'
```

검증: `curl -sI <CDN URL>` 응답의 `last-modified` 헤더가 S3 cp 직후 시각과 일치 + `x-cache: Miss from cloudfront`.

**Distribution ID 발견 방법** (룰 추가 시점 환경):
```bash
aws cloudfront list-distributions --query 'DistributionList.Items[?Origins.Items[0].DomainName==`snshelp-resource-bucket.s3.ap-northeast-2.amazonaws.com`].Id' --output text
```

이 룰은 신규 파일(다른 filename) 업로드에는 적용 안 됨 (cache miss → S3 fetch가 자동). 동일 path 덮어쓰기에만 적용.

**WP 미디어 수동 업로드 시 S3 cp 필수 (CRITICAL)**:

WP `/media` POST는 origin Apache(`http://52.79.247.124/wp-content/uploads/...`)에만 파일을 저장한다. 정본 도메인 `assets.helpsns.com`(CloudFront + S3)은 별도 S3 bucket을 origin으로 하므로 **자동 sync가 없다**. WP 업로드와 S3 cp를 **한 쌍으로 실행**하지 않으면 본문에서 새 이미지 URL이 403으로 깨진다.

신규 글 발행은 `wp-publish-new.mjs`가 자동 처리 (§5). 수정·복구 등으로 **수동 업로드를 할 때**는 반드시 두 명령을 함께 실행:

```bash
# 1. WP REST 미디어 등록 (id, source_url 받음)
curl -X POST "$WORDPRESS_BLOG_URL/media" \
  -H "Authorization: Basic $WORDPRESS_BLOG_TOKEN" \
  -H "Content-Disposition: attachment; filename=NEW.webp" \
  -H "Content-Type: image/webp" \
  --data-binary @/path/to/NEW.webp

# 2. S3에도 동일 path로 cp (이게 빠지면 assets.helpsns.com에서 403)
aws s3 cp /path/to/NEW.webp "s3://$S3_BUCKET/wp-content/uploads/YYYY/MM/NEW.webp" \
  --content-type image/webp --cache-control "public,max-age=2592000"

# 3. 글 본문의 img src/id/class/width/height를 새 값으로 교체 후 wp-push.mjs
```

검증: 업로드 직후 `curl -sI https://assets.helpsns.com/wp-content/uploads/YYYY/MM/NEW.webp` 가 HTTP 200이어야 함. 403이면 S3 cp 누락.

### 4.10.2 일러스트 자산 — 매번 신규 생성 (인포그래픽 안 디자인 요소 한정)

블로그 글의 일러스트 자산 운용 룰은 두 갈래로 나뉜다.

**(a) 인포그래픽 HTML 내부 디자인 요소 (허용)**:
- 인포그래픽 HTML 안 아이콘 풍 일러스트, 작은 보조 그림, 헤더 일러스트(400px 폭)는 §4.10.1 디자인 원칙에 따라 사용 가능
- 위치: `wp-content/drafts/images/{slug}/{N}-{purpose}.png` (글 단위 디렉토리)
- §4.8 톤앤매너 preamble + §4.9 검증 5회 통과 필수
- 5회 실패 시 발행 중단 (라이브러리 fallback 없음)
- 캡션은 글 맥락에 맞게 매번 작성

**(b) 본문 `<figure>` 단독 인물·장면 일러스트 (금지 — §4.8.6 정합)**:
- 본문 `<figure>`로 단독 삽입되는 codex 인물/장면 일러스트는 금지. `script/infographic-templates/` 카탈로그 또는 §4.8.3 스크린샷 또는 1차 출처 사진으로 대체
- 페르소나 일러스트 `persona-{slug}.webp`(author 페이지·byline 노출용)는 본 룰 적용 범위에서 **제외** (blog-personas §3.5 정합). byline·author page 자산이며 본문 단독 일러스트와 구분

### 4.10.3 인포그래픽 카탈로그 (총 31종) + 다양성 룰

`script/infographic-templates/` 카탈로그 전 31종. 글 주제에 맞는 것을 선택. 폭 1200 정본 viewport (`<main class="w-[1200px]">`, 높이 가변).

**기존 15종**:

| 글 유형 | 템플릿 파일 | 핵심 컴포넌트 |
|---|---|---|
| 도구·서비스 비교 (A vs B vs C) | `tools-comparison-template.html` | 헤더 + 매트릭스 + 추천 조합 카드 |
| 단계별 가이드 (How-to·워크플로우) | `steps-guide-template.html` | 헤더 + 단계 카드 + 시간·도구 chip |
| 통계·트렌드 (시장 데이터·인사이트) | `stats-insights-template.html` | 헤더 + 빅 넘버 3종 + 막대 차트 + breakdown |
| 체크리스트 (Do/Don't, 함정) | `checklist-template.html` | 헤더 + Do/Don't 좌우 6+6 |
| 이벤트·뉴스 (정책 변경, 사태) | `event-timeline-template.html` | 헤더 + 타임라인 + 영향·대응 |
| Style T07: hero-stat | `style-T07-hero-stat.html` | 헤더 stat hero 변형 |
| Style T08: matrix | `style-T08-matrix.html` | 매트릭스 카드 |
| Style T09: insight | `style-T09-insight.html` | 인사이트 카드 |
| Style T10: dashboard | `style-T10-dashboard.html` | 대시보드 풍 |
| Style T11: phases | `style-T11-phases.html` | 단계 phases |
| Style T12: scorecard | `style-T12-scorecard.html` | 스코어카드 |
| Style T13: comparison | `style-T13-comparison.html` | 비교 |
| Style T14: persona | `style-T14-persona.html` | 페르소나 카드 |
| Style T15: data-deep | `style-T15-data-deep.html` | 데이터 심층 |
| Style T16: roadmap | `style-T16-roadmap.html` | 로드맵 |

**신규 16종 (1차 8 + 2차 8)**:

| 템플릿 파일 | 용도 | 핵심 placeholder/SAMPLE_DATA |
|---|---|---|
| `mini-chart-bar-template.html` | 단순 막대 차트 본문 보조 | `{{LABELS}}`, `{{VALUES}}` (3-7쌍) |
| `mini-chart-trend-template.html` | 단순 라인 트렌드 | `{{X_LABELS}}`, `{{Y_VALUES}}` (5-10쌍) |
| `pricing-table-template.html` | 가격·요금제 비교 | `{{PLANS}}` (3-4개, name/price/features) |
| `formula-explained-template.html` | 공식·계산 절차 시각화 | `{{FORMULA}}`, `{{STEPS}}` (3-5개) |
| `mistake-vs-fix-template.html` | 실수 vs 개선 좌우 비교 | `{{MISTAKES}}`, `{{FIXES}}` (3-5쌍) |
| `industry-stat-card-template.html` | 산업 통계 1장 강조 | `{{BIG_NUM}}`, `{{LABEL}}`, `{{SOURCE}}`, `{{CONTEXT}}` |
| `quote-card-template.html` | 1차 출처 인용 카드 | `{{QUOTE_TEXT}}`, `{{ATTRIBUTION}}`, `{{SOURCE_URL}}` |
| `flowchart-mini-template.html` | HTML 플로우차트 (Mermaid 없이) | `{{NODES}}` (3-7개), `{{EDGES}}` |
| `comparison-2col-template.html` | 좌·우 2단 비교 | `{{LEFT_TITLE}}`, `{{LEFT_BULLETS}}`, `{{RIGHT_TITLE}}`, `{{RIGHT_BULLETS}}` |
| `comparison-3col-template.html` | 3-way 비교 (3개 상품/플랜/방법) | `{{COLS}}` (3개, title/bullets) |
| `timeline-vertical-template.html` | 수직 타임라인 | `{{MILESTONES}}` (5-7개 year/event/detail) |
| `pros-cons-card-template.html` | 장점/단점 2단 카드 | `{{PROS}}` (3-5개), `{{CONS}}` (3-5개) |
| `step-by-step-template.html` | 1-2-3-4 단계 진행형 | `{{STEPS}}` (3-5개, icon/title/desc) |
| `pie-chart-mini-template.html` | 원형 차트 | `{{SEGMENTS}}` (3-5개, label/value/color) |
| `ranked-list-template.html` | 순위 리스트 (1-5 또는 1-10) | `{{ITEMS}}` (5-10개, rank/name/score/reason) |
| `before-after-template.html` | 이전/이후 대비 | `{{BEFORE_LABEL}}`, `{{BEFORE_VALUE}}`, `{{AFTER_LABEL}}`, `{{AFTER_VALUE}}` |

**스키마 정본**: `script/infographic-templates/schema.json` — 각 템플릿의 placeholder + SAMPLE_DATA + 길이 제약(JSON Schema draft-07) 정본. 신규 글 본문 인포그래픽 생성 시 schema 검증 통과 필수.

**공통 사양**:
- `<main class="w-[1200px] mx-auto py-16 px-12">` viewport (높이 가변, max CSS dim 2000 — §4.10.4)
- `<!-- SAMPLE_DATA: {...} -->` 주석으로 sample data 명시
- footer: `<img src="../../wp-content/illustrations/snshelp-logo.webp" alt="snshelp 로고" class="w-11 h-11" />` 정본 (Footer 로고 단일 정본은 §4.10.3 본 항목)
- `<figure class="wp-block-image size-full">` 또는 `size-large` 래퍼로 결과 사용 (global.css `figure:not(.wp-block-image)` 50% 룰 회피)
- §4.10.6 wrap 가드 통과
- AC-룰-6 텍스트 검증 통과 (§4.10.8)
- `audit-infographic-templates.mjs` 자동 검증 통과

**같은 템플릿 반복 금지 룰**:
- 같은 주제 클러스터(예: 인스타 마케팅)에서 **연속 2편 같은 템플릿 사용 금지**
- 글 유형에 맞는 템플릿을 우선 선택 (도구 비교 → tools-comparison, How-to → step-by-step…)
- 데이터·색상·일러스트는 자유롭게 변경. 헤더 chip / 액센트 컬러(`#3B70FF` / `#FF6B2C` / `#0A0A0A`) / 일러스트 조합으로 동일 템플릿 안에서도 시각적 차이 확보

**HTML 내 SAMPLE_DATA 마커**: 각 템플릿 HTML은 `<!-- SAMPLE_DATA: ... -->` 주석으로 교체 지점을 표시. 신규 글에 적용할 때 해당 위치만 데이터·일러스트·색상 변경.

**일러스트 자산 연결**: 템플릿은 `wp-content/illustrations/` 카탈로그의 자산을 참조 (절대 경로 아님, 상대 경로 `../../wp-content/illustrations/*.webp`). 자산 부족 시 §4.10.2(a) 정책에 따라 codex 보강.

**Footer 로고 (정본, 모든 템플릿 공통 — 단일 정본)**: 인포그래픽 footer 좌측 로고는 `wp-content/illustrations/snshelp-logo.webp` (256×256, favicon-512x512.ico 추출본)를 정본으로 사용. 사각형 배경 div 없이 단독 `<img>`로:
```html
<img src="../../wp-content/illustrations/snshelp-logo.webp" alt="snshelp 로고" class="w-11 h-11" />
```
- 텍스트 "S" placeholder · 색깔 사각형 wrapper 사용 금지. 정본 로고 1개로 통일
- 자산 라이브러리 위치 외 다른 곳(예: `public/favicon/*.ico`)을 인포그래픽에서 직접 참조하지 않는다 (Chrome headless file:// 경로 일관성 + §4.10.1 이중 경로 금지 룰)
- infographic-html.md §1은 본 항목을 단일 정본으로 cross-link

**컴포넌트 라이브러리**: 모든 템플릿이 공유하는 부분(헤더, 카드, 매트릭스, 푸터 등)은 `script/infographic-templates/components/` 에 HTML partial로 분리.

### 4.10.4 차원 한계 룰 — CSS dim ≤ 2000px (audit) / 운영 webp 2x dim 허용 (CRITICAL)

**핵심 분리**: 차원 한계 룰은 **audit 시점(Claude Read multimodal)** 과 **운영 webp(S3 + CF 사용자 노출)** 두 축으로 분리 관리한다. audit는 Claude Read 한계(2000px)를 회피해야 하고, 운영 webp는 Retina/HiDPI 가독성을 위해 2x supersampling이 필요하다.

**룰**:
- **audit 시점**: 인포그래픽 HTML의 **CSS dim**(1x 환산)이 width·height 둘 다 **≤ 2000px**여야 한다. `render-infographic.mjs`가 CSS dim 기준으로 max-height 가드를 적용한다 (기본 max-height=2000은 CSS dim 한계).
- **운영 webp(.webp 산출물)**: **2x dim 허용**. `render-infographic.mjs`는 `--force-device-scale-factor=2`로 캡처 후 다운스케일 없이 그대로 저장하므로 실제 webp dim은 CSS dim의 2배(예: CSS 600×1800 → webp 1200×3600). 이 webp는 audit Read 도구가 아니라 S3 + CloudFront로 사용자에게만 노출되므로 Claude 세션 한계 영향이 없다.

**왜 분리하나**:
- Claude의 Read 도구는 한 변이 2000px을 초과하는 이미지를 거부한다 (응답 자체 실패 → 세션 종료). audit는 이 한계 안에서 동작해야 한다.
- 모바일 viewport + Retina 2x 디스플레이 = 실제 디스플레이가 폭 1200×N 픽셀 요구. 1x dim webp는 비정수 다운스케일 보간으로 글자가 깨진다. 2x dim webp를 저장하면 디스플레이가 자동 2x scale로 선명하게 표시.
- 운영 webp는 사용자만 보는 산출물 → audit Read 도구 한계와 무관.

**폭 1200 정본 + DPR=2 webp dim**:
- 1x CSS dim 정본: 폭 **1200px** (`<main class="w-[1200px]">`)
- 운영 webp 실제 dim: 2400 × N (DPR=2 적용) — Claude Read 한계 2000 초과하므로 .webp 직접 Read 금지
- CSS dim 한계 ≤ 2000 룰은 **세로 기준**으로 유지 (audit가 1x dim PNG 미리 렌더로 검증 가능)
- 콘텐츠가 CSS 세로 2000을 초과하면 §4.10.5 분할 룰 적용

**어떻게 적용하나** (render-infographic.mjs 자동 처리):
1. **DPR=2 캡처**: Chrome `--force-device-scale-factor=2`로 캡처 → PNG 임시 파일이 2x 픽셀 (폭 2400)
2. **fit-to-content 자동 trim**: sharp로 raw 픽셀 스캔 → 하단 배경색(`#F6F8FB`) 영역을 아래에서 위로 탐지해 자동 제거. 흰 여백 안 남음
3. **하단 padding**: trim 후 32px(설정값) × DPR 만큼 여백 유지
4. **CSS dim 가드**: cropHeight / DPR 환산이 max-height(=2000) 초과면 exit 1 + 에러 (audit 회피)
5. **2x dim webp 그대로 저장**: 다운스케일 없이 sharp `.webp({quality, effort:6})` 호출 → 실제 webp dim = CSS dim × 2
6. **콘텐츠가 CSS 2000 한계 안에 안 들어가면**:
   - HTML 단에서 패딩·여백·폰트 사이즈 압축 (py-12 → py-8, p-12 → p-8)
   - 카드 간 mb 줄이기 (mb-6 → mb-4), 섹션 압축 (KEY TAKEAWAY 한 줄로)
   - **그래도 안 되면 2장으로 분할** (§4.10.5 분할 룰)

**Trim 동작 가정**: body bg가 `#F6F8FB`(또는 `--bg=` 인자) 단일 색이어야 trim이 정확. 헤더·카드는 라운드 박스라 카드 외부는 body bg가 보이는 구조여야 한다.

**옵션 (필요 시)**:
- `--max-height=N` (기본 2000) — **CSS dim 기준 max-height**. 줄이면 콘텐츠가 많은 글에서 잘림
- `--bg=#XXXXXX` (기본 `#F6F8FB`) — trim 기준색
- `--bottom-padding=N` (기본 32) — trim 후 남길 하단 여백 (CSS px)
- `--dpr=N` / 환경변수 `RENDER_DPR=N` (기본 2) — Chrome capture DPR. 1로 내리면 1x dim webp (Retina 가독성 손실 위험)

**Claude Read 시각 검증 — webp 직접 Read 금지**:

운영 webp는 2x dim이라 1200×3600 같은 크기가 나올 수 있다. **Read 도구가 거부해 세션이 죽으므로 .webp 파일을 직접 Read하지 말 것**. 시각 검증은 다음 두 경로 중 하나로 한다:
1. **렌더 직전 PNG 임시 파일**: `render-infographic.mjs`가 `__tmp.png`/`__trim.png`를 만들고 즉시 삭제. 검증이 필요하면 스크립트를 수정해 임시 PNG를 보존하거나, HTML을 1x DPR로 별도 PNG 렌더 (1x dim ≤ 2000)
2. **HTML 자체 시각 검증**: HTML 파일을 1x DPR로 PNG 렌더해 Read. 운영 webp는 그 위에 자동 2x 적용된 결과로 간주

**시각 검증 강제 게이트 (CRITICAL — 위반 시 publish 차단)**:
- codex 일러스트 생성 직후 → §4.9 시각 검증 게이트 통과 필수
- 인포그래픽 render 직후 → §4.9.1 Reviewer 통과 필수 (1x dim PNG로 검증, .webp 직접 Read 금지)
- cron 자동 발행 (사용자 viewer 없음)은 위 게이트가 유일한 안전망

**Claude 활용 도구**:
- `Read` (multimodal) — **1x dim PNG만** 시각 검증. .webp 직접 Read 금지
- `Bash file <path>` 또는 `sharp metadata` — dimension·인코딩 확인 (file size 비정상 < 50KB 시 일러스트 누락 의심)
- `Bash` — Chrome stderr `ERR_FILE_NOT_FOUND` grep (일러스트 src 경로 사고 검출)

**대량 .webp dim 검증 (audit Read 금지)**:

본문 .webp 일괄 dim 검사가 필요한 경우(예: 글자 있는 webp 중 width < 1000 추출 → 재렌더):
- ❌ `Read` 도구로 webp 호출 (세션 종료 위험, 2x dim 운영 webp가 한계 초과)
- ✅ `sharp metadata` + raw 픽셀만 사용 (Node 스크립트로 dim 측정·분류)
- 처리 흐름: 본문 img 추출 → sharp metadata로 dim 분류 → render-infographic.mjs(짝꿍 HTML) 또는 sharp lanczos3 upscale(HTML 없음)로 2x dim 재렌더 + S3 업로드 + CF wildcard 무효화. **Read 도구 0건**으로 일관 처리하는 Node 스크립트로 수행.

### 4.10.5 인포그래픽 분할 룰 (콘텐츠 양이 단일 인포그래픽 CSS dim 한계 초과 시)

콘텐츠가 폭 1200 + 큰 폰트(§4.10.1)로 단일 인포그래픽 CSS dim ≤ 2000(세로)에 들어가지 않으면 다음 결정 트리를 적용한다. 모든 임계는 **CSS dim 세로 기준** (운영 webp는 DPR=2 적용해 2x dim이지만 분할 결정은 1x CSS dim 기준).

**결정 트리**:

1. **fit 결과 ≤ 2000px** → 단일 인포그래픽 1장, 글 TL;DR 직후 위치 (§4.10.0 정본 구조)
2. **fit 결과 2000-3600px** → **2장 분할 (개요 + 상세)**:
   - 인포그래픽 A: 헤더 + 핵심 데이터 1-2개 — 글 TL;DR 직후
   - 인포그래픽 B: 매트릭스 / 추천 조합 / 페르소나 시나리오 (상세 데이터) — 글 TL;DR 직후 인포그래픽 A 바로 아래 또는 본문 첫 H2 직전
   - 두 장 모두 CSS dim 세로 ≤ 2000px
3. **fit 결과 > 3600px** → **본문 분산 배치 (글 중간중간)**:
   - 글 H2 섹션별로 해당 데이터 시각화하는 작은 인포그래픽 1-2장씩
   - 예: H2 "도구 비교" 직후 → 매트릭스 인포그래픽 (1200×1400), H2 "페르소나 시나리오" 직후 → 시나리오 카드 인포그래픽 (1200×1200)
   - 각 미니 인포그래픽 CSS dim 세로 ≤ 1500 권장 (모바일 스크롤 흐름 자연)

**선택 기준** (작성자가 결정):
- **2장 분할**: 글 주제가 한 가지 큰 비교·결정 흐름 (예: "5종 도구 어떤 걸 쓸까") — 첫 진입에 모든 핵심을 보여주고 싶을 때
- **분산 배치**: 글 주제가 여러 독립 섹션 (예: 함정·시나리오·체크리스트 등 H2가 평행 구조) — 각 섹션에서 시각 강조 필요할 때

**WP 본문 패턴 (2장 분할 시)**:
```
TL;DR (5 bullet)
[wp:image] 인포그래픽 A (개요, 1200×N)
[wp:image] 인포그래픽 B (상세, 1200×N)
[wp:quote] 1차 출처 인용
[wp:heading] H2 1: 정의형
...
```

**WP 본문 패턴 (분산 배치 시)**:
```
TL;DR (5 bullet)
[wp:image] 인포그래픽 A (헤더 hero, 1200×1200 정도)
[wp:quote] 1차 출처 인용
[wp:heading] H2 1: 정의형
...
[wp:heading] H2 2: 비교
[wp:image] 인포그래픽 B (비교 매트릭스, 1200×1400)
...
[wp:heading] H2 3: 시나리오
[wp:image] 인포그래픽 C (시나리오 카드, 1200×1300)
...
```

**자동화 결정 (write 단계 blog/write.md Phase 5)**:
- Phase 5에서 인포그래픽 HTML 생성 후 render 시 CSS dim 세로 측정
- ≤ 2000: 1장
- 2000-3600: 인포그래픽 HTML을 A/B 두 파일로 split (헤더+개요 / 상세 매트릭스)
- > 3600: 본문 H2에 대응하는 미니 인포그래픽 3-4장으로 split, 본문 wp:image 블록 분산 삽입

### 4.10.6 인포그래픽 텍스트 wrap 금지 룰 (CRITICAL — 100점 게이트)

**룰**: 인포그래픽 안 모든 stat-value/headline/단위 텍스트는 **카드 안에서 의도하지 않은 줄바꿈이 발생하지 않아야 한다**. 한 줄에 안 들어가는 텍스트는 **폰트 사이즈 자동 축소** 또는 **cols 자동 감소**로 해결한다.

**왜**: `grid-cols-N`에서 N이 카드 폭 대비 과도하게 크면(예: 폭 1200에서 cols-6 → 각 카드 ~150px) stat-value 88-120px + 한글 단위가 한 줄에 못 들어가 wrap된다. 사람이 만들면 폰트나 cols를 줄여서 회피하지만 자동 생성은 그냥 wrap하므로 시각 결함이 그대로 운영 글에 노출된다. 폰트 사이즈 자동 축소·cols 자동 감소 룰로 차단해야 한다.

**디자인 강제 룰** (폭 1200 기준 재산정):

1. **stat 카드의 grid cols 결정 (폭 1200 기준)**:
   카드 가용 폭 = `1200 / cols - 50px (padding/gap 합산)`
   - **카드 수 1-2개**: `grid-cols-1` (가용 ~1150px) 또는 `grid-cols-2` (가용 ~550px)
   - **카드 수 3개**: `grid-cols-3` (가용 ~350px) — stat-value 88-120px + 단위가 자연 수용
   - **카드 수 4개**: `grid-cols-4` (가용 ~250px) — stat-value ≤ 8자 (AC-룰-6) 한정에서 자연 수용
   - **카드 수 5개**: `grid-cols-5` (가용 ~190px) — stat-value ≤ 5자만, 폰트 자동 축소 단계 필수
   - **카드 수 6개 이상**: `grid-cols-3` 2×3 또는 `grid-cols-2` 3×2

2. **stat-value 폰트 자동 축소 단계 (120 → 96 → 88 → 64)** — 폭 1200 cols 4-5 기준:
   - 5글자 이하 (예: "1,874", "23.5%") → 120px
   - 6-8글자 (예: "1,874억", "100,000") → 96px
   - 9-12글자 (예: "1,874억 원", "234,567,890") → 88px
   - 13글자 이상 → 64px + 카드 stack 고려 (cols 줄이기)
   - AC-룰-6 정합: stat-value ≤ 8자 권장. 9자 이상은 단위 분리·라벨 분리·표현 단축 검토

3. **숫자 + 단위 한 줄 보장**:
   - `<div class="flex items-baseline gap-1">`로 wrap 시 `flex-nowrap` 필수
   - 또는 단위를 숫자 폰트의 55-65% 사이즈로 inline 결합 (`<span style="font-size:0.6em">억 원</span>`)
   - **금지**: 숫자 `<span>` + 단위 `<span>`을 `flex` + `flex-wrap` 또는 줄바꿈 가능 컨테이너에 배치
   - **금지**: stat-value 88-120px 숫자 다음 22-26px 단위를 좁은 카드(< 250px) 안에 가로 배치

4. **헤드라인 (H1·H2) wrap 처리** — 폭 1200 기준:
   - `<br>` 의도적 줄바꿈을 H1 한 줄당 12-20자 기준으로 미리 박을 것 (폰트 72-88px)
   - "글로벌을 휩쓴<br>K-브랜드 4축 공식" 처럼 디자이너가 의도한 줄바꿈만 허용
   - 자연 wrap이 발생하면 폰트 축소(88→80→72) 또는 line-height 조정
   - AC-룰-6 정합: H1 6-28자, H2 4-20자

5. **렌더 후 자동 감사** (`script/audit-infographic-visual.mjs`, §4.10.7):
   - HTML에서 stat-value 텍스트 길이 + 컨테이너 cols + 폰트 사이즈 추출
   - 위 룰 위반 패턴 검출 시 `risk:high` 보고 → 재생성 필수
   - AC-룰-6 폰트 표(H1 72-88, stat-value 88-120)와 정합 검증

**Pre-flight 가이드 (write 단계 blog/write.md Phase 5 / 인포그래픽 작성 시)**:
- 데이터 JSON 작성 직후 위 1-4번 룰을 mental check
- 9자 넘는 stat-value가 3개 이상이면 grid-cols-4·5 사용 금지 (cols-2 또는 cols-3 stack)
- 헤드라인은 미리 `<br>` 위치를 정해 박을 것

**감점 (audit)**:
- 인포그래픽 wrap 결함 검출 → −10 (글 단위)
- wrap 결함이 stat-value(핵심 수치)에 발생 → −15 (정보 전달 실패)
- 같은 글이 audit 보강 루프에서 wrap 결함 재발 → 사용자 보고 의무

### 4.10.7 인포그래픽 시각 감사 스크립트 (`script/audit-infographic-visual.mjs`)

모든 인포그래픽 HTML을 정적으로 분석해 wrap 위험·cols 부적합·폰트 미스매치 + AC-룰-6 텍스트 길이·금지 어휘·figcaption 형식을 보고한다.

**호출**:
```bash
node script/audit-infographic-visual.mjs                       # 전수
node script/audit-infographic-visual.mjs --post=341            # 특정 글
node script/audit-infographic-visual.mjs --json                # JSON 출력
node script/audit-infographic-visual.mjs --update-dictionary   # 금지 어휘 사전 갱신·재검증 (§4.10.8)
```

**검출 항목**:
- `grid-cols-4` 이상 + stat-value 길이 9글자 초과 (wrap 위험, 폭 1200 기준 §4.10.6)
- 숫자 span + 단위 span 인접 `flex` 컨테이너에서 `flex-nowrap` 또는 `whitespace-nowrap` 미지정
- H1 폰트 ≥ 72px + `<br>` 없이 22자 초과 텍스트 한 단락
- 텍스트 색상 `#999`·`#A5C0FF`·`#B6BBC5` 등 §4.10.1 금지 색상 사용
- footer 로고 이미지 누락
- AC-룰-6 텍스트 길이 한계 위반 (§4.10.8 표)
- AC-룰-6 금지 어휘 매칭 (§4.10.8 사전)
- AC-룰-6 figcaption 형식 위반 (출처 인용 형식 또는 ≤ 120자)

**산출**:
- `tmp/infographic-visual-audit-{YYYYMMDD}.md`
- 각 글에 `risk: low/medium/high` 등급 + 결함 라인 번호 + 권장 수정

**파이프라인 (audit 단계 blog/audit.md Phase 2)**: 이 스크립트를 자동 호출 → high risk 글은 audit 점수 −15 + 인포그래픽 재생성 의무. 텍스트 룰(§4.10.8) 위반은 `risk:medium`(−5) 또는 `risk:high`(−10).

### 4.10.8 인포그래픽 텍스트 길이·금지 어휘·figcaption 형식 (AC-룰-6 정본)

인포그래픽 HTML에 표시되는 모든 visible 텍스트(헤드라인·통계 라벨·카드 본문·footer caption)에 강제. `audit-infographic-visual.mjs`가 자동 검증.

**(1) 글자수 한계 표 (위반 시 risk:medium 또는 risk:high)**:

| 항목 | 글자수 한계 | 감점 |
|---|---|---|
| 헤드라인 (H1·메인 타이틀) | **6-28자**, 의미 단위 `<br>` 명시 | −5 |
| 섹션 제목 / 카드 타이틀 | **4-20자**, 명사구 또는 동사형 종결 | −5 |
| stat-value (큰 숫자) | 단위 포함 **≤ 8자** (예: "1,874억 원") | −10 |
| stat label | **4-14자** | −5 |
| 카드 본문 텍스트 | 카드당 **≤ 60자**, 같은 grid 안 카드 간 길이 편차 ≤ 평균의 40% (§5 라인브레이크 룰) | −5 |
| figcaption | **≤ 120자** | −5 |

**(2) 금지 어휘 사전 (위반 시 risk:high)**:

- 과장: "이른바", "무려", "엄청난", "혁명적"
- 책임 회피·과대 약속: "100% 보장", "확실한 수익", "노력 없이", "쉽게 돈벌기"
- 자동·수동 표현 모호화: "자동 적립", "자동 누적", "자동 수익"
- 풀이 없는 외래어/약어: ROI / CAC / LTV / 객단가 / affiliate (인포그래픽 안 직접 노출 금지. 본문에서 풀어서 설명 후 인용 가능)

seo-policy §1.8.1 정본 룰을 인포그래픽 텍스트 검증 범위로 확장한다.

**(3) figcaption 형식 검증**:

- 출처 인용 시: `"출처: {기관/플랫폼}, {YYYY}."` 또는 `"자료: {기관/플랫폼}, {YYYY}."` 형식만 허용
- 사진·일러스트의 경우 (§4.8.6 적용): `"이미지: {라이선스/출처}"` 또는 `"예시 이미지 (생성형 AI)"` 만 허용
- AC-룰-2 정합: figcaption ↔ 이미지 일치 룰. 출처 인용 + 비-인포그래픽/차트 이미지 → 미디어 영역 −10

**(4) 금지 어휘 사전 갱신 운영 절차**:

```bash
# 사전 갱신 (사전 JSON: script/audit-dict/banned-phrases.json)
node script/audit-infographic-visual.mjs --update-dictionary

# 갱신 후 재검증 (전수 audit 통해 영향 글 식별)
node script/audit-infographic-visual.mjs --json > tmp/audit-{TS}.json
```

사전 추가 시 `banned-phrases.json`의 새 entry는 `{ phrase, category, severity, added_at }` 스키마. severity는 `high`(−10) 또는 `medium`(−5). 추가 직후 전수 재검증으로 기존 인포그래픽 영향 글 식별.

§4.10.7 시각 감사 스크립트 본문에서 본 §4.10.8 룰을 cross-link 호출한다.

### 4.11 차트는 정보 전달이 필요한 곳에만 (불필요한 곳에 강제 금지)

차트를 글 모든 H2마다 강제로 넣지 않는다. 다음 기준으로 판단:

**차트가 가치 있는 경우**:
- 5개 이상의 항목을 4개 이상의 지표로 비교해야 함 (예: 도구 5종 × 지표 5개 → 도트플롯)
- Before/After·과거/현재·외주/내부 같은 극적 대비가 핵심 메시지 (예: 외주 vs AI 비용 → 덤벨 차트)
- 시계열 변화·트렌드·분포 (예: 월별 글 발행량 → 라인 차트)
- 비율·점유율 (예: 카테고리 분포 → 막대·파이)

**차트가 불필요한 경우** (텍스트로 충분):
- 5단계 이하 순서·워크플로우 → 본문에 번호 헤딩 + 짧은 설명이 더 깔끔
- 2-3개 항목 단순 비교 → 표 또는 본문 인라인 비교
- 정성적 설명 (느낌·분위기) → 사진형 codex
- 결론·요약 강조 → blockquote 또는 강조 박스

**정본은 HTML 인포그래픽 (§4.10.1)** — matplotlib은 deprecate. 다음 케이스에 한해서만 matplotlib 사용 가능:
- 단순 보조 차트 (도입부·푸터에 작게 들어가는 단일 차트)
- 빠른 prototype
- HTML이 과한 단순 막대·라인 차트

이외 모든 인포그래픽·비교표·매트릭스는 **HTML+Tailwind+Chrome headless 정본**.

**도구**:
- **matplotlib (정본)**: 막대·선·파이·산점도·복합 차트
- **Mermaid CLI**: 플로우차트·시퀀스 다이어그램·ER (`npx @mermaid-js/mermaid-cli -i input.mmd -o output.png -w 1792 -H 1024`)
- 외부 통계 인용 그래프(Statista 등)는 저작권 신중. 가능하면 데이터만 차용해서 자체 차트로 재구성

**matplotlib 절차**:
```python
# script/chart-template.py 사용 (brand color 프리셋 + 한글 폰트 적용)
from chart_template import bar_chart, save_brand
data = [('인스타', 41), ('유튜브', 23), ('소상공인', 16)]
fig = bar_chart(data, title='2026 snshelp 블로그 카테고리 분포', ylabel='글 수')
save_brand(fig, 'wp-content/drafts/images/{slug}/N-chart.png')
```

**원칙**:
- **수치는 검증된 출처에서만**: Semrush·DataReportal·Statista·정부 통계·자체 DB. 추정·반올림 시 명시
- **데이터 출처 caption 필수**: figcaption에 "출처: {조직명, 발표연도}" 표기
- **brand color 통일**: primary `#3B70FF`, accent `#2553D7`, soft `#F1F5FF`, neutral `#67757C`
- **한글 폰트**: Pretendard (시스템 설치 또는 download), 폰트 매니저 `matplotlib.font_manager` 활용
- **출력**: 1792×1024 (16:9) 16:9 또는 1600×900, 200 DPI

---

## 5. 디버깅 / 검증

### 5.1 새 이미지가 안 보일 때

```bash
# 1. S3에 업로드 됐나
aws s3 ls s3://snshelp-resource-bucket/static/{경로}

# 2. CDN URL 직접 접근
curl -I https://assets.helpsns.com/static/{경로}
# 200 OK + Server: AmazonS3 + via: CloudFront 확인

# 3. CloudFront 캐시 무효화 (수정 후 즉시 반영 필요한 경우)
# 단 cache-control immutable 정책상 보통 새 파일명으로 처리 권장
```

### 5.2 dimension 안 맞을 때

```bash
# 정확한 dimension 측정
node -e "const s=require('sharp'); s('src/assets/{경로}').metadata().then(m => console.log(m))"
# SVG는: cat src/assets/{경로} | grep -E 'viewBox|width=|height='
```

### 5.3 빌드에서 이미지 처리 0 검증

```bash
npm run build
find dist -type f \( -name '*.png' -o -name '*.webp' -o -name '*.svg' \) | wc -l
# 기대: 0 (또는 public/blog-images만, public/favicon.svg 등 정적 자산만)
```

---

## 6. 파일 정리 (사용 안 하는 이미지)

`src/assets/` 안 파일이 코드에서 참조되지 않으면:
- `knip` 또는 `grep`로 미사용 검출
- `.recycle/` 으로 이동 (룰: 즉시 삭제 금지)
- 1개월 후 삭제 검토

S3 정리:
- `aws s3 sync` 는 추가만 함. 삭제는 별도 명령:
  ```bash
  aws s3 sync src/assets/ s3://snshelp-resource-bucket/static/ --delete --dry-run
  # 검토 후 --delete 실행 (위험: 다른 환경에서 참조 중일 수 있음)
  ```
- 정기 정리 권장 X. 비용 영향 미미(S3 1MB ≈ 월 $0.023).
