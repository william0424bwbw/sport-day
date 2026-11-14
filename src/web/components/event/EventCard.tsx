// I5：賽程卡片（手機列表、今日總覽、手機場地時間軸共用）
import type { ScheduleEvent } from '@shared/types';

export interface EventCardProps {
  event: ScheduleEvent;
  onClick?: () => void;
  /** compact：單行精簡版；full：顯示檢錄時間、場地、裁判摘要、狀態 */
  variant?: 'compact' | 'full';
  /** 在卡片下方顯示現場調度按鈕（管理者） */
  showLiveControls?: boolean;
}

export function EventCard({ event, onClick }: EventCardProps) {
  return (
    <button type="button" onClick={onClick} className="block w-full text-left rounded-xl border bg-white p-3">
      {event.title}
    </button>
  );
}
