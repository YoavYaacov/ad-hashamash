/** Shows what a bet track means in real points: green "+X" on success, red "−X" on failure. */
export interface Track { id: string; label: string; winMultiplier: number; lossMultiplier: number }

export const stake = (base: number, mult: number) => Math.round(base * mult);
export const fmt = (n: number) => n.toLocaleString('he-IL');

export function StakeLines({ t, base, myTotal }: { t: Track; base: number; myTotal?: number | null }) {
  const win = stake(base, t.winMultiplier);
  const loss = stake(base, t.lossMultiplier);
  const capped = myTotal != null && myTotal > 0 && loss >= myTotal;
  return (
    <span className="stakes">
      <span className="stake win">הצלחה: <b dir="ltr">+{fmt(win)}</b></span>
      {loss === 0 ? <span className="stake nolose">כישלון: <b>בלי הפסד</b></span> : <span className="stake lose">כישלון: <b dir="ltr">−{fmt(loss)}</b></span>}
      {capped && <small className="stake-note">כישלון יאפס את כל הניקוד שלכם (לא יורדים מתחת ל־0)</small>}
    </span>
  );
}
