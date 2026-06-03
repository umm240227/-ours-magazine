#!/usr/bin/env node
// §9 Answer Capsule 룰 측정 정본 (JP / GFM)
// 정본: .ai-rules/jp-site-config.md §2(경로)·§3(GFM)·§9(답변캡슐 50–80자·100% 게이트)
// 사용:
//   node script/measure-answer-capsule.mjs <slug>
//   node script/measure-answer-capsule.mjs --all                  # 전수 통계
//   node script/measure-answer-capsule.mjs --post=<slug> --json   # JSON 출력 (audit 연동)
//
// 측정 정의 (jp-site-config §9):
// - 본문은 순수 GFM 마크다운. H2 = 마크다운 `## ` 헤딩 (HTML <h2> 아님).
// - 주제 H2 = FAQ·결론·listicle 순번·참고자료 제외한 H2
// - capsule = 주제 H2 직후 첫 문단(다음 빈 줄까지). 이미지 전용 라인(![..](..))은 건너뜀.
// - capsule 글자수 = 마크다운 문법(**bold**·[링크](url)·`code`) 제거 후 공백 제외 전체 문자수
//   (히라가나·가타카나·한자·영숫자 혼재).
// - STRICT 통과: 50–80자 / LOOSE 통과: 40–100자
// - 글 단위 통과율 = STRICT 통과 H2 / 전체 주제 H2 (게이트 = 100%)

import { readFile } from 'node:fs/promises';
import matter from 'gray-matter';
import { POSTS_DIR, postFile, draftFile, listSlugs } from './lib/jp-paths.mjs';
import fs from 'node:fs';

const args = process.argv.slice(2);
const isAll = args.includes('--all');
const isJson = args.includes('--json');
// slug 인자: --post=<slug> 또는 위치 인자(플래그·옵션 제외)
const postArg =
  args.find((a) => a.startsWith('--post='))?.split('=')[1] ||
  args.find((a) => !a.startsWith('--'));

// H2 분류 정규식 (JP 로케일)
// FAQ: よくある質問 / FAQ / Q&A / Q＆A
const FAQ_PATTERN = /よくある質問|^FAQ\b|Q\s*&\s*A|Q\s*＆\s*A|質問と回答/i;
// 결론: まとめ / 結論 / おわりに / 終わりに / 最後に
const CONCLUSION_PATTERN = /^(まとめ|結論|おわりに|終わりに|最後に|さいごに)/;
// listicle 순번: 1. / ①〜⑩ / その1 / ステップ1 / ポイント1 / 方法1 / 型1 等
const LISTICLE_PATTERN =
  /^\s*(\d+[\.．、)）]|[①②③④⑤⑥⑦⑧⑨⑩]|(その|ステップ|Step|ポイント|方法|理由|手順|コツ|パターン|タイプ|事例|ケース|case|型|レベル|フェーズ)\s*\d+\s*[.:：．、)）—\-－\s])/i;
// 참고자료·출처
const REFERENCE_PATTERN =
  /^(参考(資料|文献|リンク)?|出典|引用元|References?|Sources?|関連記事|次に読む記事|次の行動)(\s|$|・|—|:|：)?/i;

function classifyH2(text) {
  // leading 이모지/공백 제거 후 매칭 (예: "📚 参考資料" → "参考資料")
  const normalized = text.replace(/^[\p{Extended_Pictographic}️‍\s]+/u, '').trim();
  if (FAQ_PATTERN.test(normalized)) return 'faq';
  if (LISTICLE_PATTERN.test(normalized)) return 'listicle';
  if (CONCLUSION_PATTERN.test(normalized)) return 'conclusion';
  if (REFERENCE_PATTERN.test(normalized)) return 'reference';
  return 'topic';
}

// 마크다운 인라인 문법 제거 → plain text. 공백 제외 문자수 측정용.
function stripMarkdownInline(md) {
  return (
    md
      // 이미지 ![alt](url) → 캡슐 텍스트에선 제외 (애초 이미지 라인은 호출부에서 skip)
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      // 링크 [text](url) → text
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      // 강조 **bold** / __bold__ / *em* / _em_
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/(?<![\w])_([^_]+)_(?![\w])/g, '$1')
      // 인라인 코드 `code` → code
      .replace(/`([^`]+)`/g, '$1')
      // 취소선 ~~text~~
      .replace(/~~([^~]+)~~/g, '$1')
      // 남은 마크다운 마커 제거
      .replace(/[*_`~]/g, '')
  );
}

