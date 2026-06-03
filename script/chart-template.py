"""snshelp 블로그 차트 템플릿 — Editorial 톤 (Bloomberg/FT/NYT 풍).

사용 (블로그 글 작성 시):
    from script.chart_template import editorial_setup, editorial_dotplot, editorial_dumbbell, save_brand

    fig = editorial_dotplot(
        rows=['영상 품질', '캐릭터 일관성', '비용 효율'],
        cols=['Runway', 'Sora', 'Pika'],
        scores=[[5,5,2], [5,5,3], [2,3,5]],
        title='AI 영상 도구, 무엇을 잘하나',
        subtitle='5개 지표 5점 만점 비교. 원이 크고 진할수록 강함.',
        source='출처 · 공개 발표·문서 + 사용자 후기 합산',
    )
    save_brand(fig, 'wp-content/drafts/images/{slug}/N-chart.png')

원칙 (.ai-rules/asset-images.md §4.10):
- 정보 전달이 필요한 곳에만 차트 (불필요한 곳에 굳이 차트 X)
- editorial-grade 디자인 (충분한 여백, 절제된 색, 명확한 정보 hierarchy)
- 수치는 검증된 출처에서만. 출처 caption 필수.
- 한글 폰트: macOS 'Apple SD Gothic Neo', Linux 'NanumGothic'.
"""

import platform
from pathlib import Path

import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
import matplotlib as mpl
import numpy as np

# ====== Editorial 팔레트 ======
INK = '#1A1A1A'           # 본문 제목
MUTED = '#6B6B6B'         # 부제목, 라벨
FAINT = '#D1D1D1'         # 약한 데이터
SOFT_BG = '#FAFAFA'       # 배경 (살짝 따뜻한 회백)
BRAND = '#3B70FF'         # snshelp primary
BRAND_STRONG = '#2553D7'
BRAND_SOFT = '#E8F1FF'
ACCENT_WARM = '#FF6B35'   # 대비/구버전 강조

# ====== Brand 호환 컬러 (backward compat) ======
BRAND_PRIMARY = BRAND
BRAND_EDGE = '#88B1FF'
FG_DEFAULT = INK
FG_SUBTLE = MUTED
FG_MUTED = '#A6A6A6'
SURFACE_BG = '#FFFFFF'
GRID_COLOR = '#E5E7EB'
BRAND_PALETTE = [BRAND_PRIMARY, BRAND_STRONG, BRAND_EDGE, '#6B91FF', '#A5C0FF', '#CFDCFF']


def _setup_korean_font() -> str:
    system = platform.system()
    if system == 'Darwin':
        candidates = ['Apple SD Gothic Neo', 'AppleGothic', 'NanumGothic']
    elif system == 'Linux':
        candidates = ['NanumGothic', 'Noto Sans CJK KR', 'Noto Sans KR']
    elif system == 'Windows':
        candidates = ['Malgun Gothic', 'NanumGothic']
    else:
        candidates = ['NanumGothic']
    available = {f.name for f in fm.fontManager.ttflist}
    for name in candidates:
        if name in available:
            return name
    return candidates[0]


KOREAN_FONT = _setup_korean_font()


def editorial_setup():
    """Editorial 톤 mpl rcParams 적용 (figure 생성 직전 호출)."""
    mpl.rcParams.update({
        'font.family': KOREAN_FONT,
        'axes.unicode_minus': False,
        'figure.facecolor': SOFT_BG,
        'axes.facecolor': SOFT_BG,
        'axes.edgecolor': FAINT,
        'axes.labelcolor': INK,
        'axes.titleweight': 'normal',
        'axes.titlesize': 16,
        'axes.titlecolor': INK,
        'axes.titlepad': 18,
        'xtick.color': MUTED,
        'ytick.color': MUTED,
        'grid.color': '#EEEEEE',
        'grid.linewidth': 0.6,
        'axes.spines.top': False,
        'axes.spines.right': False,
        'axes.spines.left': False,
        'axes.spines.bottom': False,
    })


