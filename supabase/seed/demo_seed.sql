-- ═══════════════════════════════════════════════════════════════════════════
-- DEMO CONTENT — every row here is a PLACEHOLDER (is_placeholder = true, titles
-- start with "[דמה]"). It exists only to exercise the engines end to end.
-- host_create_instance(..., 'live') refuses placeholder tasks and templates.
-- The lineup below is a TEMPORARY test configuration, not the approved 8 rounds.
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.task_templates (id, idea_no, kind, title, instructions, public_content, duration_sec, scoring, attempts_limit, submission_policy, settings, status, is_placeholder) values
('demo-vault', 4, 'code_vault', '[דמה] הכספת החשמונאית', 'פענחו ארבע ספרות וגלו את הסדר. 3 ניסיונות.',
  '{"clues":[{"label":"א","text":"כמה נרות מדליקים בלילות השני, השלישי והרביעי, בלי שמשים?"},{"label":"ב","text":"כמה בנים היו למתתיהו?"},{"label":"ג","text":"[חידת דמה]"},{"label":"ד","text":"[חידת דמה]"}],"order_clue":"[רמז סדר דמה]"}',
  240, '{"method":"fixed","points":300}', 3, 'captain_only', '{"instant_feedback":true}', 'candidate', true),
('demo-video', 5, 'video_memory', '[דמה] מה ראיתם עכשיו?', 'צפו בסרטון וענו על השאלות.',
  '{"video":null,"questions":[{"text":"[שאלת דמה 1]","options":["א","ב","ג","ד"]},{"text":"[שאלת דמה 2]","options":["א","ב","ג","ד"]}]}',
  90, '{"method":"per_item","points":100}', 1, 'captain_only', '{}', 'candidate', true),
('demo-truth', 8, 'truth_or_fiction', '[דמה] האמת או ההמצאה?', 'שלוש אמיתיות ואחת מומצאת. מצאו את המומצאת.',
  '{"items":[{"facts":["[עובדה 1]","[עובדה 2]","[עובדה 3]","[עובדה 4]"]}]}',
  60, '{"method":"per_item","points":200}', 1, 'captain_only', '{}', 'candidate', true),
('demo-sprint', 9, 'sprint', '[דמה] המרוץ נגד השעון', 'חמש שאלות ברצף. תשובה שנשלחה ננעלת — אין חזרה.',
  '{"questions":[{"text":"[דמה 1]","options":["א","ב","ג","ד"]},{"text":"[דמה 2]","options":["א","ב","ג","ד"]},{"text":"[דמה 3]","options":["א","ב","ג","ד"]},{"text":"[דמה 4]","options":["א","ב","ג","ד"]},{"text":"[דמה 5 — תשובה פתוחה]"}]}',
  100, '{"method":"per_item","points":60}', 1, 'captain_only', '{"sequential":true}', 'candidate', true),
('demo-symbols', 11, 'symbols', '[דמה] חנוכה בסמלים', 'חמש חידות, בכל סדר. הקלידו את התשובה.',
  '{"puzzles":[{"symbols":["oil","jar"]},{"symbols":["candle","8"]},{"symbols":["miracle","big"]},{"symbols":["temple"]},{"symbols":["dreidel","letters"]}]}',
  180, '{"method":"per_item","points":60}', 3, 'captain_only', '{"instant_feedback":true}', 'candidate', true),
('demo-pictures', 13, 'three_pictures', '[דמה] שלוש התמונות', 'באיזו תמונה הכי הרבה פרטים חריגים? שלושה מקצים.',
  '{"heats":[{"scene":"demo-1"},{"scene":"demo-2"},{"scene":"demo-3"}],"choices":["א","ב","ג"]}',
  150, '{"method":"per_item","points":100}', 1, 'captain_only', '{}', 'candidate', true),
('demo-order', 17, 'ordering', '[דמה] הסדר הנכון', 'סדרו את הפריטים בסדר הנכון.',
  '{"items":[{"id":"a","label":"[א]"},{"id":"b","label":"[ב]"},{"id":"c","label":"[ג]"},{"id":"d","label":"[ד]"},{"id":"e","label":"[ה]"},{"id":"f","label":"[ו]"}]}',
  120, '{"method":"partial","points":300}', 1, 'captain_only', '{}', 'candidate', true),
('demo-slide', 26, 'sliding_puzzle', '[דמה] פאזל ההחלקה', 'נציג אחד. סדרו את התמונה.',
  '{"start":[7,3,6,2,0,8,1,4,5],"image":null}',
  240, '{"method":"fixed","points":300}', 1, 'captain_only', '{}', 'candidate', true),
