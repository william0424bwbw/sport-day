// I5：司令台時段列表（顯示當日播報／頒獎；管理者可啟用、新增、編輯、刪除）
export interface CommandDeckProps {
  dayId: string;
  /** strip：電腦版格狀表上方橫向列；list：手機版卡片列表 */
  layout?: 'strip' | 'list';
}

export function CommandDeck(_props: CommandDeckProps) {
  return null;
}
