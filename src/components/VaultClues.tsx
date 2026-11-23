/** The four riddles, each marked with a dreidel letter, plus the order rule. Same on screen and phone. */
export function VaultClues({ clues, order, big }: { clues: { label: string; text: string }[]; order?: string; big?: boolean }) {
  return (
    <div className={`vault-clues ${big ? 'big' : ''}`}>
      <ol>
        {clues.map((cl) => (
          <li key={cl.label}><span className="dreidel-letter" aria-label={`האות ${cl.label}`}>{cl.label}</span><span className="clue-text">{cl.text}</span><span className="digit-slot" aria-hidden="true">?</span></li>
        ))}
      </ol>
      {order && <p className="order-rule"><b>סדר הספרות:</b> {order}</p>}
    </div>
  );
}

