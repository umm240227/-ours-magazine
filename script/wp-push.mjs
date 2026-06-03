#!/usr/bin/env node
// 로컬 wp-content/posts/{id}.md 를 WordPress 로 업데이트
// 사용:
//   node --env-file=.env script/wp-push.mjs <id>          단일 글 업데이트
//   node --env-file=.env script/wp-push.mjs <id> --force  원격 modified_gmt 검사 스킵

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// === 진입점 lock 게이트 자식 우회 ===
if (process.env.BLOG_IMG_QUALITY_INSIDE_RUN !== '1') {
// === 진입점 lock 게이트 (영구 안전망 — wordpress-integration.md §3.1) ===
// .claude/scheduled_tasks.lock 또는 tmp/*/blog-image-quality-100/.lock 존재 시 exit 75.
// Claude Code /schedule routine 또는 1회성 마이그레이션 작업과의 동시 실행 차단.
{
  const fs = await import('node:fs');
  const locksToCheck = [
    '.claude/scheduled_tasks.lock',
    'tmp/blog-image-quality-100/.lock',
  ];
  for (const lockPath of locksToCheck) {
    if (fs.existsSync(lockPath)) {
      try {
        const content = fs.readFileSync(lockPath, 'utf8').trim();
        // PID 검증: 살아있는 프로세스면 차단
        const pidMatch = content.match(/^(\d+)/);
        if (pidMatch) {
          const pid = Number(pidMatch[1]);
          try {
            process.kill(pid, 0); // 살아있으면 차단
            console.error(`[lock-gate] ${lockPath} 활성 (PID ${pid}). 동시 실행 차단.`);
            process.exit(75); // EX_TEMPFAIL
          } catch (e) {
            if (e.code !== 'ESRCH') {
              console.error(`[lock-gate] ${lockPath} 확인 실패: ${e.message}`);
              process.exit(75);
            }
            // ESRCH: 좀비 lock — 무시하고 진입
          }
        } else {
          // PID 정보 없는 lock — 보수적으로 차단
          console.error(`[lock-gate] ${lockPath} PID 정보 없음. 보수적 차단.`);
          process.exit(75);
        }
      } catch (e) {
        console.error(`[lock-gate] ${lockPath} 읽기 실패: ${e.message}`);
        process.exit(75);
      }
    }
  }
}
} // === end lock-gate (BLOG_IMG_QUALITY_INSIDE_RUN 우회) ===

const BASE = process.env.WORDPRESS_BLOG_URL;
const TOKEN = process.env.WORDPRESS_BLOG_TOKEN;
if (!BASE || !TOKEN) {
  console.error('환경변수 WORDPRESS_BLOG_URL, WORDPRESS_BLOG_TOKEN 필요');
  process.exit(1);
}

const HEADERS = {
  Authorization: `Basic ${TOKEN}`,
  'Content-Type': 'application/json',
};
const ROOT = path.resolve(import.meta.dirname, '..');
const POSTS_DIR = path.join(ROOT, 'wp-content', 'posts');

// PUT body에 포함할 필드 (title/content/excerpt는 별도 처리, modified는 서버가 갱신)
const PUSH_FIELDS = [
  'slug',
  'status',
  'date',
  'date_gmt',
  'author',
  'featured_media',
  'sticky',
  'format',
  'categories',
  'tags',
];

const args = process.argv.slice(2);
const force = args.includes('--force');
const targetId = args.find((a) => /^\d+$/.test(a));

if (!targetId) {
  console.error('사용: wp-push.mjs <id> [--force]');
  process.exit(1);
}

function parseFile(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error('frontmatter 파싱 실패');
  return { meta: JSON.parse(m[1]), body: m[2].replace(/\n$/, '') };
}

function buildFile(meta, body) {
  return `---\n${JSON.stringify(meta, null, 2)}\n---\n${body}\n`;
}

async function fetchRemoteModified(id) {
  const res = await fetch(`${BASE}/posts/${id}?context=edit&_fields=modified_gmt`, {
    headers: HEADERS,
  });
  if (!res.ok) throw new Error(`원격 글 조회 실패 HTTP ${res.status}`);
  return (await res.json()).modified_gmt;
}

async function pushOne(id) {
  const file = path.join(POSTS_DIR, `${id}.md`);
  const { meta, body } = parseFile(await readFile(file, 'utf8'));

  if (!force) {
    const remoteModified = await fetchRemoteModified(id);
    if (remoteModified !== meta.modified_gmt) {
      console.error(
        `✗ ${id} 충돌: 원격이 로컬과 다릅니다 (local=${meta.modified_gmt}, remote=${remoteModified})`,
      );
      console.error('  pull로 동기화 후 다시 시도하거나 --force 사용');
      return false;
    }
  }

  const payload = { title: meta.title, content: body, excerpt: meta.excerpt ?? '' };
  for (const k of PUSH_FIELDS) {
    if (meta[k] !== undefined && meta[k] !== null) payload[k] = meta[k];
  }

  const res = await fetch(`${BASE}/posts/${id}`, {
    method: 'PUT',
    headers: HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    console.error(`✗ ${id} 업데이트 실패 HTTP ${res.status}\n${errBody.slice(0, 500)}`);
    return false;
  }
  const updated = await res.json();

  // 로컬 frontmatter의 modified/modified_gmt를 갱신해 다음 push 시 충돌 없게 함
  meta.modified = updated.modified;
  meta.modified_gmt = updated.modified_gmt;
  await writeFile(file, buildFile(meta, body));

  console.log(`✓ ${id} 업데이트 완료 (modified_gmt=${updated.modified_gmt})`);
  return true;
}

const ok = await pushOne(parseInt(targetId, 10));
process.exit(ok ? 0 : 1);
