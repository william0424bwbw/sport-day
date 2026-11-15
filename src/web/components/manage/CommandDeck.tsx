// I5：司令台時段列表（顯示當日播報／頒獎；管理者可啟用、新增、編輯、刪除）
// 外觀沿用舊版第 7 區「司令台中控置頂層」：深色底、類型徽章、時間、人員、內容
import { ClipboardList, EyeOff, Megaphone, Mic, Plus, Trophy } from 'lucide-react';
import { useState } from 'react';
import type { CommandSlot } from '@shared/types';
import { formatRange } from '@shared/time';
import { useCanEdit } from '../../hooks/useCanEdit';
import { useProject } from '../../stores/project';
import { useSession } from '../../stores/session';
import { Button } from '../../ui/Button';
import { cn } from '../../ui/cn';
import { toast } from '../../ui/Toast';
import { slotTypeLabel } from '../common/labels';
import { CommandSlotEditorModal } from './CommandSlotEditorModal';

export interface CommandDeckProps {
  dayId: string;
  /** strip：電腦版格狀表上方橫向列；list：手機版卡片列表 */
  layout?: 'strip' | 'list';
  className?: string;
}

function slotBadge(type: string) {
  if (type === 'award') return { cls: 'bg-amber-400 text-slate-950', icon: <Trophy className="size-3" aria-hidden /> };
  if (type === 'record') return { cls: 'bg-emerald-400 text-slate-950', icon: <ClipboardList className="size-3" aria-hidden /> };
  return { cls: 'bg-sky-400 text-slate-950', icon: <Mic className="size-3" aria-hidden /> };
}

export function CommandDeck({ dayId, layout = 'strip', className }: CommandDeckProps) {
  const day = useProject((s) => s.dates.find((d) => d.id === dayId));
  const query = useSession((s) => s.filter.query);
  const canEdit = useCanEdit();
  // editing：undefined = 關閉；'' = 新增；其他 = 編輯該時段
  const [editing, setEditing] = useState<string | undefined>(undefined);

  if (!day) return null;
  const enabled = Boolean(day.commandDeckEnabled);
  const strip = layout === 'strip';

  const setEnabled = (v: boolean) => {
    useProject.getState().updateDay(dayId, { commandDeckEnabled: v });
    toast(v ? '已開啟本日司令台' : '已收起本日司令台');
  };

  const modal = (
    <CommandSlotEditorModal open={editing !== undefined} onClose={() => setEditing(undefined)} dayId={dayId}
      slotId={editing || undefined} />
  );

  if (!enabled) {
    if (!canEdit) return null;
    return (
      <div className={className}>
        <Button size={strip ? 'sm' : 'md'} variant="ghost" icon={<Megaphone className="size-4" />}
          className="border border-dashed border-slate-300" onClick={() => setEnabled(true)}>
          啟用司令台
        </Button>
        {modal}
      </div>
    );
  }

  const slots = [...(day.commandSlots ?? [])].sort((a, b) => a.startMin - b.startMin);
  const q = query.trim().toLowerCase();

  const slotCard = (slot: CommandSlot) => {
    const badge = slotBadge(slot.type);
    const match = !q || (slot.staff || '').toLowerCase().includes(q) || (slot.content || '').toLowerCase().includes(q);
    const inner = (
      <>
        <div className="mb-0.5 flex items-center justify-between gap-2">
          <span className={cn('inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-extrabold', badge.cls)}>
            {badge.icon}
            {slotTypeLabel(slot.type)}
          </span>
          <span className="font-mono text-xs font-bold tabular-nums text-amber-300">{formatRange(slot.startMin, slot.endMin)}</span>
        </div>
        <div className={cn('text-sm font-bold text-white', strip && 'truncate')}>{slot.staff || '未指定人員'}</div>
        {slot.content && <div className={cn('text-xs text-slate-300', strip ? 'truncate' : 'break-words')}>{slot.content}</div>}
      </>
    );
    const cls = cn(
      'block rounded-xl border border-white/15 px-3 py-1.5 text-left transition-all',
      strip ? 'w-56 shrink-0' : 'w-full min-h-11',
      q ? (match ? 'bg-white/20 ring-2 ring-amber-400' : 'opacity-30') : 'bg-white/10',
      canEdit && 'hover:bg-white/15 cursor-pointer',
    );
    return canEdit ? (
      <button key={slot.id} type="button" className={cls} onClick={() => setEditing(slot.id)} title="點一下修改這個時段">
        {inner}
      </button>
    ) : (
      <div key={slot.id} className={cls}>
        {inner}
      </div>
    );
  };

  const actions = canEdit && (
    <div className="flex shrink-0 gap-1.5">
      <Button size={strip ? 'sm' : 'md'} variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing('')}>
        新增播報／頒獎
      </Button>
      <Button size={strip ? 'sm' : 'md'} variant="ghost" className="text-slate-300 hover:bg-white/10 active:bg-white/20"
        icon={<EyeOff className="size-4" />} onClick={() => setEnabled(false)}>
        收起
      </Button>
    </div>
  );

  const empty = (
    <div className="py-1 text-xs text-slate-400">
      尚未排定司令台時段{canEdit ? '，可按「新增播報／頒獎」建立' : ''}
    </div>
  );

  // Modal 放在 section 外面：<dialog> 會繼承父層的白色文字
  return (
    <>
    <section
      aria-label="司令台"
      data-testid="command-deck"
      className={cn('rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 text-white shadow-sm', strip ? 'px-3 py-2' : 'p-3', className)}
    >
      {strip ? (
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex shrink-0 items-center gap-1.5 text-sm font-bold">
            <Megaphone className="size-4 text-amber-300" aria-hidden />
            司令台
          </div>
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto py-0.5">{slots.length ? slots.map(slotCard) : empty}</div>
          {actions}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-base font-bold">
              <Megaphone className="size-4 text-amber-300" aria-hidden />
              司令台
            </div>
            {actions}
          </div>
          <div className="space-y-2">{slots.length ? slots.map(slotCard) : empty}</div>
        </div>
      )}
    </section>
    {modal}
    </>
  );
}