def _title_block(fig, title: str, subtitle: str = '', note: str = ''):
    """좌상단 제목 hierarchy: 큰 제목 + 회색 부제목 + 옅은 메모."""
    fig.text(0.05, 0.94, title, fontsize=22, fontweight='bold', color=INK)
    if subtitle:
        fig.text(0.05, 0.895, subtitle, fontsize=12, color=MUTED)
    if note:
        fig.text(0.05, 0.86, note, fontsize=11, color=MUTED, style='italic')


def _source_block(fig, source: str = ''):
    """좌하단 출처 — 작고 회색, 절제."""
    if source:
        fig.text(0.05, 0.03, source, fontsize=10, color=MUTED, style='italic')


# ====== Editorial 차트 함수 ======

def editorial_dotplot(
    rows: list[str],
    cols: list[str],
    scores: list[list[int]] | np.ndarray,
    title: str,
    subtitle: str = '',
    note: str = '',
    source: str = '',
    max_score: int = 5,
    figsize: tuple[float, float] = (14, 9),
):
    """도트 plot — 행(지표) × 열(도구·옵션) 비교. NYT 스타일.

    각 셀에 점수 표시. 점수가 높을수록 큰 원 + brand color.
    """
    editorial_setup()
    arr = np.asarray(scores)
    assert arr.shape == (len(rows), len(cols)), '데이터 shape이 rows × cols와 일치해야 함'

    fig = plt.figure(figsize=figsize)
    fig.subplots_adjust(left=0.08, right=0.96, top=0.80, bottom=0.12)
    ax = fig.add_subplot(111)

    for r, _ in enumerate(rows):
        for c, _ in enumerate(cols):
            v = int(arr[r, c])
            # 배경 옅은 가이드 원
            ax.scatter(c, r, s=900, color=FAINT, alpha=0.18, zorder=2)
            size = 200 + (v / max_score) * 800
            if v >= 4:
                color = BRAND; alpha = 0.95
                text_color = 'white'
            elif v >= 3:
                color = MUTED; alpha = 0.85
                text_color = 'white'
            else:
                color = FAINT; alpha = 0.95
                text_color = INK
            ax.scatter(c, r, s=size, color=color, alpha=alpha, zorder=3,
                       edgecolor='white', linewidth=1.5)
            ax.text(c, r, str(v), ha='center', va='center', fontsize=12,
                    color=text_color, fontweight='bold', zorder=4)

    ax.set_xticks(range(len(cols)))
    ax.set_xticklabels(cols, fontsize=12, color=INK)
    ax.set_yticks(range(len(rows)))
    ax.set_yticklabels(rows, fontsize=12, color=INK)
    ax.set_xlim(-0.6, len(cols) - 0.4)
    ax.set_ylim(-0.6, len(rows) - 0.4)
    ax.invert_yaxis()
    ax.tick_params(left=False, bottom=False, pad=10)
    ax.grid(False)

    _title_block(fig, title, subtitle, note)
    # 우상단 미니 범례
    fig.text(0.80, 0.94, '점수', fontsize=11, color=MUTED, fontweight='bold')
    fig.text(0.80, 0.91, '●  4-5  강함', fontsize=11, color=BRAND)
    fig.text(0.80, 0.885, '●  3   양호', fontsize=11, color=MUTED)
    fig.text(0.80, 0.86, '●  1-2 약함', fontsize=11, color=FAINT)
    _source_block(fig, source)
    return fig


