// JSON 備份匯出與匯入（舊版 exportJsonData、importJsonData）
// 匯入會整份取代目前資料並上傳到雲端，所以一定先顯示確認對話框（含新舊筆數）
import type { ChangeEvent } from 'react';
import { projectSnapshot, useProject } from '../stores/project';
import { useSession } from '../stores/session';
import { confirmDialog } from '../ui/ConfirmDialog';
import { toast } from '../ui/Toast';
import { downloadText } from './download';
import { backupFileName, parseBackupJson, summarize, toBackupJson } from './exportData';

export function exportBackup(): void {
  downloadText(backupFileName(), toBackupJson(projectSnapshot()), 'application/json');
  toast('已匯出 JSON 備份檔', 'success');
}

/** 給 <input type="file"> 的 onChange：讀取選取的檔案後清空，下次選同一個檔案也會觸發 */
export function onImportFileChange(e: ChangeEvent<HTMLInputElement>): void {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (file) void importBackup(file);
}

/** 匯入選取的 JSON 檔；成功回傳 true */
export async function importBackup(file: File): Promise<boolean> {
  const result = parseBackupJson(await file.text());
  if (!result.ok) {
    toast(`無法匯入：${result.error}`, 'error');
    return false;
  }
  const ok = await confirmDialog({
    title: '匯入並取代全部資料？',
    message: (
      <div className="space-y-2" data-testid="import-summary">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="font-bold text-slate-500">目前</dt>
          <dd>{summarize(projectSnapshot())}</dd>
          <dt className="font-bold text-slate-500">匯入</dt>
          <dd>{summarize(result.data)}</dd>
        </dl>
        <p>匯入後會取代雲端上的所有資料，所有裝置都會跟著更新，無法復原。建議先匯出一份 JSON 備份。</p>
      </div>
    ),
    confirmText: '匯入',
    danger: true,
  });
  if (!ok) return false;
  // 舊的備份檔沒有 settings：保留目前的聯絡窗口等設定，不要清空
  const settings = result.data.settings ?? projectSnapshot().settings;
  useProject.getState().replaceAll({ ...result.data, settings }, 'local');
  const session = useSession.getState();
  session.selectEvent(null);
  session.clearFilter();
  toast('已從 JSON 備份還原所有資料', 'success');
  return true;
}
