# WordPress 연동 규칙

snshelp-astro는 WordPress REST API에서 콘텐츠를 가져와 정적 빌드에 사용한다. `script/wp-pull.mjs`로 풀, `script/wp-push.mjs`로 푸시. 이 문서는 WP 연동 작업 시 정본.

---

## 1. 데이터 흐름

```
WP Server (REST API)
    │
    │ Basic Auth + per_page=100 + x-wp-totalpages
    ▼
script/wp-pull.mjs
    │
    │ frontmatter + 본문 마크다운으로 변환
    ▼
wp-content/posts/{id}.md, wp-content/pages/, _taxonomy.json, _media.json
    │
    │ Astro 빌드 시점에 fs로 읽기
    ▼
src/pages/blog/[slug]/index.astro  (getStaticPaths)
src/pages/faq/[id]/index.astro
src/widgets/home/...
    │
    ▼
dist/  (정적 HTML)
    │
    ▼
AWS Amplify
```

**원칙**:
- 런타임에 WP에 직접 fetch하지 않는다. 모든 콘텐츠는 빌드 시점에 `wp-content/`에 있어야 한다.
- WP 응답을 그대로 컴포넌트 props로 넘기지 않는다 — 정규화 단계 거쳐서 앱 타입으로 변환.

---

## 2. 풀(`script/wp-pull.mjs`)

### 환경변수

| 변수 | 용도 |
|---|---|
| `WORDPRESS_BLOG_URL` | WP REST API 베이스 (예: `http://example.com/wp-json/wp/v2`) |
| `WORDPRESS_BLOG_TOKEN` | Application Password를 base64 인코딩한 Basic Auth 토큰 |

### 호출 엔드포인트

- `/posts` — 블로그 글
- `/pages` — 정적 페이지
- `/categories`, `/tags` — 분류 (taxonomy)
- `/media` — 첨부 이미지 메타

### 페이지네이션

`per_page=100` + `x-wp-totalpages` 헤더 기반 반복. 임의로 첫 페이지만 가져오는 코드 금지.

### 저장 포맷

```markdown
---
{
  "id": 123,
  "slug": "post-slug",
  "status": "publish",
  "date": "2025-...",
  "categories": [...],
  ...
}
---
본문 마크다운
```

`_taxonomy.json` (카테고리/태그 맵), `_media.json` (미디어 메타) 별도 파일.

### draft / private

`status=publish`만 빌드에 노출. draft·private·trash는 빌드 결과에서 제외해야 한다.

### 실행 규칙

- `node script/wp-pull.mjs` 수동 실행. CI는 사용하지 않는다.
- 실행 후 `wp-content/`가 변경되어도 **git에 커밋하지 않는다** (`.gitignore`에 `wp-content/` 등록되어 있음).
- WP 측이 진실 원본. 로컬에서 wp-content/ 파일을 직접 편집하는 것은 임시 미리보기용으로만, 푸시 전 wp-push로 동기화.

---

## 3. 푸시(`script/wp-push.mjs`)

- 로컬 `wp-content/posts/{id}.md`의 frontmatter + 본문을 WP `/posts/{id}` PUT 요청으로 갱신.
- 동기화 가능 필드는 `PUSH_FIELDS` 배열로 화이트리스트 관리.
- **충돌 방지**: 원격 `modified_gmt`와 로컬 frontmatter `modified_gmt` 비교 후 다르면 거부 (`--force` 플래그로 강제).
- 푸시 후 wp-push가 응답으로 받은 최신 frontmatter로 로컬 파일 갱신.

### 실행 규칙

- 푸시는 사용자 명시 지시 있을 때만. AI가 자동으로 wp-push 실행 금지.
- 한 번에 한 글씩 푸시(`--id=123` 또는 슬러그 지정). 일괄 푸시는 사용자 승인 필수.

### 3.2 발행 파이프라인 정본 (이미지 포함 글 — CRITICAL)

`wp-push.mjs`는 **본문(content)만 PUT**한다. **이미지를 S3/CDN에 올리지 않는다.** 따라서 신규 이미지(차트·인포그래픽)가 있는 글을 발행할 때는 **반드시 아래 순서**를 지킨다. 순서를 어기면 깨진 이미지(403/404)가 prod에 나간다.