def editorial_dumbbell(
    categories: list[str],
    before: list[float],
    after: list[float],
    before_label: str,
    after_label: str,
    title: str,
    subtitle: str = '',
    note: str = '',
    source: str = '',
    value_format: list[str] | None = None,   # 각 행마다 라벨 형식
    figsize: tuple[float, float] = (14, 9),
):
    """덤벨(dot-and-line) 차트 — Before/After 비교.

    각 카테고리마다 두 점(before, after)을 선으로 연결. 변화 크기 시각화.
    value_format: ['100만 원', '4만 원'] 같은 표시 문자열 (행당 2개 = [before_str, after_str]).
    """
    editorial_setup()
    fig = plt.figure(figsize=figsize)
    fig.subplots_adjust(left=0.30, right=0.95, top=0.80, bottom=0.12)
    ax = fig.add_subplot(111)

    n = len(categories)
    ys = list(range(n))[::-1]  # 위에서부터 그리기
    # 각 카테고리별로 max 정규화 — 모든 데이터가 100% 스케일이 되어 비교 가능
    # 단, value_format을 같이 받으니 실제 값은 라벨로 표시
    norms = []
    for b, a in zip(before, after):
        m = max(abs(b), abs(a)) or 1
        norms.append((b / m * 100, a / m * 100))

    for y, (cat, (bn, an)) in zip(ys, zip(categories, norms)):
        # 연결선
        ax.plot([bn, an], [y, y], color=FAINT, linewidth=3, zorder=1)
        # before (회색)
        ax.scatter(bn, y, s=350, color=MUTED, zorder=3, edgecolor=SOFT_BG, linewidth=2)
        # after (brand)
        ax.scatter(an, y, s=350, color=BRAND, zorder=4, edgecolor=SOFT_BG, linewidth=2)

    # y 라벨
    ax.set_yticks(ys)
    ax.set_yticklabels(categories, fontsize=13, color=INK)
    ax.tick_params(left=False, bottom=False, pad=10)
    ax.set_xticks([])
    ax.set_xlim(-15, 130)
    ax.set_ylim(-0.8, n - 0.2)
    ax.grid(False)

    # 값 라벨 (양옆에)
    for idx, y in enumerate(ys):
        bn, an = norms[idx]
        b_real, a_real = before[idx], after[idx]
        b_label = value_format[idx][0] if value_format else f'{b_real}'
        a_label = value_format[idx][1] if value_format else f'{a_real}'
        # before 값
        bx = bn - 4 if bn < an else bn + 4
        ax.text(bx, y, b_label, ha='right' if bn < an else 'left', va='center',
                fontsize=12, color=MUTED, fontweight='bold')
        # after 값
        ax_pos = an + 4 if an > bn else an - 4
        ax.text(ax_pos, y, a_label, ha='left' if an > bn else 'right', va='center',
                fontsize=13, color=BRAND_STRONG, fontweight='bold')

    _title_block(fig, title, subtitle, note)
    # 우상단 미니 범례
    fig.text(0.75, 0.94, '비교', fontsize=11, color=MUTED, fontweight='bold')
    fig.text(0.75, 0.91, '●', fontsize=14, color=MUTED)
    fig.text(0.77, 0.913, before_label, fontsize=11, color=MUTED)
    fig.text(0.75, 0.885, '●', fontsize=14, color=BRAND)
    fig.text(0.77, 0.888, after_label, fontsize=11, color=BRAND_STRONG, fontweight='bold')
    _source_block(fig, source)
    return fig


