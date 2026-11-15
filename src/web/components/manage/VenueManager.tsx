// I5：場地管理（新增、改名、副標、刪除），手機設定頁與電腦對話框共用
import { MapPin, Plus, Trash2 } from 'lucide-react';
import { useCanEdit } from '../../hooks/useCanEdit';
import { useProject } from '../../stores/project';
import { Button, IconButton } from '../../ui/Button';
import { confirmDialog } from '../../ui/ConfirmDialog';
import { TextField } from '../../ui/Field';
import { toast } from '../../ui/Toast';

export function VenueManager() {
  const venues = useProject((s) => s.venues);
  const events = useProject((s) => s.events);
  const canEdit = useCanEdit();

  const add = () => {
    useProject.getState().addVenue();
    toast('已新增場地', 'success');
  };

  const remove = async (id: string, name: string) => {
    if (useProject.getState().venues.length <= 1) {
      toast('至少需保留一個場地', 'error');
      return;
    }
    const used = events.filter((e) => e.venueIds.includes(id)).length;
    const ok = await confirmDialog({
      title: '刪除場地？',
      message: used
        ? `確定要刪除「${name}」嗎？有 ${used} 個賽程使用這個場地，會改到其他場地（只有這個場地的賽程會移到第一個場地）。`
        : `確定要刪除「${name}」嗎？`,
      confirmText: '刪除',
      danger: true,
    });
    if (!ok) return;
    const before = useProject.getState().venues.length;
    useProject.getState().deleteVenue(id);
    if (useProject.getState().venues.length === before) toast('至少需保留一個場地', 'error');
    else toast(`已刪除場地「${name}」`);
  };

  if (!canEdit) {
    return (
      <ul className="space-y-2">
        {venues.map((v) => (
          <li key={v.id} className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-3">
            <MapPin className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
            <div className="min-w-0">
              <div className="font-semibold break-words">{v.name}</div>
              {v.subtitle && <div className="text-sm text-slate-500 break-words">{v.subtitle}</div>}
            </div>
          </li>
        ))}
        {venues.length === 0 && <li className="text-sm text-slate-400">尚未建立場地</li>}
      </ul>
    );
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {venues.map((v, i) => (
          <li key={v.id} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-start gap-2">
              <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                <TextField label={`場地 ${i + 1} 名稱`} value={v.name}
                  onChange={(e) => useProject.getState().updateVenue(v.id, { name: e.target.value })} />
                <TextField label="副標" value={v.subtitle ?? ''} placeholder="例如：100M 直線跑道"
                  onChange={(e) => useProject.getState().updateVenue(v.id, { subtitle: e.target.value })} />
              </div>
              <IconButton label={`刪除場地 ${v.name}`} className="mt-6 shrink-0 hover:text-rose-600" onClick={() => void remove(v.id, v.name)}>
                <Trash2 className="size-4" />
              </IconButton>
            </div>
          </li>
        ))}
      </ul>
      <Button icon={<Plus className="size-4" />} onClick={add}>
        新增場地
      </Button>
    </div>
  );
}
