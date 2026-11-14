// 賽程方塊配色（沿用舊版 COLOR_THEMES）。Tailwind 需要完整的 class 字串，不可動態組字。

export interface EventColorClasses {
  /** 左邊框／外框顏色 */
  border: string;
  /** 卡片背景 */
  bg: string;
  /** 主要文字 */
  text: string;
  /** 時間徽章（實心） */
  badge: string;
  /** 小圓點 */
  dot: string;
}

const THEMES: Record<string, EventColorClasses> = {
  blue: {
    border: 'border-blue-500',
    bg: 'bg-gradient-to-b from-blue-50/95 to-blue-100/75',
    text: 'text-blue-950',
    badge: 'bg-blue-600 text-white',
    dot: 'bg-blue-500',
  },
  emerald: {
    border: 'border-emerald-500',
    bg: 'bg-gradient-to-b from-emerald-50/95 to-emerald-100/75',
    text: 'text-emerald-950',
    badge: 'bg-emerald-600 text-white',
    dot: 'bg-emerald-500',
  },
  amber: {
    border: 'border-amber-500',
    bg: 'bg-gradient-to-b from-amber-50/95 to-amber-100/75',
    text: 'text-amber-950',
    badge: 'bg-amber-600 text-white',
    dot: 'bg-amber-500',
  },
  rose: {
    border: 'border-rose-500',
    bg: 'bg-gradient-to-b from-rose-50/95 to-rose-100/75',
    text: 'text-rose-950',
    badge: 'bg-rose-600 text-white',
    dot: 'bg-rose-500',
  },
  purple: {
    border: 'border-purple-500',
    bg: 'bg-gradient-to-b from-purple-50/95 to-purple-100/75',
    text: 'text-purple-950',
    badge: 'bg-purple-600 text-white',
    dot: 'bg-purple-500',
  },
};

/** 依賽程的 color 取得配色；未知顏色用藍色 */
export function eventColor(color: string | undefined): EventColorClasses {
  return THEMES[color ?? ''] ?? THEMES.blue;
}
