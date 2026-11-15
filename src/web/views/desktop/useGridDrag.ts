// 格狀表的拖曳邏輯（Pointer Events：滑鼠、觸控筆、平板觸控都能用）
// 對應舊版 handleToolboxDragStart、startResizeEvent、moveEventTo：
// - 拖曳方塊：移動時間（10 分鐘磁格）與場地欄
// - 拖曳上／下邊緣：調整開始／結束時間
// - 拖曳「拖曳新增項目」積木到時間格：新增賽程
// 拖曳過程只更新預覽，放開時才寫入 store（一次修改、一次同步）。
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { DAY_END_MIN, DAY_START_MIN, STEP_MINUTES } from '@shared/constants';
import { snapToStep } from '@shared/time';
import type { ScheduleEvent, Venue } from '@shared/types';
import { eventColumns, SLOT_HEIGHT } from './gridLayout';

export type DragMode = 'move' | 'top' | 'bottom' | 'new';

/** 拖曳中的預覽 */
export type DragPreview =
  | { kind: 'event'; mode: 'move' | 'top' | 'bottom'; eventId: string; startMin: number; endMin: number; minCol: number; span: number }
  | { kind: 'new'; startMin: number; col: number; inside: boolean; clientX: number; clientY: number };

interface Session {
  mode: DragMode;
  pointerId: number;
  pointerType: string;
  eventId: string;
  origStart: number;
  origEnd: number;
  origCol: number;
  span: number;
  /** 按下時指標所在的分鐘數與欄位（換算位移用，捲動後仍正確） */
  downMin: number;
  downCol: number;
  downX: number;
  downY: number;
  lastX: number;
  lastY: number;
  active: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  current: DragPreview | null;
}

export interface GridDragOptions {
  canvasRef: RefObject<HTMLDivElement | null>;
  scrollRef: RefObject<HTMLDivElement | null>;
  venues: Venue[];
  onMove: (eventId: string, startMin: number, venueId: string | undefined) => void;
  onResize: (eventId: string, startMin: number, endMin: number) => void;
  onCreate: (venueId: string, startMin: number) => void;
  /** 點一下積木（沒有拖曳）時的提示 */
  onToolboxClick?: () => void;
}

