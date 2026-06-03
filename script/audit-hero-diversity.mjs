#!/usr/bin/env node
// hero 템플릿 다양성 점검 (JP) — 직전 N편의 typography hero 템플릿(T07~T16) 다양성 검사.
//
// 정본: .ai-rules/jp-site-config.md (§4.8.2 — hero는 항상 typography 인포그래픽 1장,
// 다양성은 T* 템플릿 단위로만 관리). KR의 hero "종류"(photo/screenshot/chart) 분류는
// typography 단일 고정 정책으로 폐기됨 → JP는 frontmatter `_draft.hero_template` 값의
// 연속 중복(같은 T 템플릿 반복)만 점검한다.
//
// 경로·파서: jp-paths.mjs(content/articles + listSlugs) / gray-matter(YAML frontmatter, §11).
// KR 잔재(wp-content/posts·JSON frontmatter·_media.json·codex/screenshot/chart 휴리스틱·Naver) 제거.
//
// 사용:
//   node script/audit-hero-diversity.mjs                  # 발행본 최근 5편 (default)
//   node script/audit-hero-diversity.mjs --all            # 발행본 전수
//   node script/audit-hero-diversity.mjs --recent=10      # 발행본 최근 10편
//   node script/audit-hero-diversity.mjs --category=TikTok # 카테고리(frontmatter.category) 필터
//   node script/audit-hero-diversity.mjs --include-drafts # drafts/<slug>.md 도 포함
//   node script/audit-hero-diversity.mjs --json
//
// JP 발행본에는 자동화 메타 `_draft`(따라서 `hero_template`)가 없을 수 있다(§4) →
// 그 경우 템플릿을 'unknown'으로 분류하고 graceful 진행(크래시 금지). 빈 경로(글 0편)도
// 조용히 통과시키지 않고 경고를 띄운다(false-pass 방지).

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { ROOT, POSTS_DIR, DRAFTS_DIR, postFile, draftFile, listSlugs } from './lib/jp-paths.mjs';

const args = process.argv.slice(2);
const wantAll = args.includes('--all');
const recent = Number(args.find((a) => a.startsWith('--recent='))?.split('=')[1] || 5);
const wantJson = args.includes('--json');
const includeDrafts = args.includes('--include-drafts');
const onlyCat = args.find((a) => a.startsWith('--category='))?.split('=')[1];

// date 문자열 정규화: JP는 "YYYY.MM.DD"(점) 또는 "YYYY-MM-DD" 혼재(jp-site-config §4·실데이터).
// 정렬용으로 점→하이픈 치환해 사전식 비교가 시간순과 일치하도록.
function normDate(d) {
  return String(d || '').slice(0, 10).replace(/\./g, '-');
}

// frontmatter._draft.hero_template 추출. 없으면 null(→ unknown). 다양한 위치 graceful 탐색.
function heroTemplateOf(data) {
  const draft = data?._draft;
  if (draft && typeof draft === 'object') {
    const t = draft.hero_template ?? draft.heroTemplate ?? draft.hero?.template;
    if (t != null && String(t).trim() !== '') return String(t).trim();
  }
  // 일부 draft는 _draft 없이 top-level hero_template 을 둘 수 있음 → graceful 허용.
  if (data?.hero_template != null && String(data.hero_template).trim() !== '') {
    return String(data.hero_template).trim();
  }
  return null;
}

// 점검 대상 글 목록 수집. listSlugs는 디렉터리 부재 시 빈 배열+경고(jp-paths) → ENOENT 크래시 없음.
const sources = [];

const postSlugs = listSlugs(POSTS_DIR); // readdir 가드 내장 (jp-paths)
for (const slug of postSlugs) sources.push({ slug, file: postFile(slug), kind: 'post' });

if (includeDrafts) {
  const draftSlugs = listSlugs(DRAFTS_DIR);
  for (const slug of draftSlugs) sources.push({ slug, file: draftFile(slug), kind: 'draft' });
}

if (sources.length === 0) {
  const warn = `[audit-hero-diversity] 점검 대상 글 0편 — ${path.relative(ROOT, POSTS_DIR)}${
    includeDrafts ? ` / ${path.relative(ROOT, DRAFTS_DIR)}` : ''
  } 에 .md 없음.`;
  if (wantJson) {
    console.log(JSON.stringify({ error: 'no_posts', message: warn, total_posts: 0, posts: [], violations: [] }, null, 2));
  } else {
    console.warn(`⚠ ${warn}\n   (빈 경로를 통과로 간주하지 않음 — 글을 추가하거나 경로/실행 위치를 확인하세요.)`);
  }
  process.exit(0); // 데이터 없음은 위반이 아니라 "검증 불가" — 경고 출력 후 비-실패 종료.
}

