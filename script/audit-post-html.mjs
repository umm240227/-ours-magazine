#!/usr/bin/env node
// JP 기사 본문(GFM 마크다운) 결함 일괄 검사.
// 정본: .ai-rules/jp-site-config.md §2(경로)·§3(본문=순수 GFM)·§11(YAML frontmatter).
// KR Gutenberg/WP(`<figure class="wp-block-image">`·`<!-- wp:* -->`·_media.json·S3 키)는 JP에서 전부 부재 →
// HTML 구조 검사를 GFM 등가 결함으로 교체한다.
//
// 사용:
//   node script/audit-post-html.mjs                            # 전수
//   node script/audit-post-html.mjs --all                      # 전수(명시)
//   node script/audit-post-html.mjs --post=post-instagram-algorithm  # 단일 slug
//   node script/audit-post-html.mjs --json                     # JSON 출력

import { readFileSync } from 'node:fs';
import matter from 'gray-matter';
import {
  POSTS_DIR,
  postFile,
  listSlugs,
  INTERNAL_ROUTE_PREFIXES,
} from './lib/jp-paths.mjs';

const args = process.argv.slice(2);
const onlyPost = args.find((a) => a.startsWith('--post='))?.split('=')[1];
const wantJson = args.includes('--json');

// ── top-level 디렉터리 readdir 가드 ───────────────────────────────────────
// listSlugs는 POSTS_DIR 부재 시 [] + 경고를 반환(크래시 금지). onlyPost가 와도
// 디렉터리가 없으면 빈 결과로 친절히 종료한다(ENOENT 즉시 크래시 방지).
let slugs;
try {
  slugs = listSlugs(POSTS_DIR).filter((s) => !onlyPost || s === onlyPost);
} catch (err) {
  console.error(`[audit-post-html] 기사 디렉터리 읽기 실패: ${err.message} — 빈 결과로 종료`);
  slugs = [];
}

if (slugs.length === 0 && onlyPost) {
  console.error(`[audit-post-html] slug "${onlyPost}" 에 해당하는 발행본이 없습니다 (${POSTS_DIR}).`);
}

const results = [];

