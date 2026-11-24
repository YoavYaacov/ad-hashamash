/**
 * Touch-first drag-to-reorder list. Grab a row, slide it; the other rows glide out of its way.
 * Pointer events (works with finger, mouse and pen), no library. Small arrow buttons stay as a fallback.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

interface Props {
  ids: string[];
  onChange: (ids: string[]) => void;
  render: (id: string, index: number, dragging: boolean) => ReactNode;
  disabled?: boolean;
  className?: string;
  /** Hide the ▲▼ fallback (e.g. when space is tight). */
  arrows?: boolean;
  label?: string;
}

interface Geo { tops: number[]; heights: number[]; gap: number; startY: number; pointer: number }
interface Drag { from: number; to: number; dy: number; settling: boolean }

const buzz = (ms = 10) => { try { navigator.vibrate?.(ms); } catch { /* unsupported */ } };

export function Sortable({ ids, onChange, render, disabled, className = '', arrows = false, label }: Props) {
  const listRef = useRef<HTMLOListElement>(null);
  const geo = useRef<Geo | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [reset, setReset] = useState(false);
  const [moved, setMoved] = useState<string | null>(null);

  // After a commit, rows sit in their new DOM order: drop the transforms with no transition for one frame.
  useLayoutEffect(() => {
    if (!reset) return;
    const f = requestAnimationFrame(() => setReset(false));
    return () => cancelAnimationFrame(f);
  }, [reset]);

  const targetIndex = (from: number, dy: number) => {
    const g = geo.current!;
    const centre = g.tops[from] + g.heights[from] / 2 + dy;
    let to = 0;
    for (let j = 0; j < ids.length; j++) if (j !== from && g.tops[j] + g.heights[j] / 2 < centre) to++;
    return to;
  };

  const settleOffset = (from: number, to: number) => {
    const g = geo.current!;
    if (to === from) return 0;
    return to > from ? g.tops[to] + g.heights[to] - (g.tops[from] + g.heights[from]) : g.tops[to] - g.tops[from];
  };

  const commit = (from: number, to: number) => {
    if (from === to) return;
    const n = ids.slice();
    const [x] = n.splice(from, 1);
    n.splice(to, 0, x);
    setMoved(x);
    setReset(true);
    onChange(n);
  };

  const onDown = (e: React.PointerEvent, i: number) => {
    if (disabled || drag || (e.target as HTMLElement).closest('button')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const rows = Array.from(listRef.current?.children ?? []) as HTMLElement[];
    const tops = rows.map((r) => r.offsetTop);
    const heights = rows.map((r) => r.offsetHeight);
    const gap = rows.length > 1 ? Math.max(0, tops[1] - tops[0] - heights[0]) : 0;
    geo.current = { tops, heights, gap, startY: e.clientY, pointer: e.pointerId };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    buzz(8);
    setMoved(null);
    setDrag({ from: i, to: i, dy: 0, settling: false });
  };

  const onMove = (e: React.PointerEvent) => {
    const g = geo.current;
    if (!drag || drag.settling || !g || e.pointerId !== g.pointer) return;
    const first = g.tops[0], last = g.tops[ids.length - 1] + g.heights[ids.length - 1];
    let dy = e.clientY - g.startY;
    dy = Math.max(first - g.tops[drag.from] - 12, Math.min(last - g.tops[drag.from] - g.heights[drag.from] + 12, dy));
    const to = targetIndex(drag.from, dy);
    if (to !== drag.to) buzz(6);
    setDrag({ ...drag, dy, to });
  };

  const onUp = (e: React.PointerEvent) => {
    const g = geo.current;
    if (!drag || drag.settling || !g || e.pointerId !== g.pointer) return;
    const { from, to } = drag;
    setDrag({ from, to, dy: settleOffset(from, to), settling: true });
    window.setTimeout(() => { setDrag(null); geo.current = null; commit(from, to); }, 190);
  };

  const step = (i: number, d: number) => {
    const j = i + d;
    if (disabled || j < 0 || j >= ids.length) return;
    buzz(10);
    commit(i, j);
  };

  const shiftFor = (i: number) => {
    if (!drag || !geo.current || i === drag.from) return 0;
    const s = geo.current.heights[drag.from] + geo.current.gap;
    if (drag.from < drag.to && i > drag.from && i <= drag.to) return -s;
    if (drag.from > drag.to && i >= drag.to && i < drag.from) return s;
    return 0;
  };

  return (
    <ol ref={listRef} className={`sortable ${className} ${drag ? 'is-dragging' : ''} ${reset ? 'no-anim' : ''}`} aria-label={label}>
      {ids.map((id, i) => {
        const me = drag?.from === i;
        const y = me ? drag!.dy : shiftFor(i);
        return (
          <li key={id}
              className={`sort-row ${me ? 'lifted' : ''} ${me && drag?.settling ? 'settling' : ''} ${moved === id && !drag ? 'just-moved' : ''}`}
              style={{ transform: y ? `translate3d(0, ${y}px, 0)` : undefined }}
              onPointerDown={(e) => onDown(e, i)} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
            <span className="grip" aria-hidden="true"><i /><i /><i /></span>
            <div className="sort-body">{render(id, i, me)}</div>
            {arrows && (
              <span className="sort-arrows">
                <button type="button" aria-label="הזזה למעלה" disabled={disabled || i === 0} onClick={() => step(i, -1)}>▲</button>
                <button type="button" aria-label="הזזה למטה" disabled={disabled || i === ids.length - 1} onClick={() => step(i, 1)}>▼</button>
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
