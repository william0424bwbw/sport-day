// I5：新增／編輯賽程表單（手機全螢幕、電腦對話框）
// 編輯草稿，按「儲存」才寫入 store；取消則捨棄
import type { ScheduleEvent } from '@shared/types';

export interface EventEditorModalProps {
  open: boolean;
  onClose: () => void;
  /** 編輯既有賽程 */
  eventId?: string;
  /** 新增賽程的初始值（例如點擊格狀表空白處帶入的日期、場地、時間） */
  init?: Partial<ScheduleEvent> & { dateId: string; venueIds: string[]; startMin: number };
  /** 新增成功後回傳新 id */
  onSaved?: (id: string) => void;
}

export function EventEditorModal(_props: EventEditorModalProps) {
  return null;
}
