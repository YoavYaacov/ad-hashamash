/**
 * Trial-game content: real questions with known answers, used to test the whole system.
 * SINGLE SOURCE for both the database seed (supabase/seed/demo_seed.sql) and the in-browser demo
 * (src/demo/content.json). Regenerate with:  npm run content
 *
 * The final game content will be entered straight into the database, never into this public repo.
 */
import { buildPictures, heatAnswer, HEATS, PUZZLE_SCENE } from './scenes';

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

const MEMORY_STAGES = [
  ['oil', 'dreidel', 'candle'],
  ['jar', 'coin', 'menorah', 'oil'],
  ['candle', 'sufganiya', 'dreidel', 'coin', 'jar'],
  ['menorah', 'oil', 'jar', 'candle', 'coin', 'dreidel'],
  ['coin', 'candle', 'oil', 'sufganiya', 'jar', 'dreidel', 'menorah'],
  ['dreidel', 'jar', 'menorah', 'coin', 'oil', 'candle', 'sufganiya', 'jar'],
];

export const TASKS: TaskDef[] = [
  {
    id: 'demo-sprint', idea_no: 9, kind: 'sprint', title: 'המרוץ נגד השעון',
    instructions: 'חמש שאלות, אחת אחרי השנייה. תשובה שנשלחה ננעלת, ואין חזרה אחורה.',
    public_content: { questions: [
      { text: 'מי היה המלך הסלווקי שגזר את הגזירות על היהודים?', options: ['אלכסנדר מוקדון', 'אנטיוכוס הרביעי', 'תלמי השני', 'פיליפוס'] },
      { text: 'כמה נרות מדליקים בסך הכול בכל שמונת הלילות, כולל השמש?', options: ['36', '44', '45', '52'] },
      { text: 'בארץ ישראל כתוב על הסביבון נ־ג־ה־פ. מה כתוב עליו בחוץ לארץ?', options: ['נ־ג־ה־ש', 'נ־ג־ש־פ', 'נ־ג־ה־מ', 'נ־ש־ה־פ'] },
      { text: 'לפי המסורת, אילו מאכלים נוהגים לאכול בחנוכה לזכר יהודית?', options: ['מאכלי חלב וגבינה', 'דגים', 'תפוחים בדבש', 'אורז ועדשים'] },
      { text: 'מה שמו של אבי החשמונאים, שפתח במרד במודיעין? (הקלידו)' },
    ] },
    duration_sec: 100, scoring: { method: 'per_item', points: 60 }, attempts_limit: 1, settings: { sequential: true },
    answer_key: { kind: 'sprint', items: [
      { choice: 'אנטיוכוס הרביעי' }, { choice: '44' }, { choice: 'נ־ג־ה־ש' }, { choice: 'מאכלי חלב וגבינה' },
      { text: { canonical: 'מתתיהו', alternatives: ['מתתיה', 'מתתיהו הכהן', 'מתתיהו החשמונאי'], rejects: ['יהודה'] } },
    ] },
  },
  {
    id: 'demo-pictures', idea_no: 13, kind: 'three_pictures', title: 'שלוש התמונות',
    instructions: 'בכל מקצה שלוש תמונות כמעט זהות. כל הבדל מופיע רק באחת מהן. מצאו את התמונה שיש בה הכי הרבה הבדלים משתי האחרות.',
    public_content: { heats: HEATS.map((h) => ({ title: h.title, pictures: buildPictures(h) })), choices: LETTERS },
    duration_sec: 150, scoring: { method: 'per_item', points: 100 }, attempts_limit: 1, settings: {},
    answer_key: { kind: 'three_pictures', items: HEATS.map((h) => ({ choice: LETTERS[heatAnswer(h)] })) },
  },
  {
    id: 'demo-vault', idea_no: 4, kind: 'code_vault', title: 'הכספת החשמונאית',
    instructions: 'קוד של 4 ספרות. כל חידה נותנת ספרה אחת ומסומנת באות של הסביבון. מקלידים את הספרות לפי סדר האותיות במשפט שעל הסביבון. 3 ניסיונות.',
    public_content: {
      clues: [
        { label: 'ה', text: 'כמה נרות מדליקים בסך הכול בלילה השני, השלישי והרביעי? (בלי השמש)' },
        { label: 'פ', text: 'כמה בנים היו למתתיהו?' },
        { label: 'נ', text: 'בלילה מסוים דולקות בחנוכייה 7 להבות, כולל השמש. איזה לילה זה?' },
        { label: 'ג', text: 'בכמה מתוך שמונת הלילות דולק מספר זוגי של נרות? (בלי השמש)' },
      ],
      order_clue: 'לפי סדר האותיות במשפט שעל הסביבון.',
    },
    duration_sec: 240, scoring: { method: 'fixed', points: 300 }, attempts_limit: 3, settings: { instant_feedback: true },
    answer_key: { kind: 'code_vault', code: '6495' },
  },
  {
    id: 'demo-memory', idea_no: 35, kind: 'sequence_memory', title: 'זיכרון הנרות',
    instructions: 'נציג אחד מכל קבוצה. צופים ברצף ומשחזרים אותו. בכל שלב הרצף מתארך, וטעות אחת מסיימת את הריצה.',
    public_content: { symbols: ['oil', 'dreidel', 'candle', 'sufganiya', 'menorah', 'coin', 'jar'], show_ms_per_symbol: 900, stages: MEMORY_STAGES },
    duration_sec: 300, scoring: { method: 'per_stage', points: 50 }, attempts_limit: 1,
    settings: { sequential: true, eliminate_on_fail: true, instant_feedback: true },
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
