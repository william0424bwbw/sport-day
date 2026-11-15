// I5：司令台時段表單（類型、時間、人員、內容）
import { Check, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { COMMAND_SLOT_TYPES } from '@shared/constants';
import type { CommandSlot } from '@shared/types';
import { useProject } from '../../stores/project';
import { Button } from '../../ui/Button';
import { confirmDialog } from '../../ui/ConfirmDialog';
import { SelectField, TextArea, TextField, TimeSelect } from '../../ui/Field';
import { Modal } from '../../ui/Modal';
import { toast } from '../../ui/Toast';
import { slotTypeLabel } from '../common/labels';

export interface CommandSlotEditorModalProps {
  open: boolean;
  onClose: () => void;
  dayId: string;
  /** 編輯既有時段；不給則新增 */
  slotId?: string;
}

export function CommandSlotEditorModal(props: CommandSlotEditorModalProps) {
  if (!props.open) return null;
  return <SlotEditorInner key={`${props.dayId}:${props.slotId ?? 'new'}`} {...props} />;
}

/** 時段草稿（新增時 id 為空字串） */
type SlotDraft = CommandSlot;

function initialDraft(dayId: string, slotId?: string): SlotDraft | null {
  const day = useProject.getState().dates.find((d) => d.id === dayId);
  if (!day) return null;
  if (slotId) {
    const slot = (day.commandSlots ?? []).find((s) => s.id === slotId);
    if (!slot) return null;
    return { ...slot, staff: slot.staff ?? '', content: slot.content ?? '' };
  }
  // 舊版預設：穿插頒獎 09:30–10:30
  return { id: '', type: 'award', startMin: 570, endMin: 630, staff: '', content: '' };
}

function SlotEditorInner({ onClose, dayId, slotId }: CommandSlotEditorModalProps) {
  const [draft, setDraft] = useState<SlotDraft | null>(() => initialDraft(dayId, slotId));
  const [error, setError] = useState<string | null>(null);
  const title = slotId ? '編輯司令台時段' : '新增司令台時段';

  if (!draft) {
    return (
      <Modal open onClose={onClose} title={title} variant="fullscreen" width="md" footer={<Button onClick={onClose}>取消</Button>}>
        <p className="text-sm text-slate-500">找不到這個時段（可能已被其他裝置刪除）。</p>
      </Modal>
    );
  }

  const patch = (p: Partial<SlotDraft>) => {
    setDraft((d) => (d ? { ...d, ...p } : d));
    setError(null);
  };

  const save = () => {
    if (draft.endMin <= draft.startMin) {
      const msg = '結束時間必須晚於開始時間';
      setError(msg);
      toast(msg, 'error');
      return;
    }
    const id = useProject.getState().upsertCommandSlot(dayId, {
      ...draft,
      // 新增時 id 為空字串，store 會產生新的 id
      id: slotId || undefined,
      staff: (draft.staff ?? '').trim(),
      content: (draft.content ?? '').trim(),
    });
    if (!id) {
      toast('找不到這個比賽日，無法儲存', 'error');
      return;
    }
    toast('已更新司令台時段', 'success');
    onClose();
  };

  const remove = async () => {
    if (!slotId) return;
    const ok = await confirmDialog({
      title: '刪除司令台時段？',
      message: `確定要刪除這個「${slotTypeLabel(draft.type)}」時段嗎？`,
      confirmText: '刪除',
      danger: true,
    });
    if (!ok) return;
    useProject.getState().deleteCommandSlot(dayId, slotId);
    toast('已刪除該司令台時段');
    onClose();
  };

  const typeKnown = COMMAND_SLOT_TYPES.some((t) => t.id === draft.type);

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      variant="fullscreen"
      width="md"
      footer={
        <>
          {slotId && (
            <Button variant="ghost" className="mr-auto text-rose-600 hover:bg-rose-50" icon={<Trash2 className="size-4" />}
              onClick={() => void remove()}>
              刪除
            </Button>
          )}
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" icon={<Check className="size-4" />} onClick={save}>
            儲存
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-4">
        <SelectField label="類型" value={draft.type} onChange={(e) => patch({ type: e.target.value })}>
          {!typeKnown && <option value={draft.type}>{slotTypeLabel(draft.type)}</option>}
          {COMMAND_SLOT_TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </SelectField>
        <div className="grid grid-cols-2 gap-3">
          <TimeSelect label="開始時間" value={draft.startMin} onValueChange={(v) => patch({ startMin: v })} />
          <TimeSelect label="結束時間" value={draft.endMin} onValueChange={(v) => patch({ endMin: v })} />
        </div>
        {error && (
          <p role="alert" className="text-sm font-semibold text-rose-600">
            {error}
          </p>
        )}
        <TextField label="人員" value={draft.staff ?? ''} placeholder="例如：佩琳、珠芸" onChange={(e) => patch({ staff: e.target.value })} />
        <TextArea label="內容" value={draft.content ?? ''} placeholder="例如：頒發一年級立定跳遠前三名"
          onChange={(e) => patch({ content: e.target.value })} />
      </div>
    </Modal>
  );
}
