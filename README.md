# עַד הַשַּׁמָּשׁ — שעשועון החנוכה המשפחתי

שעשועון חי, מרובה משתתפים, בזמן אמת: מסך הקרנה, טלפון מנחה, וטלפונים לקבוצות.
8 סבבים (נרות) וסבב גמר — **השַׁמָּשׁ**. בדיוק 9 סבבים.

| ממשק | כתובת | מי |
|---|---|---|
| מסך הקרנה | `/screen` | מחשב מחובר למקרן, בלי התחברות |
| מנחה | `/host` | טלפון המנחה, אימייל + סיסמה |
| קבוצה | `/play` | טלפון לכל קבוצה (סריקת QR) |

תיעוד: [תוכנית ואדריכלות](docs/PLAN.md) · [מדריך מנחה](docs/HOST_GUIDE.md) · [תוכנית בדיקות לאירוע](docs/EVENT_TEST_PLAN.md) · [הרכב וניקוד](docs/SCORING.md)

## מבנה

```
src/                      React + TS (שלושת הממשקים)
  pages/Screen|Host|Play  כל ממשק הוא bundle נפרד
  tasks/TaskInput.tsx     קלט לכל סוגי המשימות (איסוף בלבד; אין בדיקה בצד הלקוח)
  components/             חנוכייה SVG, סמלים מקוריים, טיימר
  lib/                    לקוח Supabase, סנכרון שעון, מצב חי, שגיאות בעברית
  config.ts               שם המשחק וגופנים, במקום אחד
supabase/
  migrations/             סכמה, RLS, מכונת מצבים (plpgsql)
  functions/_shared/engine  מנוע הבדיקה והניקוד (TS טהור, משותף ונבדק)
  functions/game/         Edge Function: הגשה, בדיקה, הכרעה, חישוב גמר
  seed/demo_seed.sql      תוכן דמה מסומן ([דמה]) ותצורת בדיקה זמנית
tests/                    בדיקות יחידה (vitest) ובדיקות SQL על Postgres אמיתי
```

## בדיקות

```bash
npm test          # 41 בדיקות יחידה: מנוע + לוגיקת שרת
npm run test:db   # 66 בדיקות SQL: Postgres מקומי זמני + stub של auth
```

## התקנה ופריסה (חינם)

1. **Supabase** (פרויקט Free חדש):
   - Authentication → Sign In / Providers → להפעיל **Anonymous sign-ins** וגם Email.
   - להריץ את המיגרציות (`supabase db push`, או להדביק את שני קבצי `migrations/` ב־SQL Editor לפי הסדר) ואחר כך את `seed/demo_seed.sql`.
   - ליצור משתמש מנחה (Authentication → Users → Add user), ואז:
     `insert into public.hosts (user_id) select id from auth.users where email = 'YOU@example.com';`
   - Edge Function: `supabase functions deploy game`
     (אופציונלי: `supabase secrets set ALLOWED_ORIGIN=https://your-site.pages.dev`).
   - Realtime: המיגרציה מוסיפה את `public_state` ל־publication.
2. **אתר**: `cp .env.example .env` ולמלא URL ומפתח anon/publishable.
   `npm ci && npm run build` → להעלות את `dist/` ל־**Cloudflare Pages** (הקובץ `public/_redirects` כבר מטפל בניתוב SPA).
3. לפני כל אירוע: לבדוק בדשבורד שהפרויקט **לא מושהה** (פרויקט Free נעצר אחרי 7 ימים בלי פעילות).

## עקרונות שאסור לשבור

- השרת הוא מקור האמת. ב־localStorage נשמר רק טוקן ההתחברות.
- מפתחות תשובה נמצאים רק ב־`private.task_secrets` ומגיעים רק ל־Edge Function.
- כל שינוי ניקוד הוא שורה ב־`score_events` עם `source_key` ייחודי.
- משחק אמיתי (`live`) לא נוצר מתוכן דמה או מחידה שלא אומתה (`verified_at`).
- הגמר מסומן בנר שמש בחנוכייה, **אף פעם לא בשמש שבשמיים**.
