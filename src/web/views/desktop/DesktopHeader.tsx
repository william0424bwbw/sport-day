// 電腦版頂部列：標題、同步狀態、角色切換、雲端同步／場地管理／細流表／JSON 匯出匯入
import { CalendarRange, ClipboardList, Cloud, Download, Eye, FileSpreadsheet, MapPin, SlidersHorizontal, Upload } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import type { Role } from '@shared/types';
import { SyncBadge } from '../../components/common/SyncBadge';
import { VenueManager } from '../../components/manage/VenueManager';
import { SettingsPanel } from '../../components/settings/SettingsPanel';
import { exportBackup, onImportFileChange } from '../../features/backup';
import { RundownPanel } from '../../features/Rundown';
import { useCanEdit } from '../../hooks/useCanEdit';
import { useSession } from '../../stores/session';
import { cn } from '../../ui/cn';
import { Modal } from '../../ui/Modal';

const ROLES: { id: Role; label: string; hint: string; icon: ReactNode }[] = [
  { id: 'admin', label: '管理者', hint: '（編輯）', icon: <SlidersHorizontal className="size-3.5" /> },
  { id: 'staff', label: '工作人員', hint: '（完整細節）', icon: <ClipboardList className="size-3.5" /> },
  { id: 'teacher', label: '導師', hint: '（精簡視角）', icon: <Eye className="size-3.5" /> },
];

const toolBtn = 'flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-colors';

export function DesktopHeader() {
  const role = useSession((s) => s.role);
  const setRole = useSession((s) => s.setRole);
  const clearFilter = useSession((s) => s.clearFilter);
  const canEdit = useCanEdit();
  const [dialog, setDialog] = useState<'settings' | 'venues' | 'rundown' | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  return (
    <header className="bg-white border-b border-slate-200 px-5 py-2.5 flex items-center justify-between gap-3 shrink-0 z-30 shadow-sm">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="size-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm shrink-0">
          <CalendarRange className="size-5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold text-slate-900 tracking-tight truncate">小學運動會視覺化賽程排程系統</h1>
            <SyncBadge onClick={() => setDialog('settings')} />
          </div>
          <p className="text-[11px] text-slate-500 hidden xl:block">單一資料源 × 多視角權限 × 雙向磁吸與雲端即時同步</p>
        </div>
      </div>

      {/* 角色視角切換 */}
      <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80 shrink-0" role="group" aria-label="切換視角">
        {ROLES.map((r) => (
          <button
            key={r.id}
            type="button"
            data-testid={`role-${r.id}`}
            aria-pressed={role === r.id}
            onClick={() => {
              if (role === r.id) return;
              setRole(r.id);
              clearFilter(); // 與舊版相同：切換視角時清除篩選
            }}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
              role === r.id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900',
            )}
          >
            {r.icon}
            <span>
              {r.label}
              <span className="hidden xl:inline">{r.hint}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => setDialog('settings')}
          title="查看雲端同步狀態、輸入管理者密碼"
          className={cn(toolBtn, 'bg-sky-50 hover:bg-sky-100 text-sky-700 border-sky-200')}
        >
          <Cloud className="size-3.5" />
          <span>雲端同步</span>
        </button>
        {canEdit && (
          <button
            type="button"
            onClick={() => setDialog('venues')}
            title="新增、刪除或修改場地名稱"
            className={cn(toolBtn, 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200')}
          >
            <MapPin className="size-3.5" />
            <span>管理場地</span>
          </button>
        )}
        {role !== 'teacher' && (
          <button
            type="button"
            onClick={() => setDialog('rundown')}
            title="從排程細節生成公文格式細流表"
            className={cn(toolBtn, 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200')}
          >
            <FileSpreadsheet className="size-3.5" />
            <span>輸出細流表</span>
          </button>
        )}
        <button
          type="button"
          onClick={exportBackup}
          title="匯出 JSON 備份檔"
          aria-label="匯出 JSON"
          className={cn(toolBtn, 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-transparent font-semibold')}
        >
          <Download className="size-3.5" />
          <span className="hidden xl:inline">匯出 JSON</span>
        </button>
        {canEdit && (
          <button
            type="button"
            onClick={() => importRef.current?.click()}
            title="匯入 JSON 備份檔還原"
            aria-label="匯入 JSON"
            className={cn(toolBtn, 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-transparent font-semibold')}
          >
            <Upload className="size-3.5" />
            <span className="hidden xl:inline">匯入 JSON</span>
          </button>
        )}
        {canEdit && (
          <input ref={importRef} type="file" accept=".json,application/json" hidden data-testid="import-json-input" onChange={onImportFileChange} />
        )}
      </div>

      <Modal open={dialog === 'settings'} onClose={() => setDialog(null)} title="雲端同步與設定" width="lg">
        <SettingsPanel />
      </Modal>
      <Modal open={dialog === 'rundown' && role !== 'teacher'} onClose={() => setDialog(null)} title="賽務工作細流表" width="2xl">
        <RundownPanel />
      </Modal>
      <Modal open={dialog === 'venues' && canEdit} onClose={() => setDialog(null)} title="管理場地" width="lg">
        <VenueManager />
      </Modal>
    </header>
  );
}