// frontmatter 파싱(gray-matter, YAML). 파싱 실패/누락은 graceful skip + 경고.
const posts = [];
let parseFailures = 0;
for (const src of sources) {
  let raw;
  try {
    raw = await readFile(src.file, 'utf-8');
  } catch (e) {
    parseFailures++;
    console.warn(`⚠ 읽기 실패 (skip): ${path.relative(ROOT, src.file)} — ${e.code || e.message}`);
    continue;
  }
  let parsed;
  try {
    parsed = matter(raw);
  } catch (e) {
    parseFailures++;
    console.warn(`⚠ frontmatter 파싱 실패 (skip): ${path.relative(ROOT, src.file)} — ${e.message}`);
    continue;
  }
  const data = parsed.data || {};
  posts.push({
    slug: src.slug,
    kind: src.kind,
    date: data.date || '',
    category: data.category || '',
    hero_template: heroTemplateOf(data), // null = unknown (JP 발행본은 _draft 없을 수 있음)
  });
}

// 카테고리 필터(frontmatter.category, JP는 일본어 카테고리). 대소문자 무시.
let filtered = posts;
if (onlyCat) {
  const want = onlyCat.toLowerCase();
  filtered = filtered.filter((p) => String(p.category).toLowerCase() === want);
}

// 최신순 정렬 후 직전 N편(또는 --all 전수).
filtered.sort((a, b) => normDate(b.date).localeCompare(normDate(a.date)));
const top = wantAll ? filtered : filtered.slice(0, recent);

// 템플릿 분포 집계.
const templateCounts = {};
let unknownCount = 0;
for (const p of top) {
  if (p.hero_template == null) {
    unknownCount++;
  } else {
    templateCounts[p.hero_template] = (templateCounts[p.hero_template] || 0) + 1;
  }
}

// 연속 동일 템플릿 위반 탐지(unknown은 streak 끊김으로 처리 — 모르는 값은 누적하지 않음).
const violations = [];
let streak = 1;
for (let i = 1; i < top.length; i++) {
  const cur = top[i].hero_template;
  const prev = top[i - 1].hero_template;
  if (cur != null && cur === prev) {
    streak++;
    if (streak >= 3) {
      violations.push({
        rule: `연속 동일 hero 템플릿(${cur}) ${streak}편`,
        at: top[i].slug,
        template: cur,
        streak,
        recommend: 'T07~T16 중 다른 템플릿으로 분기',
      });
    }
  } else {
    streak = 1;
  }
}

const distinctTemplates = Object.keys(templateCounts).length;
const knownN = top.length - unknownCount;

const result = {
  scope: wantAll ? 'all' : `recent_${recent}`,
  category_filter: onlyCat || 'all',
  include_drafts: includeDrafts,
  total_posts: filtered.length,
  examined: top.length,
  known_template_posts: knownN,
  unknown_template_posts: unknownCount, // JP 발행본은 _draft 없음 → 정상(graceful)
  distinct_templates: distinctTemplates,
  template_counts: templateCounts,
  parse_failures: parseFailures,
  posts: top.map((p) => ({
    slug: p.slug,
    kind: p.kind,
    date: normDate(p.date) || '?',
    category: p.category || '?',
    hero_template: p.hero_template ?? 'unknown',
  })),
  violations,
  recommendation:
    violations.length === 0
      ? knownN === 0
        ? 'hero_template 메타가 있는 글이 없음(_draft 없는 발행본) — 다양성 위반 판정 불가, 다음 draft부터 _draft.hero_template 기록 권장.'
        : 'hero 템플릿 다양성 OK. 다음 글은 자유 선택.'
      : `위반 ${violations.length}건. 다음 글의 hero 템플릿을 강제 분기하세요.`,
};

if (wantJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(
    `Hero 템플릿 다양성 점검 (${result.scope}, 카테고리=${result.category_filter}${includeDrafts ? ', drafts 포함' : ''}):\n`,
  );
  console.log(
    `대상 ${result.examined}편 / 템플릿 메타 보유 ${knownN}편 / unknown ${unknownCount}편 / 고유 템플릿 ${distinctTemplates}종`,
  );
  if (distinctTemplates > 0) {
    const dist = Object.entries(templateCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([t, n]) => `${t}=${n}`)
      .join(' / ');
    console.log(`템플릿 분포: ${dist}`);
  }
  console.log('');
  for (const p of top) {
    console.log(`  [${p.hero_template ?? 'unknown'}] ${p.slug} (${p.category || '?'}, ${normDate(p.date) || '?'}, ${p.kind})`);
  }
  if (parseFailures > 0) {
    console.log(`\n⚠ 파싱/읽기 실패 ${parseFailures}건(위 경고 참조) — skip 처리.`);
  }
  if (violations.length > 0) {
    console.log(`\n⚠ 위반 ${violations.length}건:`);
    for (const v of violations) console.log(`  - ${v.rule} at ${v.at} → ${v.recommend}`);
  } else if (knownN === 0) {
    console.log(`\nℹ hero_template 메타 보유 글 없음(JP 발행본은 _draft 미보유 가능) — 다양성 판정 불가, 위반 아님.`);
  } else {
    console.log(`\n✅ 위반 없음.`);
  }
}
