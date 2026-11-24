/**
 * Trial-game content: real questions with known answers, used to test the whole system.
 * SINGLE SOURCE for both the database seed (supabase/seed/demo_seed.sql) and the in-browser demo
 * (src/demo/content.json). Regenerate with:  npm run content
 *
 * The final game content will be entered straight into the database, never into this public repo.
 */
import { buildPictures, heatAnswer, HEATS, PUZZLE_SCENE } from './scenes';
import { memoryTotalMs } from '../../supabase/functions/_shared/engine/memory.ts';

const LETTERS = ['א', 'ב', 'ג'];

export interface TaskDef {
  id: string; idea_no: number | null; kind: string; title: string; instructions: string;
  public_content: unknown; duration_sec: number; scoring: unknown; attempts_limit: number;
  settings: unknown; answer_key: unknown;
}

const ORDER_ITEMS = [
  { id: 'a', label: 'אנטיוכוס גוזר גזירות על היהודים' },
  { id: 'b', label: 'מתתיהו פותח במרד במודיעין' },
  { id: 'c', label: 'מתתיהו מת, ויהודה עומד בראש המורדים' },
  { id: 'd', label: 'המכבים משחררים את ירושלים' },
  { id: 'e', label: 'טיהור המקדש וחנוכת המזבח' },
  { id: 'f', label: 'יהודה המכבי נופל בקרב' },
];
const ORDER_SHOWN = ['e', 'b', 'f', 'a', 'd', 'c'];

// Candle memory (approved): six new, independent sequences of 3–8 symbols; repeats allowed.
const MEMORY_SYMBOLS = ['candle', 'dreidel', 'sufganiya', 'oil_jar', 'menorah', 'coin', 'latke'];
const MEMORY_STAGES = [
  ['dreidel', 'sufganiya', 'candle'],
  ['coin', 'menorah', 'latke', 'dreidel'],
  ['oil_jar', 'candle', 'coin', 'sufganiya', 'menorah'],
  ['latke', 'dreidel', 'oil_jar', 'candle', 'latke', 'coin'],
  ['menorah', 'coin', 'sufganiya', 'dreidel', 'oil_jar', 'candle', 'sufganiya'],
  ['candle', 'latke', 'menorah', 'oil_jar', 'coin', 'dreidel', 'latke', 'sufganiya'],
];
const MEMORY_TIMING = { intro_ms: 3000, show_ms: 3500, recall_ms: 20000, result_ms: 6000 };
const MEMORY_POINTS = [25, 35, 45, 55, 65, 75];

// Vault (approved riddles). Cards are shown in this order (not the solution order).
// The letter on each card is editable data; the code is derived: digits in dreidel order נ ג ה פ.
const VAULT_ORDER = ['נ', 'ג', 'ה', 'פ'];
const VAULT_CARDS = [
  { text: 'כמה בנים היו לחנה בסיפור שבו בניה סירבו להיכנע לגזירות אנטיוכוס?', answer: 7, letter: 'ג' },
  { text: 'איזה מספר מופיע בשיר "באנו חושך לגרש"?', answer: 1, letter: 'פ' },
  { text: 'כמה אחים יש ליהודה המכבי?', answer: 4, letter: 'נ' },
  { text: 'איזה בית מקדש טיהרו החשמונאים?', answer: 2, letter: 'ה' },
];
const VAULT_CODE = VAULT_ORDER.map((l) => VAULT_CARDS.find((c) => c.letter === l)!.answer).join('');


