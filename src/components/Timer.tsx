import { remainingMs, useTick } from '../lib/hooks';

export function Timer({ endsAt, pausedMs, offset, total, big }: { endsAt: string | null; pausedMs: number | null; offset: number; total: number; big?: boolean }) {
  useTick(200);
  const ms = remainingMs(endsAt, pausedMs, offset);
  if (ms == null) return null;
  const sec = Math.ceil(ms / 1000);
  const frac = total > 0 ? Math.min(1, ms / (total * 1000)) : 0;
  const mm = Math.floor(sec / 60), ss = String(sec % 60).padStart(2, '0');
  const urgent = sec <= 10 && pausedMs == null;
  return (
    <div className={`timer ${big ? 'big' : ''} ${urgent ? 'urgent' : ''} ${pausedMs != null ? 'paused' : ''}`} role="timer" aria-live="off">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="44" className="timer-track" />
        <circle cx="50" cy="50" r="44" className="timer-fill" style={{ strokeDasharray: 276.5, strokeDashoffset: 276.5 * (1 - frac) }} />
      </svg>
      <span className="timer-text">{pausedMs != null ? 'מושהה' : `${mm}:${ss}`}</span>
    </div>
  );
}