// capsule 길이 = 공백·개행 제외 전체 문자수 (히라가나·한자·영숫자 혼재)
function capsuleLen(md) {
  const text = stripMarkdownInline(md).replace(/\s+/g, '');
  return [...text].length; // 코드포인트 단위 (서로게이트 안전)
}

// 마크다운 본문에서 H2(`## `) + 직후 첫 문단 추출.
// - `## ` 헤딩만 (`### `는 H3이므로 제외).
// - 코드펜스(```) 안의 `## `는 헤딩으로 보지 않음.
// - capsule = 헤딩 다음 라인부터, 비어있지 않고 이미지/표/리스트 전용이 아닌 첫 "문단"
//   (연속된 텍스트 라인을 빈 줄 만날 때까지 모음). 이미지 전용 라인·blockquote는 건너뜀.
function extractH2WithFirstP(body) {
  const lines = body.split(/\r?\n/);
  const results = [];
  let inFence = false;
  let fenceMarker = '';

  // H2 헤딩 라인 인덱스 수집
  const headings = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = line.match(/^\s*(```+|~~~+)/);
    if (fenceMatch) {
      if (!inFence) {
        inFence = true;
        fenceMarker = fenceMatch[1][0];
      } else if (line.trim().startsWith(fenceMarker)) {
        inFence = false;
      }
      continue;
    }
    if (inFence) continue;
    // `## 헤딩` (H2). `###`는 매칭 안 됨 (정확히 ## 다음 비-#).
    const h2 = line.match(/^##\s+(?!#)(.*\S)\s*$/);
    if (h2) headings.push({ idx: i, text: h2[1].trim() });
  }

  for (let h = 0; h < headings.length; h++) {
    const start = headings[h].idx;
    const end = h + 1 < headings.length ? headings[h + 1].idx : lines.length;
    const h2Text = headings[h].text;

    // 헤딩 다음 라인부터 첫 "문단" 탐색
    let para = [];
    let started = false;
    let inner = false; // 문단 내부 진입 여부
    for (let i = start + 1; i < end; i++) {
      const raw = lines[i];
      const line = raw.trim();
      // 코드펜스 내부는 건너뜀 (capsule 대상 아님)
      // 빈 줄
      if (line === '') {
        if (inner) break; // 문단 끝
        continue;
      }
      // H3+ 헤딩을 만나면 (그 전에 문단 없었으면) 이 H2는 capsule 없음
      if (/^#{3,}\s/.test(line)) break;
      // 이미지 전용 라인 (![alt](url) 단독) → skip
      if (/^!\[[^\]]*\]\([^)]*\)\s*$/.test(line)) {
        if (inner) break;
        continue;
      }
      // 표 라인 / 리스트 / blockquote / HR → 문단 시작 전이면 건너뛰고,
      // 문단이 이미 시작됐으면 종료
      const isBlock =
        /^[|>]/.test(line) || // 표·인용
        /^([-*+]\s|\d+[.)]\s)/.test(line) || // 리스트
        /^(-{3,}|\*{3,}|_{3,})\s*$/.test(line); // HR
      if (isBlock) {
        if (inner) break;
        continue; // 문단 전의 표/리스트는 건너뛰고 진짜 문단 탐색
      }
      // 일반 텍스트 라인 → 문단에 누적
      para.push(line);
      inner = true;
      started = true;
    }

    const paraText = para.join(' ');
    results.push({
      h2: h2Text,
      kind: classifyH2(h2Text),
      capsuleLen: started ? capsuleLen(paraText) : 0,
      hasCapsule: started,
      firstPSample: started
        ? stripMarkdownInline(paraText).replace(/\s+/g, ' ').trim().slice(0, 60)
        : '',
    });
  }
  return results;
}

function judgeStrict(len) {
  return len >= 50 && len <= 80;
}
function judgeLoose(len) {
  return len >= 40 && len <= 100;
}

// slug → 발행본 또는 draft 본문. 둘 다 YAML frontmatter (gray-matter).
async function loadBody(slug) {
  const pub = postFile(slug);
  const drf = draftFile(String(slug).replace(/^draft-/, ''));
  let file;
  if (fs.existsSync(pub)) file = pub;
  else if (fs.existsSync(drf)) file = drf;
  else file = pub; // 존재하지 않으면 readFile에서 ENOENT (호출부 try/catch)
  const text = await readFile(file, 'utf8');
  const { content } = matter(text);
  return content;
}

