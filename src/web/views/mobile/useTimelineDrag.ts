// 手機場地時間軸的拖曳（Pointer Events）
// - 觸控：長按約 300ms 才開始拖曳；長按前手指移動超過 8px 視為捲動，不拖曳（一般捲動不受影響）
// - 滑鼠：按住移動超過 4px 就開始拖曳
// - 上下邊緣的把手：按下立即開始調整長度（把手設定 touch-action: none）
// - 拖曳中靠近畫面上下緣會自動捲動；開始拖曳後擋掉 touchmove，避免畫面跟著捲動
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { ScheduleEvent } from '@shared/types';
import { clampMove, clampResizeEnd, clampResizeStart, pxToSnappedMin } from './slots';

export type DragMode = 'move' | 'resize-end' | 'resize-start';

export interface DragPreview {
  id: string;
  mode: DragMode;
  startMin: number;
  endMin: number;
}

export const LONG_PRESS_MS = 300;
const TOUCH_TOLERANCE_PX = 8;
const MOUSE_THRESHOLD_PX = 4;
/** 自動捲動：距離畫面上緣／下緣多少 px 內開始捲動（避開頂部列與底部導覽） */
const EDGE_TOP_PX = 120;
const EDGE_BOTTOM_PX = 130;
const AUTOSCROLL_STEP_PX = 8;

interface Gesture {
  mode: DragMode;
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  startScrollY: number;
  lastY: number;
  origStart: number;
  origEnd: number;
  active: boolean;
  timer: number;
  raf: number;
  preview: DragPreview;
}

type StartFn = (e: ReactPointerEvent, ev: ScheduleEvent, mode: DragMode) => void;

export function useTimelineDrag({
  pxPerMin,
  enabled,
  onCommit,
}: {
  pxPerMin: number;
  enabled: boolean;
  onCommit: (preview: DragPreview) => void;
}) {
  const [preview, setPreview] = useState<DragPreview | null>(null);
  /** 拖曳結束後緊接的 click 不要開啟細節 */
  const suppressClick = useRef(false);
  const commitRef = useRef(onCommit);
  const startRef = useRef<StartFn | null>(null);
  useEffect(() => {
    commitRef.current = onCommit;
  });

  // 手勢狀態與視窗事件都在這個 effect 裡管理（不經過 React 重新繪製）
  useEffect(() => {
    let g: Gesture | null = null;

    const recompute = () => {
      if (!g || !g.active) return;
      const deltaPx = g.lastY + window.scrollY - (g.startY + g.startScrollY);
      const delta = pxToSnappedMin(deltaPx, pxPerMin);
      let startMin = g.origStart;
      let endMin = g.origEnd;
      if (g.mode === 'move') {
        startMin = clampMove(g.origStart, g.origEnd, delta);
        endMin = startMin + (g.origEnd - g.origStart);
      } else if (g.mode === 'resize-end') {
        endMin = clampResizeEnd(g.origStart, g.origEnd, delta);
      } else {
        startMin = clampResizeStart(g.origStart, g.origEnd, delta);
      }
      if (startMin !== g.preview.startMin || endMin !== g.preview.endMin) {
        g.preview = { ...g.preview, startMin, endMin };
        setPreview(g.preview);
      }
    };

    const cleanup = () => {
      if (g) {
        clearTimeout(g.timer);
        cancelAnimationFrame(g.raf);
      }
      g = null;
      setPreview(null);
    };

    const autoScroll = () => {
      if (!g || !g.active) return;
      let dy = 0;
      if (g.lastY < EDGE_TOP_PX) dy = -AUTOSCROLL_STEP_PX;
      else if (g.lastY > window.innerHeight - EDGE_BOTTOM_PX) dy = AUTOSCROLL_STEP_PX;
      if (dy) {
        window.scrollBy(0, dy);
        recompute();
      }
      g.raf = requestAnimationFrame(autoScroll);
    };

    const activate = () => {
      if (!g || g.active) return;
      g.active = true;
      // 從「開始拖曳的那一刻」計算位移，長按期間的小幅晃動不算
      g.startY = g.lastY;
      g.startScrollY = window.scrollY;
      try {
        navigator.vibrate?.(15);
      } catch {
        // 部分瀏覽器不支援震動
      }
      window.getSelection?.()?.removeAllRanges();
      setPreview(g.preview);
      g.raf = requestAnimationFrame(autoScroll);
    };

    const onMove = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.pointerId) return;
      g.lastY = e.clientY;
      if (g.active) {
        recompute();
        return;
      }
      const dist = Math.hypot(e.clientX - g.startX, e.clientY - g.startY);
      if (g.pointerType === 'mouse') {
        if (dist > MOUSE_THRESHOLD_PX) activate();
      } else if (dist > TOUCH_TOLERANCE_PX) {
        // 長按前就移動：使用者想捲動，放棄拖曳
        cleanup();
      }
    };

    const onUp = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.pointerId) return;
      if (g.active) {
        suppressClick.current = true;
        setTimeout(() => {
          suppressClick.current = false;
        }, 400);
        const p = g.preview;
        if (p.startMin !== g.origStart || p.endMin !== g.origEnd) commitRef.current(p);
      }
      cleanup();
    };

    const onCancel = (e: PointerEvent) => {
      if (g && e.pointerId === g.pointerId) cleanup();
    };

    // 拖曳中阻止觸控捲動（必須是 passive: false 的監聽器才能 preventDefault）
    const blockTouch = (e: TouchEvent) => {
      if (g?.active && e.cancelable) e.preventDefault();
    };

    startRef.current = (e, ev, mode) => {
      if (g) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (mode !== 'move') {
        // 把手不要觸發方塊本身的長按
        e.stopPropagation();
        e.preventDefault();
      }
      g = {
        mode,
        pointerId: e.pointerId,
        pointerType: e.pointerType,
        startX: e.clientX,
        startY: e.clientY,
        startScrollY: window.scrollY,
        lastY: e.clientY,
        origStart: ev.startMin,
        origEnd: ev.endMin,
        active: false,
        timer: 0,
        raf: 0,
        preview: { id: ev.id, mode, startMin: ev.startMin, endMin: ev.endMin },
      };
      if (mode !== 'move') activate();
      else if (e.pointerType !== 'mouse') g.timer = window.setTimeout(activate, LONG_PRESS_MS);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('touchmove', blockTouch, { passive: false });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('touchmove', blockTouch);
      cleanup();
      startRef.current = null;
    };
  }, [pxPerMin]);

  /** 綁在賽程方塊（move）或邊緣把手（resize-*）的 onPointerDown */
  const start = useCallback<StartFn>(
    (e, ev, mode) => {
      if (enabled) startRef.current?.(e, ev, mode);
    },
    [enabled],
  );

  /** 在 click 處理中呼叫：剛拖曳完就回傳 true（並略過這次點擊） */
  const consumeDragClick = useCallback(() => {
    if (!suppressClick.current) return false;
    suppressClick.current = false;
    return true;
  }, []);

  return { preview, start, consumeDragClick };
}