export const TASKS: TaskDef[] = [
  {
    id: 'demo-sprint', idea_no: 9, kind: 'sprint', title: 'ספרינט טריוויה חנוכה',
    instructions: 'חמש שאלות ברצף. תשובה שנבחרה ננעלת מיד, ואין חזרה לשאלות קודמות.',
    public_content: { questions: [
      { text: 'איך קראו למלך שגזר גזירות על היהודים בתקופת החשמונאים?', options: ['אלכסנדר מוקדון', 'אנטיוכוס', 'תלמי', 'הורדוס'] },
      { text: 'איזו אות מופיעה על סביבון נפוץ בחו"ל במקום האות פ׳?', options: ['מ׳', 'כ׳', 'ש׳', 'ח׳'] },
      { text: 'איזה נר חנוכה מדליקים בלילה שבו מתחיל ראש חודש טבת?', options: ['הנר הרביעי', 'הנר החמישי', 'הנר השישי', 'הנר השביעי'] },
      { text: 'כמה נרות מדליקים בסך הכול בארבעת הלילות האחרונים של חנוכה, כולל השמשים, בחנוכייה אחת?', options: ['26', '28', '30', '32'] },
      { text: 'באיזה מהמקורות הבאים מופיע סיפור נס פך השמן?', options: ['מגילת אסתר', 'מסכת שבת בתלמוד', 'ספר בראשית', 'פרקי אבות'] },
    ] },
    duration_sec: 100, scoring: { method: 'per_item', points: 60 }, attempts_limit: 1, settings: { sequential: true },
    answer_key: { kind: 'sprint', items: [
      { choice: 'אנטיוכוס' }, { choice: 'ש׳' }, { choice: 'הנר השישי' }, { choice: '30' }, { choice: 'מסכת שבת בתלמוד' },
    ] },
  },
  {
    id: 'demo-pictures', idea_no: 13, kind: 'three_pictures', title: 'שלוש התמונות',
    // Approved wording — keep exactly.
    instructions: 'בכל שלישיית תמונות, יש פריטים שעברו שינוי בתמונה אחת לעומת השתיים האחרות.\nבאיזו תמונה יש הכי הרבה פרטים כאלה?',
    public_content: { ask: 'בכל שלישיית תמונות, יש פריטים שעברו שינוי בתמונה אחת לעומת השתיים האחרות.\nבאיזו תמונה יש הכי הרבה פרטים כאלה?',
                      heats: HEATS.map((h) => ({ title: h.title, pictures: buildPictures(h) })), choices: LETTERS },
    duration_sec: 150, scoring: { method: 'per_item', points: 100 }, attempts_limit: 1, settings: {},
    answer_key: { kind: 'three_pictures', items: HEATS.map((h) => ({ choice: LETTERS[heatAnswer(h)] })) },
  },
  {
    id: 'demo-vault', idea_no: 4, kind: 'code_vault', title: 'הכספת החשמונאית',
    instructions: 'ארבע חידות. ארבע ספרות. קוד אחד.\nפתרו את ארבע החידות וגלו את הספרות שמסתתרות מאחורי הכרטיסים.\nהסביבון יגלה לכם את הסדר.\nיש לכם שלושה ניסיונות לפתוח את הכספת!',
    public_content: {
      ask: 'ארבע חידות. ארבע ספרות. קוד אחד. הסביבון יגלה לכם את הסדר.',
      clues: VAULT_CARDS.map((c) => ({ label: c.letter, text: c.text })),
    },
    duration_sec: 240, scoring: { method: 'fixed', points: 300 }, attempts_limit: 3, settings: { instant_feedback: true },
    answer_key: { kind: 'code_vault', code: VAULT_CODE },
  },
  {
    id: 'demo-memory', idea_no: 35, kind: 'sequence_memory', title: 'זיכרון הנרות',
    instructions: 'מכל קבוצה עולה נציג אחד לבמה, עם הטלפון של הקבוצה.\nבכל שלב יוצג רצף של סמלי חנוכה. זכרו את הסדר!\nכשהרצף ייעלם, יהיו לכם 20 שניות לשחזר אותו בטלפון.\nהצלחתם? הרווחתם נקודות ועליתם לשלב הבא.\nטעיתם? אתם יוצאים מהמשחק, אבל שומרים את הנקודות שצברתם.\nשישה שלבים. כל שלב שווה יותר. טעות אחת — ואתם בחוץ!',
    // Sequences are NOT public: each stage is released by memory_stage() only when it starts.
    public_content: { symbols: MEMORY_SYMBOLS, stage_lengths: MEMORY_STAGES.map((x) => x.length), timing: MEMORY_TIMING, stage_points: MEMORY_POINTS },
    duration_sec: Math.ceil(memoryTotalMs(MEMORY_STAGES.map((x) => x.length), MEMORY_TIMING) / 1000) + 2,
    scoring: { method: 'per_stage', points: 25, points_by_stage: MEMORY_POINTS }, attempts_limit: 1,
    settings: { sequential: true, eliminate_on_fail: true, instant_feedback: true, memory: MEMORY_TIMING },
    answer_key: { kind: 'sequence_memory', stages: MEMORY_STAGES },
  },
  {
    id: 'demo-truth', idea_no: 8, kind: 'truth_or_fiction', title: 'האמת או ההמצאה?',
    instructions: 'בכל סט ארבע עובדות: שלוש אמיתיות ואחת מומצאת. מצאו את המומצאת.',
    public_content: { items: [
      { facts: [
        'בחנוכה אומרים הלל שלם בכל שמונת ימי החג.',
        'סיפור נס פך השמן מופיע בתלמוד הבבלי, במסכת שבת.',
        'ספרי המקבים נכללים בתנ"ך העברי, בחלק הכתובים.',
        'חנוכה הוא החג היחיד בלוח העברי שנמשך על פני שני חודשים: כסלו וטבת.',
      ] },
      { facts: [
        'המשחק בסביבון בחנוכה מוזכר במפורש בתלמוד.',
        'ביידיש הסביבון נקרא "דריידל".',
        'על סביבונים בארץ ישראל מופיעה האות פ׳: "נס גדול היה פה".',
        'הלביבות המסורתיות של יהודי מזרח אירופה עשויות בעיקר מתפוחי אדמה.',
      ] },
      { facts: [
        'בית המקדש נחנך מחדש בכ"ה בכסלו.',
        'יהודה המכבי היה אחד מבניו של מתתיהו.',
        'לפי אחד ההסברים, הכינוי "מכבי" בא מהמילה "מקבת", שפירושה פטיש.',
        'יהודה המכבי נהרג בקרב על חומות ירושלים, ביום חנוכת המקדש.',
      ] },
    ] },
    duration_sec: 150, scoring: { method: 'per_item', points: 100 }, attempts_limit: 1, settings: {},
    answer_key: { kind: 'truth_or_fiction', items: [{ choice: '3' }, { choice: '1' }, { choice: '4' }] },
  },
  {
    id: 'demo-order', idea_no: 17, kind: 'ordering', title: 'הסדר הנכון',
    instructions: 'סדרו את האירועים לפי סדר הזמנים, מהמוקדם (למעלה) למאוחר (למטה). יש ניקוד חלקי על כל זוג שסידרתם נכון.',
    public_content: { items: ORDER_SHOWN.map((id) => ORDER_ITEMS.find((x) => x.id === id)!) },
    duration_sec: 120, scoring: { method: 'partial', points: 300 }, attempts_limit: 1, settings: {},
    answer_key: { kind: 'ordering', correct: ORDER_ITEMS.map((x) => x.id) },
  },
  {
    id: 'demo-slide', idea_no: 26, kind: 'sliding_puzzle', title: 'פאזל ההחלקה',
    instructions: 'נציג אחד מכל קבוצה. מזיזים אריחים אל המשבצת הריקה עד שהתמונה מסודרת. מי שמסיים מהר יותר מקבל יותר נקודות.',
    public_content: { start: [7, 3, 6, 2, 0, 8, 1, 4, 5], scene: PUZZLE_SCENE },
    duration_sec: 240, scoring: { method: 'time_linear', points: 300, minRatio: 0.3 }, attempts_limit: 1, settings: {},
    answer_key: { kind: 'sliding_puzzle', start: [7, 3, 6, 2, 0, 8, 1, 4, 5] },
  },
  {
    id: 'demo-bet', idea_no: 31, kind: 'bet_puzzle', title: 'הימור בחידה',
    instructions: 'קודם בוחרים מסלול הימור, ורק אחר כך נחשפת החידה: מי בחר באיזו חנוכייה?',
    public_content: {
      people: ['סבתא רחל', 'דוד אבי', 'נועה', 'איתי'],
      items: ['חנוכיית כסף', 'חנוכיית זכוכית לשמן', 'חנוכיית לגו', 'חנוכיית חימר'],
      // Art ids for the drawings (src/components/BetArt.tsx). Order matches people / items.
      people_art: ['grandma', 'uncle', 'girl', 'boy'],
      items_art: ['silver', 'glass', 'lego', 'clay'],
      clues: [
        'דוד אבי בחר בחנוכייה שאינה עשויה ממתכת, וגם לא מזכוכית.',
        'נועה ואיתי לא בחרו בחנוכיית הכסף.',
        'חנוכיית הלגו לא שייכת לדוד אבי.',
        'נועה לא מדליקה בשמן, ולכן לא בחרה בחנוכיית הזכוכית.',
      ],
    },
    duration_sec: 240, scoring: { method: 'bet' }, attempts_limit: 1,
    settings: { bet: { baseMethod: 'average_floor100', minBase: 100, defaultTrack: 'safe', tracks: [
      { id: 'safe', label: 'זהיר', winMultiplier: 0.5, lossMultiplier: 0 },
      { id: 'mid', label: 'נועז', winMultiplier: 1, lossMultiplier: 0.5 },
      { id: 'all', label: 'הכול או כלום', winMultiplier: 2, lossMultiplier: 1 },
    ] } },
    answer_key: { kind: 'bet_puzzle', assignment: [0, 3, 2, 1] },
  },
  {
    id: 'demo-finale', idea_no: null, kind: 'finale', title: 'הַשַּׁמָּשׁ',
    instructions: 'חידת הגמר (לדוגמה). רק שתי הקבוצות הראשונות שפותרות מקבלות נקודות.',
    public_content: { answer_type: 'code', puzzle:
      'קחו את מספר הלילה שבו דולקים לראשונה יותר נרות (בלי השמש) ממספר בני מתתיהו. '
      + 'כפלו אותו במספר האותיות שעל הסביבון, והוסיפו את התאריך בכסלו שבו מדליקים את הנר הראשון. מה יצא?' },
    duration_sec: 300, scoring: { method: 'finals' }, attempts_limit: 5, settings: { instant_feedback: true },
    answer_key: { kind: 'finale', code: '49' },
  },
  // In the pool but not in the lineup (kept as placeholders):
  {
    id: 'demo-video', idea_no: 5, kind: 'video_memory', title: '[דמה] מה ראיתם עכשיו?', instructions: 'צפו בסרטון וענו על השאלות.',
    public_content: { video: null, questions: [{ text: '[שאלת דמה]', options: ['א', 'ב', 'ג', 'ד'] }] },
    duration_sec: 90, scoring: { method: 'per_item', points: 100 }, attempts_limit: 1, settings: {},
    answer_key: { kind: 'video_memory', items: [{ choice: 'ב' }] },
  },
  {
    id: 'demo-symbols', idea_no: 11, kind: 'symbols', title: 'חנוכה בסמלים', instructions: 'חמש חידות, בכל סדר. הקלידו את התשובה.',
    public_content: { puzzles: [{ symbols: ['oil', 'jar'] }, { symbols: ['miracle', 'temple'] }] },
    duration_sec: 180, scoring: { method: 'per_item', points: 60 }, attempts_limit: 3, settings: { instant_feedback: true },
    answer_key: { kind: 'symbols', items: [{ text: { canonical: 'פך השמן', alternatives: ['פך שמן', 'כד השמן'] } }, { text: { canonical: 'נס במקדש' } }] },
  },
];

export const LINEUP = ['demo-sprint', 'demo-pictures', 'demo-vault', 'demo-memory', 'demo-truth', 'demo-order', 'demo-slide', 'demo-bet', 'demo-finale'];

export const TEMPLATE = {
  id: '00000000-0000-0000-0000-00000000d001',
  name: 'הרכב מומלץ · תוכן ניסיון',
  settings: { late_grace_ms: 1500, max_teams: 20, finalists: 5, tie_breakers: ['finalPlace', 'lastRoundPoints', 'lastCorrectAt'],
              finals_params: { minFirst: 200, minSecond: 100, balancedRatio: 0.5, secondRatio: 0.5 } },
};