1. **이미지 먼저 업로드**: 신규 webp마다 `node --env-file=.env script/upload-infographic.mjs <postId> <로컬webp경로> "<alt>"` → stdout JSON의 **`source_url`을 받는다**. 이게 WP /media 등록 + S3 cp + CloudFront invalidation을 한다.
2. **본문 src를 반환된 `source_url`로 교체**: 본문의 이미지 URL은 **upload가 반환한 source_url만 쓴다.** WordPress가 부여하는 경로는 추측 불가(날짜 폴더·해시 등) — **AI가 `blog/{slug}/foo.webp` 같은 경로를 임의로 지어 본문에 박으면 100% 깨진다** (이번 작업 실사고: sub-agent 다수가 추측 경로를 박아 발행 직전 403 무더기 발견).
3. **CDN 200 확인**: 업로드 후 CloudFront 반영에 5-10초. 본문의 **모든** 이미지 src를 `curl -s -o /dev/null -w "%{http_code}" <url>`로 200 확인. 403/404면 재업로드하거나 그 figure를 본문에서 제거(깨진 이미지 발행 금지).
4. **wp-push**: 본문 전 이미지 200 확인 **후에만** `wp-push.mjs <id>`.
5. **발행 후 검증** (§3.3).

### 3.3 발행 검증은 공개 페이지로 (인증 API 간헐 차단 — CRITICAL)

WordPress 인증 REST API(`$WORDPRESS_BLOG_URL/posts/{id}?_fields=content` + `Authorization: Bearer`)는 **대용량 content 응답에서 간헐적으로 HTTP 000(연결 끊김)** 이 난다(이번 작업에서 반복 확인). 발행 결과 검증은 **인증 API가 아니라 공개 경로로** 한다:

- **글 페이지**: `curl -s "https://www.helpsns.com/blog/<slug>/"` (200 + HTML에서 이미지 src 추출)
- **이미지 자산**: 자산 URL 직접 `curl -s -o /dev/null -w "%{http_code}"` (CDN 200)
- 인증 필요한 단순 확인(modified_gmt 등)은 `?_fields=id`처럼 **작은 필드만** 요청하면 안정적.

**전수 검증 시 동시 요청 부하 주의**: 수십~수백 URL을 빠르게 연속 curl하면 일부가 **HTTP 000(부하성 타임아웃)** 으로 false negative가 난다. 000이 나온 URL은 **단건으로 1-2초 간격 두고 재확인** — 단건에서 200이면 정상(자산 문제 아님). 000을 곧바로 "깨짐"으로 판정하지 말 것.

**AI 자동 발행 시 sub-agent 보고 불신**: sub-agent가 "push 성공/이미지 200"이라 자가보고해도, **메인이 공개 페이지로 직접 전수 재검증**한다. 자가보고만으로 완료 결론 금지(이번 작업에서 자가보고와 실제가 어긋난 사례 다수).

### 3.1 진입점 lock 검사 (영구 안전망)

`script/wp-push.mjs`, `script/render-infographic.mjs`, `script/wp-media-replace.mjs` 진입점에서 다음 두 lock 파일을 검사한다.

- `.claude/scheduled_tasks.lock` — Claude Code `/schedule` 스킬의 영구 routine lock
- `tmp/*/blog-image-quality-100/.lock` 또는 유사 1회성 마이그레이션 작업 lock

존재 시 exit code 75 (`EX_TEMPFAIL`)로 즉시 종료한다. routine 또는 1회성 마이그레이션 작업이 활성 상태일 때 동시 wp-push / 미디어 업로드 / S3 cp를 차단해 rate limit 폭발과 미디어 ID race를 방지한다.

검사 코드는 진입점 최상단(args parse 직전)에 배치하며, lock 파일 부재 시 정상 흐름 진입. 좀비 PID(`process.kill(pid, 0)` ESRCH) 검출 시 stale lock으로 간주해 통과한다.

