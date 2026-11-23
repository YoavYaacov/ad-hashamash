/**
 * Sequential cross-fade: when `k` changes, the previous view fades OUT completely, and only then
 * does the new one fade IN — so texts never overlap and nothing vanishes abruptly.
 * The leaving view is kept mounted under its own key (no remount, no replayed entry animations).
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

interface Layer { k: string; node: ReactNode }

export function Swap({ k, children, outMs = 600, className = '' }: { k: string; children: ReactNode; outMs?: number; className?: string }) {
  const prev = useRef<Layer | null>(null);
  const [leaving, setLeaving] = useState<Layer | null>(null);

  // Runs first: compare with the snapshot from the previous render.
  useLayoutEffect(() => {
    const p = prev.current;
    if (p && p.k !== k) {
      setLeaving(p);
      const t = setTimeout(() => setLeaving(null), outMs);
      return () => clearTimeout(t);
    }
  }, [k]); // eslint-disable-line react-hooks/exhaustive-deps

  // Runs after: remember what is on screen now.
  useLayoutEffect(() => { prev.current = { k, node: children }; });

  const layers: (Layer & { role: 'leaving' | 'waiting' | 'current' })[] = leaving && leaving.k !== k
    ? [{ ...leaving, role: 'leaving' }, { k, node: children, role: 'waiting' }]
    : [{ k, node: children, role: 'current' }];

  return (
    <div className={`swap ${className}`}>
      {layers.map((l) => (
        <div key={l.k} className={`swap-layer ${l.role}`} style={l.role === 'leaving' ? { animationDuration: `${outMs}ms` } : undefined}
             aria-hidden={l.role !== 'current'}>
          {l.node}
        </div>
      ))}
    </div>
  );
}
