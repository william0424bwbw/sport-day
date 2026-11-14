// I5：賽程細節（電腦版右側面板、手機版底部滑出面板共用）
// 內容：時間、檢錄、場地、裁判、器材、志工、公差、備註、附件；
// 管理者另有：編輯、複製、刪除、LiveControls
export interface EventDetailProps {
  eventId: string;
  /** 按下「編輯」：由呼叫端開啟 EventEditorModal */
  onEdit?: () => void;
  /** 刪除或關閉後通知呼叫端 */
  onClose?: () => void;
}

export function EventDetail({ eventId }: EventDetailProps) {
  return <div>賽程細節 {eventId}（I5 實作中）</div>;
}