```js
import { existsSync, readFileSync } from 'node:fs';

const LOCK_FILES = [
  'tmp/blog-image-quality-100/.lock',
  '.claude/scheduled_tasks.lock',
];

function checkLockOrExit() {
  for (const lockPath of LOCK_FILES) {
    if (!existsSync(lockPath)) continue;
    try {
      const [pid] = readFileSync(lockPath, 'utf-8').trim().split(/\s+/);
      const pidNum = parseInt(pid, 10);
      if (!pidNum || pidNum === process.pid) continue;
      try {
        process.kill(pidNum, 0);
        console.error(`[lock-gate] ${lockPath} active (pid=${pid}). exit 75.`);
        process.exit(75);
      } catch (e) {
        // ESRCH = 죽은 PID, stale lock 통과
      }
    } catch (e) {
      console.error(`[lock-gate] ${lockPath} 읽기 실패: ${e.message}. exit 75.`);
      process.exit(75);
    }
  }
}

checkLockOrExit();
```

---

## 4. 정규화 (WP 응답 → 앱 타입)

WP 응답을 컴포넌트 props로 그대로 넘기지 않는다. 정규화 함수를 거쳐 앱 타입으로 변환.

### 위치

- `src/shared/api/wordpress/` (없으면 신규 생성)
- 또는 페이지/widget 단위로 `parsePost(raw): Post` 형태의 헬퍼

### 정규화 항목

- `title.rendered` — HTML 엔티티(`&amp;`) 디코딩
- `content.rendered` — DOMPurify로 sanitize (XSS 방지)
- `excerpt.rendered` — DOMPurify
- `date`, `modified_gmt` — Date 객체로 변환, KST 표시 시 `dayjs` 사용
- `featured_media` — `_media.json`에서 URL 조회 후 변환
- `categories`, `tags` — `_taxonomy.json`에서 이름 매핑

### DOMPurify 사용

```ts
import DOMPurify from 'isomorphic-dompurify';

const safeHtml = DOMPurify.sanitize(post.content.rendered);
// 그 다음 dangerouslySetInnerHTML={{ __html: safeHtml }}
```

**규칙**: HTML이 들어오는 모든 WP 필드(content/excerpt/description 등)에 DOMPurify 적용. 누락 시 XSS 위험.

---

## 5. 빌드 시점 사용

### getStaticPaths에서 wp-content 읽기

```ts
import fs from 'node:fs/promises';
import path from 'node:path';

export async function getStaticPaths() {
  const dir = path.join(process.cwd(), 'wp-content/posts');
  const files = await fs.readdir(dir);
  const posts = await Promise.all(
    files.filter(f => f.endsWith('.md')).map(async f => {
      const raw = await fs.readFile(path.join(dir, f), 'utf-8');
      return parsePost(raw); // frontmatter 파싱 + 정규화
    })
  );
  return posts
    .filter(p => p.status === 'publish')
    .map(p => ({ params: { slug: p.slug }, props: { post: p } }));
}
```

**규칙**:
- WP에 직접 fetch하지 않는다 (빌드 시간·안정성 이유).
- frontmatter 파서는 단일 함수로 중앙화 (페이지마다 다르게 작성 금지).

---

## 6. 에러 처리

- WP 서버 다운 / 인증 실패 / 5xx 응답 시 wp-pull은 명시적으로 종료 코드 1로 실패. 부분 결과 저장 금지.
- 빌드 시점에 `wp-content/`가 비어있거나 손상된 경우 빌드 실패. 빈 페이지 생성 금지.
- WP 응답 필드가 누락된 경우 (예: `featured_media`가 0): `null` 또는 기본값 처리, 절대 throw 금지.

---

## 7. 보안

- `WORDPRESS_BLOG_TOKEN`은 절대 클라이언트 번들에 노출 금지. `import.meta.env.PUBLIC_*` 접두사 사용 금지.
- WP REST 응답을 그대로 dangerouslySetInnerHTML에 넣지 말 것 — 반드시 DOMPurify.
- `.env`, `wp-content/` 모두 `.gitignore` 적용 확인.

---

## 8. 절대 금지 사항

- 런타임에 WP REST 직접 호출(client-side fetch). 모든 콘텐츠는 빌드 시점에 정적 생성.
- `WORDPRESS_BLOG_TOKEN`을 `PUBLIC_` 접두사로 클라이언트에 노출.
- WP 응답의 HTML 필드를 sanitize 없이 dangerouslySetInnerHTML.
- wp-pull 시 부분 페이지만 가져오기(페이지네이션 누락).
- AI가 자동으로 wp-push 실행 (사용자 명시 지시 필수).
- wp-content/를 git에 커밋.
- frontmatter 포맷 임의 변경 (wp-pull/wp-push 양쪽 모두 동일 포맷 사용).
