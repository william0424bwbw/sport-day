// I5：司令台時段表單（類型、時間、人員、內容）
export interface CommandSlotEditorModalProps {
  open: boolean;
  onClose: () => void;
  dayId: string;
  /** 編輯既有時段；不給則新增 */
  slotId?: string;
}

export function CommandSlotEditorModal(_props: CommandSlotEditorModalProps) {
  return null;
}
