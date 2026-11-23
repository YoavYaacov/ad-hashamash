/** Server error codes → short, friendly Hebrew. Unknown codes fall back to a generic message. */
const MESSAGES: Record<string, string> = {
  not_signed_in: 'החיבור נותק. מנסים שוב…',
  no_active_game: 'אין כרגע משחק פתוח. חכו שהמנחה יפתח את ההרשמה.',
  members_required: 'כתבו לפחות שם של משתתף אחד.',
  bad_transfer_code: 'הקוד לא נכון או שפג תוקפו. בקשו קוד חדש מהמנחה.',
  registration_not_open: 'ההרשמה סגורה כרגע.',
  device_already_registered: 'הטלפון הזה כבר רשום לקבוצה אחרת.',
  team_name_taken: 'השם הזה כבר תפוס. נסו שם אחר.',
  too_many_teams: 'הגענו למספר הקבוצות המרבי.',
  bad_pin: 'קוד ההצטרפות של הקבוצה שגוי.',
  too_many_devices: 'לקבוצה הזו כבר מחובר מספר הטלפונים המרבי.',
  captain_only: 'רק הטלפון הראשי של הקבוצה שולח תשובות במשימה הזו.',
  round_paused: 'הסבב מושהה. רגע…',
  round_not_open: 'הסבב עוד לא נפתח או שכבר נסגר.',
  no_attempts_left: 'נגמרו הניסיונות לשאלה הזו.',
  already_solved: 'כבר פתרתם את זה!',
  item_locked_or_out_of_order: 'התשובה הקודמת ננעלה. ממשיכים קדימה.',
  eliminated: 'הריצה שלכם הסתיימה בסבב הזה — הנקודות שצברתם נשמרו.',
  not_a_finalist: 'רק הקבוצות שעלו לגמר משתתפות בסבב הזה.',
  betting_closed: 'זמן ההימורים הסתיים.',
  game_not_in_progress: 'המשחק עוד לא התחיל.',
  not_host: 'אין הרשאת מנחה.',
  lock_registration_first: 'קודם נועלים את ההרשמה.',
  need_at_least_2_teams: 'צריך לפחות שתי קבוצות.',
  reveal_current_round_first: 'קודם חושפים את תוצאות הסבב הנוכחי.',
  compute_finals_options_first: 'קודם מחשבים את חלופות הגמר.',
  finals_option_must_be_chosen_first: 'קודם בוחרים חלופת ניקוד לגמר.',
  ungraded_or_review_pending: 'יש תשובות שממתינות לבדיקה.',
  round_must_be_closed: 'קודם סוגרים את ההגשות.',
  confirmation_text_mismatch: 'יש להקליד בדיוק: איפוס',
  reset_token_invalid_or_expired: 'פג תוקף בקשת האיפוס. התחילו שוב.',
  only_demo_instances_can_be_reset: 'אפשר לאפס רק משחק ניסיון.',
  active_instance_exists: 'כבר קיים משחק פעיל. יש לארכב אותו קודם.',
  template_is_placeholder: 'תצורת המשחק היא תצורת דמה — לא ניתן להפעיל איתה משחק אמיתי.',
  reveal_finale_first: 'קודם חושפים את תוצאות הגמר.',
};

export function friendlyError(e: unknown): string {
  const raw = typeof e === 'string' ? e : (e as { message?: string })?.message ?? '';
  const code = Object.keys(MESSAGES).find((k) => raw.includes(k));
  if (code) return MESSAGES[code];
  if (/fetch|network|Failed to/i.test(raw)) return 'בעיית רשת. מנסים שוב…';
  return 'משהו השתבש. נסו שוב.';
}
