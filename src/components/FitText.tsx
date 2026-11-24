/** Shrinks its text (never grows it) until it fits on one line — long team names stay whole and proportional. */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export function FitText({ children, min = 0.45, className = '' }: { children: ReactNode; min?: number; className?: string }) {
  const box = useRef<HTMLSpanElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  const [scale, setScale] = useState(1);
  const cur = useRef(1);
  useLayoutEffect(() => {
    const fit = () => {
      const b = box.current, i = inner.current;
      if (!b || !i) return;
      const natural = i.scrollWidth / cur.current, have = b.clientWidth;      // width at full size
      const next = natural > have && natural > 0 ? Math.max(min, (have - 2) / natural) : 1;
      if (Math.abs(next - cur.current) > 0.01) { cur.current = next; setScale(next); }
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, [children, min]);
  return (
    <span ref={box} className={`fit-text ${className}`}>
      <span ref={inner} style={{ fontSize: `${scale}em` }}>{children}</span>
    </span>
  );
}
