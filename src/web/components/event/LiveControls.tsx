// I5：現場調度（標記開始／結束、重設、±5 分、延後後續賽程）。只有 useCanEdit() 為 true 時顯示
export interface LiveControlsProps {
  eventId: string;
  /** large：手機大按鈕；compact：電腦面板 */
  size?: 'large' | 'compact';
}

export function LiveControls(_props: LiveControlsProps) {
  return null;
}
