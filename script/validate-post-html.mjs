#!/usr/bin/env node
// content/articles/*.md 본문 GFM 구조 검증 (JP — 순수 GFM 마크다운, jp-site-config §3).
// KR Gutenberg(wp:block 짝·<figure>/<table> HTML 짝) 검사는 JP GFM에선 무의미 → 제거.
// JP GFM sanity 검사로 교체:
//   1) 미닫힌 코드펜스 (``` 백틱펜스 홀수개)
//   2) 깨진 GFM 표 (헤더 행 다음 줄에 |---| 구분행 없음)
//   3) 깨진 마크다운 이미지/링크 (![..]( 또는 [..]( 가 같은 줄에서 ) 로 안 닫힘)
//
// 사용:
//   node script/validate-post-html.mjs [<slug>...]            개별 글 검증
//   node script/validate-post-html.mjs --all                  전체 검증
//   node script/validate-post-html.mjs --json                 JSON 출력 (CI gate용)
//
// 종료 코드:
//   0 — 모든 검사 통과
//   1 — GFM sanity 위반 발견

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { listSlugs, resolvePostPath } from './lib/jp-paths.mjs';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkCjkFriendly from 'remark-cjk-friendly';
import { visit } from 'unist-util-visit';

// 렌더러(app/articles/[id]/page.tsx)와 동일 파서: remark-gfm + remark-cjk-friendly.
// 이걸로 파싱한 뒤에도 text 노드에 ** 가 남으면 = flanking-rule이 아니라 '짝 안 맞는 진짜 오타'
// (닫는 ** 누락 등 — cjk-friendly 플러그인도 복구 못 함). 일본어 구두점 인접으로 깨지던 케이스는
// 플러그인이 strong 으로 흡수하므로 검출 0(오탐 없음). code/inlineCode 는 text 노드가 아니라 자동 제외.
const mdProcessor = unified().use(remarkParse).use(remarkGfm).use(remarkCjkFriendly);

const args = process.argv.slice(2);
const flagAll = args.includes('--all');
const flagJson = args.includes('--json');
// JP slug = kebab-case (영문/숫자/하이픈). 플래그(--*)는 제외.
const slugs = args.filter((a) => !a.startsWith('--'));

function extractBody(text) {
  const m = text.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  return m ? m[1] : text;
}

