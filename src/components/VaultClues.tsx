/**
 * The vault's four riddle cards. Each hides one digit; a small dreidel letter sits in the card's corner.
 * Cards are shown in content order (never the solution order) — "the dreidel reveals the order".
 */
export function VaultClues({ clues, big }: { clues: { label: string; text: string }[]; order?: string; big?: boolean }) {
  return (
    <div className={`vault-cards ${big ? 'big' : ''}`}>
      {clues.map((cl, i) => (
        <div key={i} className="vault-card" style={{ '--i': i } as React.CSSProperties}>
          <span className="corner-letter" aria-label={`האות ${cl.label}`}>{cl.label}</span>
          <p>{cl.text}</p>
        </div>
      ))}
    </div>
  );
}
