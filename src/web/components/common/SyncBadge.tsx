// I5：同步狀態徽章（即時同步／輪詢／離線／可編輯／瀏覽，線上人數）
import { Eye, PenLine, Users } from 'lucide-react';
import { useCanEdit } from '../../hooks/useCanEdit';
import { useSession } from '../../stores/session';
import { cn } from '../../ui/cn';
import { CONNECTION_DOT, CONNECTION_LABEL } from './labels';

export interface SyncBadgeProps {
  /** 點擊徽章（例如跳到設定頁） */
  onClick?: () => void;
  className?: string;
}

export function SyncBadge({ onClick, className }: SyncBadgeProps) {
  const sync = useSession((s) => s.sync);
  const canEdit = useCanEdit();
  const label = CONNECTION_LABEL[sync.connection];
  const title = [
    `連線：${label}`,
    sync.pending ? '有尚未上傳的修改' : null,
    sync.online !== null ? `線上 ${sync.online} 人` : null,
    canEdit ? '可編輯' : '瀏覽模式',
    sync.error,
  ]
    .filter(Boolean)
    .join('｜');

  const content = (
    <>
      <span className="inline-flex items-center gap-1.5">
        <span className={cn('size-2 rounded-full', CONNECTION_DOT[sync.connection])} aria-hidden />
        <span>{label}</span>
        {sync.pending && <span className="text-amber-600">・待上傳</span>}
      </span>
      {sync.online !== null && (
        <span className="inline-flex items-center gap-0.5 text-slate-500" aria-label={`線上 ${sync.online} 人`}>
          <Users className="size-3.5" aria-hidden />
          {sync.online}
        </span>
      )}
      <span
        className={cn(
          'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5',
          canEdit ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500',
        )}
      >
        {canEdit ? <PenLine className="size-3" aria-hidden /> : <Eye className="size-3" aria-hidden />}
        {canEdit ? '可編輯' : '瀏覽'}
      </span>
    </>
  );

  const cls = cn(
    'inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700',
    onClick ? 'min-h-11 hover:bg-slate-50' : 'min-h-8',
    className,
  );

  return onClick ? (
    <button type="button" className={cls} title={title} onClick={onClick} data-testid="sync-badge">
      {content}
    </button>
  ) : (
    <div className={cls} title={title} role="status" data-testid="sync-badge">
      {content}
    </div>
  );
}
