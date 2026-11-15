// 道次表附件：清單（可預覽、可刪除）、上傳按鈕（拍照／選擇檔案）、預覽視窗
import { Camera, FileText, Image as ImageIcon, Paperclip, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import type { Attachment } from '@shared/types';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import { Button, IconButton } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { toast } from '../../ui/Toast';
import { fileToAttachment } from './attachmentUtils';

/** data URL 轉成 blob URL（手機瀏覽器較能開啟 PDF；長字串不會塞進 DOM） */
function dataUrlToBlobUrl(dataUrl: string): string | null {
  try {
    const [head, body] = dataUrl.split(',', 2);
    const mime = /data:([^;]+)/.exec(head)?.[1] ?? 'application/octet-stream';
    const bin = head.includes(';base64') ? atob(body) : decodeURIComponent(body);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  } catch {
    return null;
  }
}

interface PreviewState {
  att: Attachment;
  url: string;
  revoke: boolean;
}

export interface AttachmentListProps {
  attachments: Attachment[];
  /** 給了才顯示刪除按鈕（編輯表單） */
  onRemove?: (index: number) => void;
  /** 預覽視窗標題前綴（例如賽程名稱） */
  titlePrefix?: string;
  emptyText?: string;
}

/** 附件清單：點名稱預覽 */
export function AttachmentList({ attachments, onRemove, titlePrefix, emptyText = '尚未上傳道次表或選手名單' }: AttachmentListProps) {
  const [preview, setPreview] = useState<PreviewState | null>(null);

  const open = (att: Attachment) => {
    if (!att.dataUrl) {
      toast('這個附件沒有檔案內容', 'error');
      return;
    }
    const blob = att.type === 'pdf' ? dataUrlToBlobUrl(att.dataUrl) : null;
    setPreview({ att, url: blob ?? att.dataUrl, revoke: blob !== null });
  };
  const close = () => {
    if (preview?.revoke) URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  if (attachments.length === 0) return <p className="text-sm text-slate-400">{emptyText}</p>;

  return (
    <>
      <ul className="space-y-1.5">
        {attachments.map((att, idx) => (
          <li key={`${idx}-${att.name}`} className="flex min-w-0 items-center gap-1 rounded-xl border border-slate-200 bg-white pl-1">
            <button
              type="button"
              onClick={() => open(att)}
              className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-left text-sm font-semibold text-blue-700 hover:underline"
            >
              {att.type === 'pdf' ? <FileText className="size-4 shrink-0" /> : <ImageIcon className="size-4 shrink-0" />}
              <span className="truncate">{att.name || '未命名附件'}</span>
            </button>
            {onRemove && (
              <IconButton label={`移除附件 ${att.name}`} onClick={() => onRemove(idx)} className="shrink-0 hover:text-rose-600">
                <Trash2 className="size-4" />
              </IconButton>
            )}
          </li>
        ))}
      </ul>
      <Modal
        open={preview !== null}
        onClose={close}
        title={preview ? `${titlePrefix ? `${titlePrefix} — ` : ''}${preview.att.name}` : ''}
        variant="fullscreen"
        width="xl"
        footer={
          preview && (
            <>
              <a
                href={preview.url}
                download={preview.att.name}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                開啟／下載
              </a>
              <Button variant="primary" onClick={close}>
                關閉預覽
              </Button>
            </>
          )
        }
      >
        {preview &&
          (preview.att.type === 'pdf' ? (
            <iframe title={preview.att.name} src={preview.url} className="h-[70dvh] w-full rounded-xl border border-slate-200 bg-white" />
          ) : (
            <img src={preview.url} alt={preview.att.name} className="mx-auto max-h-[75dvh] max-w-full rounded-xl object-contain shadow" />
          ))}
      </Modal>
    </>
  );
}

export interface AttachmentUploaderProps {
  onAdd: (attachments: Attachment[]) => void;
}

/** 上傳按鈕：手機有「拍照」（直接開相機）與「選擇檔案」（圖片、PDF） */
export function AttachmentUploader({ onAdd }: AttachmentUploaderProps) {
  const isDesktop = useIsDesktop();
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handle = async (input: HTMLInputElement) => {
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length === 0) return;
    setBusy(true);
    const added: Attachment[] = [];
    for (const file of files) {
      const r = await fileToAttachment(file);
      if (r.ok) {
        added.push(r.attachment);
        toast(r.attachment.type === 'pdf' ? `已加入 PDF：${r.attachment.name}` : `已加入道次圖：${r.attachment.name}`, 'success');
      } else {
        toast(r.error, 'error');
      }
    }
    setBusy(false);
    if (added.length) onAdd(added);
  };

  return (
    <div className="flex flex-wrap gap-2">
      {!isDesktop && (
        <Button icon={<Camera className="size-4" />} disabled={busy} onClick={() => cameraRef.current?.click()}>
          拍照
        </Button>
      )}
      <Button icon={<Paperclip className="size-4" />} disabled={busy} onClick={() => fileRef.current?.click()}>
        選擇檔案
      </Button>
      {busy && <span className="self-center text-sm text-slate-500">處理中…</span>}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-label="拍照上傳道次表"
        onChange={(e) => void handle(e.currentTarget)}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf,.pdf"
        multiple
        className="hidden"
        aria-label="選擇道次表檔案"
        onChange={(e) => void handle(e.currentTarget)}
      />
    </div>
  );
}
