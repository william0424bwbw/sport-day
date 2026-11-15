// 左欄：比賽日清單（舊版日期樹狀目錄）＋ 目前視角說明
import { CalendarCog } from 'lucide-react';
import { useState } from 'react';
import { DayPicker } from '../../components/common/DayPicker';
import { DayManager } from '../../components/manage/DayManager';
import { useCanEdit } from '../../hooks/useCanEdit';
import { useProject } from '../../stores/project';
import { useSession } from '../../stores/session';
import { cn } from '../../ui/cn';
import { Modal } from '../../ui/Modal';

const ROLE_HINTS = {
  admin: {
    cls: 'bg-blue-50/90 border-blue-100 text-blue-800',
    title: '目前：總召／管理者模式',
    body: '可拖拉新增、調整場地與檢錄、上傳道次表，修改會即時同步到雲端。',
  },
  staff: {
    cls: 'bg-amber-50/90 border-amber-100 text-amber-800',
    title: '目前：工作人員／裁判視角',
    body: '唯讀檢視。可在上方搜尋自己的名字，快速高亮自己的場次與器材明細。',
  },
  teacher: {
    cls: 'bg-emerald-50/90 border-emerald-100 text-emerald-800',
    title: '目前：班級導師精簡視角',
    body: '可點擊上方年級積木聚焦本班賽程，點開方塊即可查看檢錄與道次表。',
  },
} as const;

export function DaySidebar() {
  const role = useSession((s) => s.role);
  const adminVerified = useSession((s) => s.sync.adminVerified);
  const contact = useProject((s) => s.settings?.contact ?? '');
  const canEdit = useCanEdit();
  const [managing, setManaging] = useState(false);
  const hint = ROLE_HINTS[role];

  return (
    <aside data-testid="day-sidebar" className="w-56 bg-white border-r border-slate-200 flex flex-col shrink-0 z-20 min-h-0">
      <div className="px-3.5 py-3 border-b border-slate-100 flex items-center justify-between shrink-0">
        <span className="text-xs font-bold tracking-wider text-slate-400">賽程日期分類</span>
        {canEdit && (
          <button
            type="button"
            data-testid="manage-days"
            onClick={() => setManaging(true)}
            className="flex items-center gap-1 text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-lg text-xs font-semibold transition-colors"
            title="新增、改名或刪除比賽日"
          >
            <CalendarCog className="size-4" />
            管理
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2.5 min-h-0">
        <DayPicker layout="list" />
      </div>

      <div className="p-3 border-t border-slate-100 bg-slate-50/80 shrink-0">
        <div className={cn('rounded-xl p-2.5 border text-[11px] leading-relaxed', hint.cls)}>
          <strong>{hint.title}</strong>
          <br />
          {role === 'admin' && !adminVerified ? '尚未驗證管理者密碼，請到「雲端同步」輸入密碼後才能編輯。' : hint.body}
        </div>
        {contact.trim() && (
          <p className="mt-2 px-1 text-[11px] leading-relaxed text-slate-500 break-words" data-testid="sidebar-contact">
            有問題請聯絡：<strong className="text-slate-700">{contact}</strong>
          </p>
        )}
      </div>

      <Modal open={managing && canEdit} onClose={() => setManaging(false)} title="管理比賽日" width="lg">
        <DayManager />
      </Modal>
    </aside>
  );
}
