#!/usr/bin/env node
// 21글 본문에 인포그래픽 wp:image 블록을 TL;DR(wp:list) 직후에 삽입.
// 정본: asset-images.md §4.10.0 (인포그래픽은 TL;DR 직후)

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const results = JSON.parse(await readFile(path.join(ROOT, 'tmp', 'infographic-upload-results.json'), 'utf8'));

// 글별 alt + caption (글 주제 풍부히 반영)
const altCaption = {
  133:  { alt: '2026 유튜브 시청 시간·광고 수익·모바일 88%·Shorts 700억 조회 핵심 통계 한눈에 보는 인포그래픽', cap: '월 24.9억 명 · 광고 매출 315억$ · 모바일 88% — 2026 YouTube 시청 시간 핵심 수치.' },
  264:  { alt: '인스타 팔로워 구매 오해 4가지 Do·Don\'t 체크리스트 인포그래픽 (한국 활성 계정·소량 분할·봇 회피)', cap: '루머 vs 사실 — 팔로워 구매 6가지 안전 룰과 6가지 절대 금기.' },
  341:  { alt: 'K-브랜드 글로벌 SNS 마케팅 통계 인포그래픽 (K-뷰티 1874억$·K-푸드 130억$·초현지화·팬덤·숏폼·인플루언서)', cap: 'K-뷰티 1,874억$·K-푸드 130억$ — 글로벌 진출 SNS 4축 비중.' },
  419:  { alt: '인플루언서를 위한 유튜브 구독자 1만 5단계 인포그래픽 (CTR 4% 시청률 50% 구독 전환 3%)', cap: '구독 1만 + 전환율 3% 광고주 협업 진입선 — 90일 funnel 5단계.' },
  546:  { alt: '신규 유튜버 구독자 1000명 빠르게 달성 90일 5단계 인포그래픽 (Shorts·롱폼·댓글 답글)', cap: 'YPP 1천 구독 — Shorts 매일 + 롱폼 주1 + 댓글 답글 100%.' },
  564:  { alt: '노란우산공제 연 복리 3.7-3.9%·소득공제 600만원 절세 효과 인포그래픽 (소득별 환급액 차등)', cap: '월 5-100만원 자율 납입 · 연 600만원 소득공제 — 자영업 1순위 절세 도구.' },
  597:  { alt: '캡컷(CapCut)으로 틱톡 숏폼 영상 10분 제작 5단계 인포그래픽 (1080×1920 자동자막 트렌딩 음원)', cap: 'CapCut 한 앱 10분 — 외주 30만원이 무료로.' },
  618:  { alt: '2025 4대 보험 보험료율 인포그래픽 (국민연금 9%·건강 7.09%·고용 1.8%·산재 1.43%)', cap: '월 300만원 근로자 본인 부담 합계 약 28만원 — 4대 보험 한눈에.' },
  627:  { alt: '대형 브랜드 vs 동네 가게 4축 매트릭스 비교 인포그래픽 (가격·커뮤니티·스토리·SNS 진정성)', cap: 'MZ 68%가 로컬 선호 — 커뮤니티·스토리·SNS 진정성에서 동네 가게가 압도.' },
  637:  { alt: '소상공인 디지털 혁신 통계 인포그래픽 (도입률 17.5%·매출 +17.4%·영업이익 +22.3%)', cap: '디지털 도입 시 매출 +17.4%·영업이익 +22.3% — 키오스크·POS·AI 챗봇 순.' },
  642:  { alt: 'Zapier·IFTTT로 인스타그램 자동화 5단계 인포그래픽 (크로스포스팅·DM 응답·백업·메타 안전 룰)', cap: 'IG 자동화 60분 셋업 — 콘텐츠·데이터 동기화만, 좋아요·팔로우는 금지.' },
  647:  { alt: '2025 네이버·구글 로컬 SEO 상위노출 5단계 인포그래픽 (스마트플레이스·GBP·NAP·리뷰·사진)', cap: '소비자 80%가 매주 지역 검색 — NAP 일관성 + 리뷰 10건 + 사진 30장.' },
  655:  { alt: '리뷰 관리 Do·Don\'t 12가지 체크리스트 인포그래픽 (24시간 답글·사진 리뷰·가짜 리뷰 금지)', cap: '소비자 97%가 리뷰 검토 — 별점 0.5↓ = 클릭 20%↓ 매출 직격.' },
  660:  { alt: '팬덤 만드는 브랜드 스토리텔링 4단계 로드맵 인포그래픽 (미션·톤앤매너·일관 발행·커뮤니티)', cap: '팬 vs 비팬: 구매 2.5배·LTV 5배 — Apple식 팬덤 4단계 공식.' },
  1475: { alt: '인스타그램 좋아요 안 늘 때 점검할 5대 지표 체크리스트 인포그래픽 (초반 1시간·CTR·완시율·해시태그)', cap: '5분 점검 — 초반 1시간 반응·CTR 3.2%·완시율 60%·해시 8-12개.' },
  1503: { alt: '2025 인스타그램 좋아요 폭발 5단계 인포그래픽 (첫 30분 결정·릴스 첫 1.5초 훅·트렌딩 음원)', cap: '첫 30분에 도달 80% 결정 — 발행 시간 + 댓글 답글 + 스토리 공유.' },
  1559: { alt: '2025 틱톡 추천 알고리즘 핵심 신호 인포그래픽 (완주율·반복 재생·공유·15-30초·첫 3초)', cap: '15-30초 영상 · 첫 3초 이탈 50%↓ · 루프 재생 ×3 가중치.' },
  1583: { alt: '2025 유튜브 노출·구독자 골든 트리오 인포그래픽 (CTR 4%·시청 50%·구독 3% 12 체크리스트)', cap: '48시간 골든타임 — CTR 4%·시청 50%·구독 3% 3종 동시 충족.' },
  1601: { alt: '2025 인스타그램 활성 팔로워 5단계 인포그래픽 (릴스·스토리·피드 균형·DM 답글·인터랙션 스티커)', cap: '활성 팔로워 = 주 3회+ 도달 + 1회+ 참여 — 도달율 30%+ 기준선.' },
  1619: { alt: '인스타그램 릴스 좋아요 3배 4축 효과 매트릭스 비교 인포그래픽 (훅·사운드·자막·해시태그)', cap: '훅 vs 사운드 vs 자막 vs 해시태그 — 도달·완시율·저장률 4축 비교.' },
  1835: { alt: '인스타그램 한 달 만에 1만 팔로워 만든 현실 루트 Do·Don\'t 체크리스트 인포그래픽 (프로필·CTA·기본 팔로워)', cap: '릴스 조회 50만 = 팔로워 20명 — 프로필 + CTA + 기본 팔로워 3단 공식.' },
};