// HTML/마크다운 잔여 태그 제거 후 텍스트만 추출(엔티티는 그대로, 길이 측정용)
const stripMd = (md) =>
  md
    .replace(/<[^>]+>/g, ' ') // 잔여 HTML 태그
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // 이미지
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // 링크 → 텍스트만
    .replace(/[*_`#>|-]/g, ' ') // 마크다운 기호
    .replace(/\s+/g, ' ')
    .trim();

for (const slug of slugs) {
  let raw;
  try {
    raw = readFileSync(postFile(slug), 'utf-8');
  } catch (err) {
    results.push({ slug, risk: 'high', findings: [{ type: 'read-error', risk: 'high', msg: `파일 읽기 실패: ${err.message}` }] });
    continue;
  }

  // YAML frontmatter(gray-matter) + GFM 본문 분리 (§11)
  let meta = {};
  let body = raw;
  try {
    const parsed = matter(raw);
    meta = parsed.data || {};
    body = parsed.content || '';
  } catch (err) {
    results.push({ slug, risk: 'high', findings: [{ type: 'frontmatter-parse', risk: 'high', msg: `YAML frontmatter 파싱 실패: ${err.message}` }] });
    continue;
  }

  const findings = [];

  // GFM 이미지 전부 수집: ![alt](src)
  const images = [...body.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)].map((m) => ({
    alt: m[1].trim(),
    src: m[2].trim(),
  }));

  // ── 검사 1) generic-alt: 빈 alt `![](src)` (장식이 아닌데 alt 누락) ───────────
  {
    const empties = images.filter((img) => img.alt.length === 0);
    if (empties.length > 0) {
      findings.push({
        type: 'generic-alt',
        risk: 'medium',
        count: empties.length,
        msg: `빈 alt 이미지 ![](…) ${empties.length}건 — 내용을 설명하는 alt 텍스트 필요 (예: ${empties.slice(0, 2).map((i) => i.src.split('/').pop()).join(', ')})`,
      });
    }
  }

  // ── 검사 2) missing-image: 본문에 이미지가 0개 ────────────────────────────
  //    (JP §3·§6: 본문 인포그래픽/차트 ≥2 권장. 0이면 시각 자료 부재 신호.)
  if (images.length === 0) {
    findings.push({
      type: 'missing-image',
      risk: 'medium',
      count: 0,
      msg: '본문 이미지 0개 — 인포그래픽/차트 등 시각 자료 없음 (§6 본문 ≥2 권장)',
    });
  }

  // ── 검사 3) body-text-truncation: 본문 텍스트 `…`/`...`/`&hellip;` 잘림 ──────
  //    끝이 말줄임이면 콘텐츠 잘림 의심(high). 중간 다수는 시각 확인 신호(low).
  {
    const bodyText = stripMd(body);
    const tail = bodyText.slice(-60).trim();
    const truncEnd = /(?:…|\.\.\.|&hellip;)["'」』）)\]\s]*$/.test(tail);
    if (truncEnd) {
      findings.push({
        type: 'body-text-truncation',
        risk: 'high',
        msg: `본문이 말줄임(…)으로 끝남 — 콘텐츠 잘림 의심 (끝부분: "…${tail.slice(-35)}")`,
      });
    } else {
      const midCount = (bodyText.match(/…|&hellip;/g) || []).length;
      if (midCount >= 4) {
        findings.push({
          type: 'body-text-truncation',
          risk: 'low',
          count: midCount,
          msg: `본문 말줄임(…) ${midCount}건 — 일부가 콘텐츠 잘림일 수 있어 시각 확인 권장`,
        });
      }
    }
  }

  // ── 검사 4) duplicate-image: 동일 이미지 경로가 본문에 2회+ 출현 ──────────────
  //    GFM `![..](같은경로)` 중복 = 같은 그림 반복 노출. picsum 같은 placeholder는 제외.
  {
    const srcCount = new Map();
    for (const img of images) {
      // 명백한 placeholder(picsum/placeholder/example)는 의도적 더미라 제외
      if (/picsum\.photos|placeholder|example\.com/i.test(img.src)) continue;
      srcCount.set(img.src, (srcCount.get(img.src) || 0) + 1);
    }
    const dups = [...srcCount.entries()].filter(([, n]) => n > 1);
    if (dups.length > 0) {
      findings.push({
        type: 'duplicate-image',
        risk: 'high',
        count: dups.length,
        msg: `동일 이미지 경로가 본문에 중복 출현 ${dups.length}건 (예: ${dups.slice(0, 2).map(([s, n]) => `${s.split('/').pop()}×${n}`).join(', ')})`,
      });
    }
  }

  // ── 검사 5) internal-link-allowlist: 내부링크가 JP 라우트 allowlist 밖이면 경고 ──
  //    JP 공개 라우트(jp-paths INTERNAL_ROUTE_PREFIXES: /articles/ /category/ /tags/ …) 기준.
  //    프로토콜 상대(`//`)·외부(http)·앵커(#)·메일은 내부링크 아님 → 제외.
  {
    const offending = [];
    const internalLinks = [];
    // 이미지 ![alt](src)는 링크가 아니므로 먼저 제거(이미지 src가 링크로 오검출되는 것 방지)
    const linkScope = body.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
    for (const m of linkScope.matchAll(/\[[^\]]*\]\((\/[^)\s]*)\)/g)) {
      const href = m[1];
      if (href.startsWith('//')) continue; // 프로토콜 상대 = 외부
      internalLinks.push(href);
      const ok = INTERNAL_ROUTE_PREFIXES.some((p) =>
        p === '/' ? href === '/' : href === p || href.startsWith(p),
      );
      if (!ok) offending.push(href);
    }
    if (offending.length > 0) {
      findings.push({
        type: 'internal-link-allowlist',
        risk: 'medium',
        count: offending.length,
        msg: `JP 라우트 allowlist 밖 내부링크 ${offending.length}건 — 허용 prefix(${INTERNAL_ROUTE_PREFIXES.join(' ')}) 확인 (예: ${[...new Set(offending)].slice(0, 3).join(', ')})`,
      });
    }
    // 내부링크가 아예 0개면 유입 동선 부재(low, 참고용)
    if (internalLinks.length === 0) {
      findings.push({
        type: 'internal-link-count',
        risk: 'low',
        count: 0,
        msg: '본문 내부링크(/articles/ 등) 0개 — 관련 기사 동선 권장',
      });
    }
  }

  // ── 검사 6) alt-length: alt 길이 15-80자 범위 검사 (빈 alt는 검사 1에서 처리) ──
  {
    const offending = [];
    for (const img of images) {
      if (img.alt.length === 0) continue;
      if (img.alt.length < 15 || img.alt.length > 80) {
        offending.push({ len: img.alt.length, value: img.alt.slice(0, 40) });
      }
    }
    if (offending.length > 0) {
      findings.push({
        type: 'alt-length',
        risk: 'low',
        count: offending.length,
        msg: `이미지 alt 길이 15-80자 범위 이탈 ${offending.length}건 (예: ${offending.slice(0, 3).map((o) => `${o.len}자 "${o.value}"`).join(', ')})`,
      });
    }
  }

  // ── 검사 7) missing-tags: frontmatter tags 누락/빈 배열 (§4 필수) ──────────────
  {
    const tags = meta.tags;
    if (!tags || (Array.isArray(tags) && tags.length === 0)) {
      findings.push({ type: 'missing-tags', risk: 'low', msg: 'frontmatter tags 누락/빈 배열 (§4 필수)' });
    }
  }

  const slugStr = slug;
  const risk = findings.some((f) => f.risk === 'high')
    ? 'high'
    : findings.some((f) => f.risk === 'medium')
      ? 'medium'
      : findings.length > 0
        ? 'low'
        : 'ok';
  results.push({ slug: slugStr, title: meta.title, risk, findings });
}

if (wantJson) {
  console.log(JSON.stringify(results, null, 2));
} else {
  const fail = results.filter((r) => r.risk !== 'ok');
  const ok = results.length - fail.length;
  console.log(`전체 ${results.length}글: ok=${ok}, 결함=${fail.length}`);
  for (const r of fail) {
    console.log(`\n[${r.risk.toUpperCase()}] ${r.slug}`);
    for (const f of r.findings) console.log(`  - ${f.type}: ${f.msg}`);
  }
}
