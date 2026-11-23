/** One short line per round type: the question, shown the same way on the screen and on the phones. */
export const ASK: Record<string, string> = {
  sprint: 'עונים בטלפון, שאלה אחרי שאלה',
  three_pictures: 'באיזו תמונה הכי הרבה הבדלים?',
  code_vault: 'כל חידה = ספרה אחת. מצאו את הקוד',
  sequence_memory: 'זוכרים ומשחזרים את הרצף',
  truth_or_fiction: 'איזו עובדה מומצאת?',
  ordering: 'מהמוקדם (למעלה) למאוחר (למטה)',
  sliding_puzzle: 'מסדרים את התמונה',
  bet_puzzle: 'מי בחר איזו חנוכייה?',
  symbols: 'מה אומרים הסמלים?',
  video_memory: 'מה ראיתם?',
  finale: 'פותרים ומקלידים את הפתרון',
};
export const askFor = (kind: string, content?: { ask?: string } | null) => content?.ask ?? ASK[kind] ?? '';