/** 滑鼠移動超過幾 px 才算拖曳（避免點擊誤觸） */
const MOUSE_THRESHOLD = 4;
/** 觸控：長按多久開始拖曳（ms）；長按前移動超過 TOUCH_SLOP 視為捲動 */
const TOUCH_HOLD_MS = 300;
const TOUCH_SLOP = 8;
/** 靠近捲動區邊緣多少 px 時自動捲動 */
const AUTO_SCROLL_EDGE = 48;
const AUTO_SCROLL_MAX = 18;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function samePreview(a: DragPreview | null, b: DragPreview | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function useGridDrag(opts: GridDragOptions) {
  const [preview, setPreview] = useState<DragPreview | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const suppressClickRef = useRef(false);
  // 最新的參數（事件處理器在拖曳期間會被呼叫很多次，不必重新綁定）
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });

  useEffect(() => () => cleanupRef.current?.(), []);

  /** 視窗座標 → 時間軸分鐘數與場地欄 */
  const pointToGrid = useCallback((x: number, y: number) => {
    const canvas = optsRef.current.canvasRef.current;
    const n = Math.max(1, optsRef.current.venues.length);
    if (!canvas) return { min: DAY_START_MIN, col: 0, inside: false };
    const r = canvas.getBoundingClientRect();
    const min = DAY_START_MIN + ((y - r.top) / SLOT_HEIGHT) * STEP_MINUTES;
    const col = Math.floor((x - r.left) / (r.width / n));
    // 也要在捲動區可見範圍內才算放在格狀表上
    const scroll = optsRef.current.scrollRef.current?.getBoundingClientRect();
    const inView = !scroll || (x >= scroll.left && x <= scroll.right && y >= scroll.top && y <= scroll.bottom);
    const inside = inView && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    return { min, col, inside };
  }, []);

  const compute = useCallback(
    (s: Session, x: number, y: number): DragPreview => {
      const n = Math.max(1, optsRef.current.venues.length);
      const g = pointToGrid(x, y);
      if (s.mode === 'new') {
        const slot = DAY_START_MIN + Math.floor((g.min - DAY_START_MIN) / STEP_MINUTES) * STEP_MINUTES;
        return {
          kind: 'new',
          startMin: clamp(slot, DAY_START_MIN, DAY_END_MIN - STEP_MINUTES),
          col: clamp(g.col, 0, n - 1),
          inside: g.inside,
          clientX: x,
          clientY: y,
        };
      }
      const delta = snapToStep(g.min - s.downMin);
      const base = { kind: 'event' as const, mode: s.mode, eventId: s.eventId, span: s.span };
      if (s.mode === 'top') {
        const startMin = clamp(s.origStart + delta, DAY_START_MIN, s.origEnd - STEP_MINUTES);
        return { ...base, startMin, endMin: s.origEnd, minCol: s.origCol };
      }
      if (s.mode === 'bottom') {
        const endMin = clamp(s.origEnd + delta, s.origStart + STEP_MINUTES, DAY_END_MIN);
        return { ...base, startMin: s.origStart, endMin, minCol: s.origCol };
      }
      const dur = s.origEnd - s.origStart;
      const startMin = clamp(s.origStart + delta, DAY_START_MIN, Math.max(DAY_START_MIN, DAY_END_MIN - dur));
      const minCol = clamp(s.origCol + (g.col - s.downCol), 0, n - 1);
      return { ...base, startMin, endMin: Math.min(DAY_END_MIN, startMin + dur), minCol };
    },
    [pointToGrid],
  );

  const update = useCallback(
    (s: Session) => {
      const next = compute(s, s.lastX, s.lastY);
      if (!samePreview(next, s.current)) {
        s.current = next;
        setPreview(next);
      }
    },
    [compute],
  );

  const finish = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    sessionRef.current = null;
    setPreview(null);
  }, []);

  const commit = useCallback(
    (s: Session) => {
      const p = s.current;
      const o = optsRef.current;
      if (!p) return;
      if (p.kind === 'new') {
        const venue = o.venues[p.col];
        if (p.inside && venue) o.onCreate(venue.id, p.startMin);
        return;
      }
      // 放開後瀏覽器會補一個 click，短時間內略過，避免被當成「選取」
      suppressClickRef.current = true;
      setTimeout(() => {
        suppressClickRef.current = false;
      }, 150);
      if (s.mode === 'move') {
        const colChanged = p.minCol !== s.origCol;
        if (p.startMin !== s.origStart || colChanged) {
          o.onMove(s.eventId, p.startMin, colChanged ? o.venues[p.minCol]?.id : undefined);
        }
      } else if (p.startMin !== s.origStart || p.endMin !== s.origEnd) {
        o.onResize(s.eventId, p.startMin, p.endMin);
      }
    },
    [],
  );

  const begin = useCallback(
    (e: ReactPointerEvent<HTMLElement>, partial: Pick<Session, 'mode' | 'eventId' | 'origStart' | 'origEnd' | 'origCol' | 'span'>) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      cleanupRef.current?.();
      suppressClickRef.current = false;
      const g = pointToGrid(e.clientX, e.clientY);
      const s: Session = {
        ...partial,
        pointerId: e.pointerId,
        pointerType: e.pointerType,
        downMin: g.min,
        downCol: g.col,
        downX: e.clientX,
        downY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        active: false,
        timer: null,
        current: null,
      };
      sessionRef.current = s;
      // 方塊本體在觸控時要長按才拖曳（才能用手指捲動格狀表）；邊緣手把與積木立即拖曳
      const longPress = s.pointerType === 'touch' && s.mode === 'move';
      let raf = 0;

      const autoScroll = () => {
        const scroller = optsRef.current.scrollRef.current;
        if (scroller && s.active) {
          const r = scroller.getBoundingClientRect();
          const speed = (dist: number) => Math.ceil(((AUTO_SCROLL_EDGE - dist) / AUTO_SCROLL_EDGE) * AUTO_SCROLL_MAX);
          let dy = 0;
          let dx = 0;
          // 積木從格狀表外面拖進來時，只在指標位於捲動區內才自動捲動
          const within = s.lastX >= r.left && s.lastX <= r.right && s.lastY >= r.top && s.lastY <= r.bottom;
          if (within) {
            if (s.lastY < r.top + AUTO_SCROLL_EDGE) dy = -speed(s.lastY - r.top);
            else if (s.lastY > r.bottom - AUTO_SCROLL_EDGE) dy = speed(r.bottom - s.lastY);
            if (s.lastX < r.left + AUTO_SCROLL_EDGE) dx = -speed(s.lastX - r.left);
            else if (s.lastX > r.right - AUTO_SCROLL_EDGE) dx = speed(r.right - s.lastX);
          }
          if (dx || dy) {
            const beforeTop = scroller.scrollTop;
            const beforeLeft = scroller.scrollLeft;
            scroller.scrollTop += dy;
            scroller.scrollLeft += dx;
            if (scroller.scrollTop !== beforeTop || scroller.scrollLeft !== beforeLeft) update(s);
          }
        }
        raf = requestAnimationFrame(autoScroll);
      };

      const activate = () => {
        if (s.active) return;
        s.active = true;
        if (longPress) navigator.vibrate?.(10);
        update(s);
        raf = requestAnimationFrame(autoScroll);
      };

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== s.pointerId) return;
        s.lastX = ev.clientX;
        s.lastY = ev.clientY;
        const dist = Math.hypot(ev.clientX - s.downX, ev.clientY - s.downY);
        if (!s.active) {
          if (longPress) {
            if (dist > TOUCH_SLOP) finish(); // 手指在長按前移動：當作捲動
            return;
          }
          if (dist > MOUSE_THRESHOLD) activate();
          return;
        }
        update(s);
      };
      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== s.pointerId) return;
        s.lastX = ev.clientX;
        s.lastY = ev.clientY;
        if (s.active) {
          update(s);
          commit(s);
        } else if (s.mode === 'new') {
          optsRef.current.onToolboxClick?.();
        }
        finish();
      };
      const onCancel = (ev: PointerEvent) => {
        if (ev.pointerId === s.pointerId) finish();
      };
      const onKey = (ev: KeyboardEvent) => {
        if (ev.key === 'Escape') finish();
      };
      // 拖曳開始後阻止觸控捲動頁面（需要 passive: false）
      const onTouchMove = (ev: TouchEvent) => {
        if (s.active && ev.cancelable) ev.preventDefault();
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
      window.addEventListener('keydown', onKey);
      window.addEventListener('touchmove', onTouchMove, { passive: false });
      if (longPress) s.timer = setTimeout(activate, TOUCH_HOLD_MS);

      cleanupRef.current = () => {
        if (s.timer) clearTimeout(s.timer);
        cancelAnimationFrame(raf);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('touchmove', onTouchMove);
      };
    },
    [commit, finish, pointToGrid, update],
  );

  /** 在方塊本體或上下邊緣按下 */
  const startEventDrag = useCallback(
    (e: ReactPointerEvent<HTMLElement>, ev: ScheduleEvent, mode: 'move' | 'top' | 'bottom') => {
      if (mode !== 'move') {
        e.stopPropagation();
        e.preventDefault();
      }
      const { minCol, span } = eventColumns(ev, optsRef.current.venues);
      begin(e, { mode, eventId: ev.id, origStart: ev.startMin, origEnd: ev.endMin, origCol: minCol, span });
    },
    [begin],
  );

  /** 在「拖曳新增項目」積木按下 */
  const startToolboxDrag = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      e.preventDefault();
      begin(e, { mode: 'new', eventId: '', origStart: 0, origEnd: 0, origCol: 0, span: 1 });
    },
    [begin],
  );

  /** 拖曳結束後緊接著的 click 不要當作「選取」 */
  const consumeSuppressedClick = useCallback(() => {
    const v = suppressClickRef.current;
    suppressClickRef.current = false;
    return v;
  }, []);

  return { preview, startEventDrag, startToolboxDrag, consumeSuppressedClick };
}