def editorial_bar(
    labels: list[str],
    values: list[float],
    title: str,
    subtitle: str = '',
    note: str = '',
    source: str = '',
    value_format: list[str] | None = None,
    horizontal: bool = True,
    figsize: tuple[float, float] = (14, 9),
):
    """깔끔한 단일 막대 — editorial 톤. 보통 가로형이 더 가독성 높음."""
    editorial_setup()
    fig = plt.figure(figsize=figsize)
    fig.subplots_adjust(left=0.30 if horizontal else 0.08, right=0.92, top=0.80, bottom=0.12)
    ax = fig.add_subplot(111)

    if horizontal:
        ys = list(range(len(labels)))[::-1]
        bars = ax.barh(ys, values, color=BRAND, edgecolor=SOFT_BG, linewidth=1, height=0.55)
        ax.set_yticks(ys)
        ax.set_yticklabels(labels, fontsize=13, color=INK)
        ax.set_xticks([])
        ax.set_xlim(0, max(values) * 1.18)
        for y, v, b in zip(ys, values, bars):
            label = value_format[ys[::-1].index(y)] if value_format else f'{v}'
            ax.text(v + max(values) * 0.015, y, label, va='center', fontsize=13,
                    color=BRAND_STRONG, fontweight='bold')
    else:
        xs = list(range(len(labels)))
        bars = ax.bar(xs, values, color=BRAND, edgecolor=SOFT_BG, linewidth=1, width=0.55)
        ax.set_xticks(xs)
        ax.set_xticklabels(labels, fontsize=13, color=INK)
        ax.set_yticks([])
        ax.set_ylim(0, max(values) * 1.18)
        for x, v, b in zip(xs, values, bars):
            label = value_format[x] if value_format else f'{v}'
            ax.text(x, v + max(values) * 0.015, label, ha='center', fontsize=13,
                    color=BRAND_STRONG, fontweight='bold')

    ax.tick_params(left=False, bottom=False, pad=10)
    ax.grid(False)
    _title_block(fig, title, subtitle, note)
    _source_block(fig, source)
    return fig


def save_brand(fig, output_path: str, dpi: int = 120) -> str:
    """차트 저장. PNG 절대 경로 반환."""
    out = Path(output_path).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out, dpi=dpi, bbox_inches='tight', facecolor=SOFT_BG)
    plt.close(fig)
    return str(out)


# ====== Backward compat (구버전 함수) ======

def _apply_source(fig, source):
    """compat: 구버전 _apply_source 호출 → editorial _source_block로 매핑."""
    _source_block(fig, source)


def bar_chart(data, title='', ylabel='', source=None, horizontal=False, figsize=(16, 9)):
    """구버전 호환. editorial_bar로 위임."""
    labels = [d[0] for d in data]
    values = [d[1] for d in data]
    return editorial_bar(labels, values, title=title, source=source or '',
                         horizontal=horizontal, figsize=figsize)


if __name__ == '__main__':
    # 동작 테스트: editorial dotplot
    fig = editorial_dotplot(
        rows=['영상 품질', '캐릭터 일관성', '한국어 적응', '비용 효율', '릴스 적합도'],
        cols=['Runway\nGen-4', 'OpenAI\nSora', 'Google\nVeo 3', 'HeyGen', 'Pika\n2.0'],
        scores=[[5, 5, 3, 2, 5], [5, 5, 4, 3, 3], [3, 2, 3, 3, 3], [2, 3, 3, 3, 5], [5, 4, 4, 5, 3]],
        title='AI 영상 도구 5종, 무엇을 잘하나',
        subtitle='릴스 마케팅에 쓸 5개 도구를 5개 지표(5점 만점)로 비교했습니다.',
        note='원이 크고 진할수록 해당 지표가 강함.',
        source='출처 · 공개 발표·문서 + 2026 사용자 후기 합산.   snshelp.com',
    )
    out = save_brand(fig, 'tmp/test-dotplot.png')
    print(f'dotplot: {out}')

    fig = editorial_dumbbell(
        categories=['제작 비용 (릴스 1편)', '제작 시간 (릴스 1편)', '필요 인력', '월간 실험 횟수'],
        before=[100, 168, 4, 2],
        after=[4, 3, 1, 10],
        before_label='외주 영상 (전통)',
        after_label='AI 영상 도구',
        title='외주 vs AI 영상 도구',
        subtitle='릴스 1편 기준 4개 지표 비교. AI 도구가 비용·시간을 극적으로 줄입니다.',
        source='기준 · 외주 일반 단가 + AI Runway $25/월 마케터 1인 환산',
        value_format=[['100만 원', '4만 원'], ['7일 (168h)', '3시간'], ['4명', '1명'], ['2회', '10회']],
    )
    out = save_brand(fig, 'tmp/test-dumbbell.png')
    print(f'dumbbell: {out}')