('demo-bet', 31, 'bet_puzzle', '[דמה] הימור בחידה', 'בחרו מסלול לפני שהחידה נחשפת.',
  '{"people":["[דמות 1]","[דמות 2]","[דמות 3]","[דמות 4]"],"items":["[חנוכייה 1]","[חנוכייה 2]","[חנוכייה 3]","[חנוכייה 4]"],"clues":["[רמז דמה]"]}',
  240, '{"method":"bet"}', 1, 'captain_only',
  '{"bet":{"baseMethod":"average_floor100","minBase":100,"tracks":[{"id":"safe","label":"זהיר","winMultiplier":0.5,"lossMultiplier":0},{"id":"mid","label":"בינוני","winMultiplier":1,"lossMultiplier":0.5},{"id":"all","label":"הכול או כלום","winMultiplier":2,"lossMultiplier":2}]}}',
  'candidate', true),
('demo-memory', 35, 'sequence_memory', '[דמה] זיכרון הנרות', 'נציג אחד. שחזרו את הרצף. טעות = סיום הריצה.',
  '{"symbols":["oil","dreidel","candle","sufganiya","menorah","coin","jar"],"show_ms_per_symbol":900,"stages":[["oil","dreidel","candle"],["jar","coin","menorah","oil"],["candle","sufganiya","dreidel","coin","jar"],["menorah","oil","jar","candle","coin","dreidel"]]}',
  300, '{"method":"per_stage","points":100}', 1, 'captain_only', '{"sequential":true,"eliminate_on_fail":true,"instant_feedback":true}', 'candidate', true),
('demo-finale', null, 'finale', '[דמה] השַׁמָּשׁ', 'חידת הגמר — טרם נבחרה.',
  '{"puzzle":"[חידת גמר דמה]"}',
  300, '{"method":"finals"}', 5, 'captain_only', '{"instant_feedback":true}', 'candidate', true)
on conflict (id) do nothing;

insert into private.task_secrets (task_id, answer_key, verified_at, verified_note) values
('demo-vault',    '{"kind":"code_vault","code":"9512"}', null, 'demo'),
('demo-video',    '{"kind":"video_memory","items":[{"choice":"ב"},{"choice":"ד"}]}', null, 'demo'),
('demo-truth',    '{"kind":"truth_or_fiction","items":[{"choice":"3"}]}', null, 'demo'),
('demo-sprint',   '{"kind":"sprint","items":[{"choice":"א"},{"choice":"ג"},{"choice":"ב"},{"choice":"ד"},{"text":{"canonical":"סופגנייה","alternatives":["סופגניה"]}}]}', null, 'demo'),
('demo-symbols',  '{"kind":"symbols","items":[{"text":{"canonical":"פך השמן","alternatives":["פח השמן"]}},{"text":{"canonical":"שמונה נרות"}},{"text":{"canonical":"נס גדול"}},{"text":{"canonical":"בית המקדש"}},{"text":{"canonical":"נגהש"}}]}', null, 'demo'),
('demo-pictures', '{"kind":"three_pictures","items":[{"choice":"ב"},{"choice":"א"},{"choice":"ג"}]}', null, 'demo'),
('demo-order',    '{"kind":"ordering","correct":["a","b","c","d","e","f"]}', null, 'demo'),
('demo-slide',    '{"kind":"sliding_puzzle","start":[7,3,6,2,0,8,1,4,5]}', null, 'demo'),
('demo-bet',      '{"kind":"bet_puzzle","assignment":[2,1,3,0]}', null, 'demo'),
('demo-memory',   '{"kind":"sequence_memory","stages":[["oil","dreidel","candle"],["jar","coin","menorah","oil"],["candle","sufganiya","dreidel","coin","jar"],["menorah","oil","jar","candle","coin","dreidel"]]}', null, 'demo'),
('demo-finale',   '{"kind":"finale","code":"1234"}', null, 'demo')
on conflict (task_id) do nothing;

insert into public.game_templates (id, name, settings, is_placeholder) values
('00000000-0000-0000-0000-00000000d001', '[דמה] תצורת בדיקה זמנית',
 '{"late_grace_ms":1500,"max_teams":20,"max_devices_per_team":3,"finalists":5,
   "tie_breakers":["finalPlace","lastRoundPoints"],
   "finals_params":{"minFirst":200,"minSecond":100,"balancedRatio":0.5,"secondRatio":0.5}}', true)
on conflict (id) do nothing;

insert into public.game_template_rounds (template_id, round_no, task_id) values
('00000000-0000-0000-0000-00000000d001', 1, 'demo-sprint'),
('00000000-0000-0000-0000-00000000d001', 2, 'demo-symbols'),
('00000000-0000-0000-0000-00000000d001', 3, 'demo-pictures'),
('00000000-0000-0000-0000-00000000d001', 4, 'demo-order'),
('00000000-0000-0000-0000-00000000d001', 5, 'demo-vault'),
('00000000-0000-0000-0000-00000000d001', 6, 'demo-slide'),
('00000000-0000-0000-0000-00000000d001', 7, 'demo-bet'),
('00000000-0000-0000-0000-00000000d001', 8, 'demo-memory'),
('00000000-0000-0000-0000-00000000d001', 9, 'demo-finale')
on conflict do nothing;