const REPORT = [];

for (const r of results) {
  if (!r.ok) {
    REPORT.push({ id: r.id, ok: false, reason: 'upload failed' });
    continue;
  }
  const ac = altCaption[r.id];
  if (!ac) {
    REPORT.push({ id: r.id, ok: false, reason: 'no alt/caption mapping' });
    continue;
  }

  const postFile = path.join(ROOT, 'wp-content', 'posts', `${r.id}.md`);
  let content = await readFile(postFile, 'utf8');

  // 이미 인포그래픽 삽입됐는지 체크 (멱등성)
  if (content.includes(`wp-image-${r.mediaId}`) || content.includes(r.filename)) {
    console.log(`⊙ ${r.id}: 이미 삽입됨 — 스킵`);
    REPORT.push({ id: r.id, ok: true, status: 'already-inserted', mediaId: r.mediaId });
    continue;
  }

  // 첫 번째 TL;DR(wp:list) 직후 위치 찾기
  // pattern: "한눈에 보는 ... 핵심 ..." → 가장 가까운 다음 "<!-- /wp:list -->"
  const tldrIdx = content.search(/<p><strong>한눈에 보는[^<]*<\/strong><\/p>/);
  if (tldrIdx === -1) {
    // 일부 글은 형식이 약간 다를 수 있음 — paragraph wp:list 첫 인스턴스 탐지
    console.error(`✗ ${r.id}: 한눈에 보는 TL;DR 마커 못 찾음`);
    REPORT.push({ id: r.id, ok: false, reason: 'TL;DR marker not found' });
    continue;
  }
  // 우선 wp:list 닫는 태그 탐색
  let closeIdx = content.indexOf('<!-- /wp:list -->', tldrIdx);
  let closeTag = '<!-- /wp:list -->';
  // 일부 글은 wp:list wrapper 없이 plain <ul>...</ul> 사용 — fallback
  if (closeIdx === -1 || closeIdx > tldrIdx + 1500) {
    // tldr 직후 가장 가까운 </ul> 탐색
    const ulCloseIdx = content.indexOf('</ul>', tldrIdx);
    if (ulCloseIdx === -1 || ulCloseIdx > tldrIdx + 1500) {
      console.error(`✗ ${r.id}: TL;DR 직후 list 닫는 태그(wp:list 또는 </ul>) 못 찾음`);
      REPORT.push({ id: r.id, ok: false, reason: 'list close not found' });
      continue;
    }
    closeIdx = ulCloseIdx;
    closeTag = '</ul>';
  }
  const insertAfter = closeIdx + closeTag.length;

  const imageBlock = `\n\n<!-- wp:image {"id":${r.mediaId},"sizeSlug":"large","linkDestination":"none","align":"center"} -->\n<figure class="wp-block-image aligncenter size-large"><img src="${r.cdnUrl}" alt="${ac.alt}" class="wp-image-${r.mediaId}" width="600" height="${r.height}"/><figcaption class="wp-element-caption">${ac.cap}</figcaption></figure>\n<!-- /wp:image -->`;

  content = content.slice(0, insertAfter) + imageBlock + content.slice(insertAfter);
  await writeFile(postFile, content, 'utf8');
  console.log(`✓ ${r.id}: 인포그래픽 wp:image 삽입 (media ${r.mediaId})`);
  REPORT.push({ id: r.id, ok: true, mediaId: r.mediaId, slug: r.slug, cdnUrl: r.cdnUrl, height: r.height });
}

await writeFile(path.join(ROOT, 'tmp', 'infographic-insert-report.json'), JSON.stringify(REPORT, null, 2));
console.log(`\n${REPORT.filter(r => r.ok).length}/${REPORT.length} 본문 삽입 완료`);