// 코드펜스(``` ... ```) 영역의 줄 인덱스 집합을 반환.
// 표/이미지 검사 시 펜스 내부(예시 코드)는 오탐 방지를 위해 제외한다.
function fenceLineSet(lines) {
  const inside = new Set();
  let open = false;
  for (let i = 0; i < lines.length; i++) {
    const isFence = /^\s*```/.test(lines[i]);
    if (isFence) {
      inside.add(i); // 펜스 마커 줄 자체도 내부로 간주
      open = !open;
      continue;
    }
    if (open) inside.add(i);
  }
  return inside;
}

function validate(filename, body) {
  const issues = [];
  const lines = body.split('\n');

  // 1) 미닫힌 코드펜스: 줄 시작(들여쓰기 허용)에서 ``` 로 시작하는 펜스 마커가 홀수개면 미닫힘.
  {
    const fenceCount = lines.filter((ln) => /^\s*```/.test(ln)).length;
    if (fenceCount % 2 !== 0) {
      issues.push({ kind: 'unclosed-code-fence', count: fenceCount });
    }
  }

  const fenceLines = fenceLineSet(lines);

  // 2) 깨진 GFM 표: 표 헤더 행(| ... |) 다음 줄에 구분행(|---|...)이 없는데,
  //    그 헤더 행이 표의 시작인 경우. (헤더 위에 표 행이 없고, 헤더 자체가 파이프 셀 ≥2)
  {
    const isPipeRow = (s) => /^\s*\|.*\|\s*$/.test(s);
    // 구분행: 각 셀이 -, :, 공백으로만 구성 (예: |---|:--:|)
    const isSeparatorRow = (s) =>
      /^\s*\|(\s*:?-{1,}:?\s*\|)+\s*$/.test(s);

    for (let i = 0; i < lines.length; i++) {
      if (fenceLines.has(i)) continue;
      if (!isPipeRow(lines[i])) continue;
      if (isSeparatorRow(lines[i])) continue; // 구분행 자체는 건너뜀
      // 이 줄이 "표의 첫 행(헤더)"인지: 바로 위가 파이프 행이 아니면 헤더 시작.
      const prevIsPipe = i > 0 && !fenceLines.has(i - 1) && isPipeRow(lines[i - 1]);
      if (prevIsPipe) continue; // 표 중간/본문 행 → 헤더 검사 대상 아님
      // 헤더 후보. 다음 줄이 구분행이어야 정상 GFM 표.
      const next = i + 1 < lines.length ? lines[i + 1] : '';
      if (fenceLines.has(i + 1) || !isSeparatorRow(next)) {
        issues.push({
          kind: 'broken-gfm-table',
          line: i + 1,
          header: lines[i].trim().slice(0, 60),
        });
      }
    }
  }

  // 3) 깨진 마크다운 이미지/링크: 같은 줄에서 ![alt]( 또는 [text]( 가 ) 로 닫히지 않음.
  //    (멀티라인 링크는 GFM에서 비정상 → 줄 단위로 닫힘 검사. 코드펜스 내부는 제외.)
  {
    for (let i = 0; i < lines.length; i++) {
      if (fenceLines.has(i)) continue;
      const line = lines[i];
      // ![alt]( ... ) 와 [text]( ... ) 의 시작 토큰을 스캔.
      // 이미지(!) 우선, 그 다음 일반 링크. 각 '(' 뒤에 같은 줄에서 짝 ')' 가 있는지 확인.
      const re = /(!?)\[[^\]]*\]\(/g;
      let m;
      while ((m = re.exec(line)) !== null) {
        const openParenIdx = re.lastIndex - 1; // '(' 위치
        // openParenIdx 부터 짝 맞는 ')' 탐색 (중첩 괄호 고려).
        let depth = 0;
        let closed = false;
        for (let j = openParenIdx; j < line.length; j++) {
          if (line[j] === '(') depth++;
          else if (line[j] === ')') {
            depth--;
            if (depth === 0) { closed = true; break; }
          }
        }
        if (!closed) {
          issues.push({
            kind: 'broken-md-link',
            line: i + 1,
            kindOfToken: m[1] === '!' ? 'image' : 'link',
            snippet: line.slice(m.index, m.index + 40),
          });
        }
      }
    }
  }

  // 4) 미해석 강조(unparsed-emphasis): gfm + cjk-friendly 파싱 후 text 노드에 남은 **.
  //    `3 ** 2` 처럼 양옆 공백인 리터럴 별표는 제외(\S 인접한 것만 = 강조 의도였으나 짝이 안 맞음).
  {
    try {
      const tree = mdProcessor.parse(body);
      visit(tree, 'text', (node) => {
        if (!node.value.includes('**')) return;
        if (!/\S\*\*|\*\*\S/.test(node.value)) return; // 공백으로 둘러싸인 리터럴 별표는 통과
        const at = node.value.indexOf('**');
        issues.push({
          kind: 'unparsed-emphasis',
          line: node.position?.start?.line ?? null,
          snippet: node.value.slice(Math.max(0, at - 12), at + 16).trim(),
        });
      });
    } catch {
      /* 파서 실패는 무시(다른 검사로 충분) */
    }
  }

  return { filename, ok: issues.length === 0, issues };
}

async function run() {
  let targetSlugs;
  if (flagAll) {
    targetSlugs = listSlugs(); // jp-paths: 디렉터리 부재 시 빈 배열 + 경고 (ENOENT 크래시 방지)
  } else if (slugs.length > 0) {
    targetSlugs = slugs;
  } else {
    console.error('사용: node script/validate-post-html.mjs [<slug>...] | --all [--json]');
    process.exit(2);
  }

  const results = [];
  for (const slug of targetSlugs) {
    // 입력 해석: 실제 파일 경로(drafts/x.md, /tmp/x.md) > 발행본 slug > draft slug(draft- 접두) — jp-paths.resolvePostPath
    const file = existsSync(slug) ? slug : resolvePostPath(slug);
    const label = file.split('/').pop(); // basename (slug.md 또는 실제 파일명) — `.md.md` 방지
    try {
      const text = await readFile(file, 'utf8');
      const body = extractBody(text);
      results.push(validate(label, body));
    } catch (err) {
      results.push({ filename: label, ok: false, issues: [{ kind: 'read-error', message: err.message }] });
    }
  }

  const failed = results.filter((r) => !r.ok);

  if (flagJson) {
    console.log(JSON.stringify({ total: results.length, failed: failed.length, results }, null, 2));
  } else {
    for (const r of results) {
      if (r.ok) continue;
      console.log(`❌ ${r.filename}`);
      for (const issue of r.issues) {
        if (issue.kind === 'unclosed-code-fence') {
          console.log(`   unclosed-code-fence: \`\`\` 펜스 마커가 홀수개 (${issue.count}개) — 미닫힌 코드 블록`);
        } else if (issue.kind === 'broken-gfm-table') {
          console.log(`   broken-gfm-table: ${issue.line}행 표 헤더 다음에 |---| 구분행 없음 → "${issue.header}"`);
        } else if (issue.kind === 'broken-md-link') {
          console.log(`   broken-md-link: ${issue.line}행 ${issue.kindOfToken} 닫는 ')' 누락 → "${issue.snippet}"`);
        } else if (issue.kind === 'unparsed-emphasis') {
          console.log(`   unparsed-emphasis: ${issue.line ?? '?'}행 짝 안 맞는 강조 ** 잔존(닫는 ** 누락 의심) → "${issue.snippet}"`);
        } else if (issue.kind === 'read-error') {
          console.log(`   read-error: ${issue.message}`);
        }
      }
    }
    console.log('');
    console.log(`총 ${results.length}건 검사 · 통과 ${results.length - failed.length} · 실패 ${failed.length}`);
  }

  process.exit(failed.length === 0 ? 0 : 1);
}

run();