async function measurePost(slug) {
  const body = await loadBody(slug);

  const h2s = extractH2WithFirstP(body);
  const topicH2s = h2s.filter((h) => h.kind === 'topic');
  const strictPass = topicH2s.filter((h) => judgeStrict(h.capsuleLen));
  const loosePass = topicH2s.filter((h) => judgeLoose(h.capsuleLen));

  const strictRate = topicH2s.length ? strictPass.length / topicH2s.length : 1;
  const looseRate = topicH2s.length ? loosePass.length / topicH2s.length : 1;

  // §9.5.1 점수 (JP: 100% 게이트 — STRICT 100% 미만은 감점)
  let score = 0;
  if (topicH2s.length === 0) {
    score = 0; // 측정 대상 없음
  } else if (strictRate === 1) {
    score = +3;
  } else if (strictRate >= 0.8) {
    score = 0;
  } else if (strictRate === 0) {
    score = -15; // -5 + -10 추가
  } else {
    score = -5;
  }

  return {
    id: slug,
    totalH2: h2s.length,
    topicH2: topicH2s.length,
    excluded: {
      faq: h2s.filter((h) => h.kind === 'faq').length,
      listicle: h2s.filter((h) => h.kind === 'listicle').length,
      conclusion: h2s.filter((h) => h.kind === 'conclusion').length,
      reference: h2s.filter((h) => h.kind === 'reference').length,
    },
    strict: { pass: strictPass.length, total: topicH2s.length, rate: strictRate },
    loose: { pass: loosePass.length, total: topicH2s.length, rate: looseRate },
    defects: topicH2s
      .filter((h) => !judgeStrict(h.capsuleLen))
      .map((h) => ({ h2: h.h2, len: h.capsuleLen, sample: h.firstPSample })),
    score,
  };
}

async function main() {
  if (isAll) {
    const ids = listSlugs().sort();
    const results = [];
    for (const id of ids) {
      try {
        results.push(await measurePost(id));
      } catch {
        // skip (frontmatter 파싱 실패 등)
      }
    }
    if (isJson) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      const total = results.length;
      const strict100 = results.filter((r) => r.strict.rate === 1 && r.topicH2 > 0).length;
      const strict80 = results.filter((r) => r.strict.rate >= 0.8 && r.topicH2 > 0).length;
      const strict0 = results.filter((r) => r.strict.rate === 0 && r.topicH2 > 0).length;
      const totalH2 = results.reduce((s, r) => s + r.topicH2, 0);
      const totalPass = results.reduce((s, r) => s + r.strict.pass, 0);
      console.log(`§9 Answer Capsule 전수 측정 — 글 ${total}편`);
      console.log(`  STRICT 100% 통과 글: ${strict100} (${total ? ((strict100 / total) * 100).toFixed(1) : '0.0'}%)`);
      console.log(`  STRICT 80%+ 통과 글: ${strict80} (${total ? ((strict80 / total) * 100).toFixed(1) : '0.0'}%)`);
      console.log(`  STRICT 0% 통과 글: ${strict0} (${total ? ((strict0 / total) * 100).toFixed(1) : '0.0'}%)`);
      console.log(`  전체 주제 H2: ${totalH2}, STRICT 통과: ${totalPass} (${totalH2 ? ((totalPass / totalH2) * 100).toFixed(1) : '0.0'}%)`);
    }
    return;
  }

  if (!postArg) {
    console.error('사용: node script/measure-answer-capsule.mjs <slug> | --all [--json]');
    process.exit(1);
  }
  const result = await measurePost(postArg);
  if (isJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`§9 Answer Capsule 측정 — 글 ${result.id}`);
  console.log(`  총 H2: ${result.totalH2}, 주제 H2: ${result.topicH2}`);
  console.log(
    `  제외: FAQ ${result.excluded.faq}, listicle ${result.excluded.listicle}, 결론 ${result.excluded.conclusion}, 참고자료 ${result.excluded.reference}`
  );
  console.log(`  STRICT(50-80자): ${result.strict.pass}/${result.strict.total} (${(result.strict.rate * 100).toFixed(0)}%)`);
  console.log(`  LOOSE(40-100자): ${result.loose.pass}/${result.loose.total} (${(result.loose.rate * 100).toFixed(0)}%)`);
  console.log(`  §9.5.1 점수: ${result.score >= 0 ? '+' : ''}${result.score}`);
  if (result.defects.length > 0) {
    console.log(`  결함 H2 (capsule 부족):`);
    for (const d of result.defects.slice(0, 10)) {
      console.log(`    - "${d.h2.slice(0, 40)}" → ${d.len}자: ${d.sample}...`);
    }
    if (result.defects.length > 10) console.log(`    ... 외 ${result.defects.length - 10}건`);
  }
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
