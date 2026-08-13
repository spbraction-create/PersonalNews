# CLAUDE.md — הנחיה לתחילת כל session בפרויקט הזה

**קרא את הקובץ הזה ראשון, לפני כל דבר אחר, בכל פעם שנפתח session חדש בפרויקט הזה** (כולל בפעם הראשונה שנטען ב-VSCODE). אחרי זה, תמשיך לפי הכלל הרגיל של הפרויקט: `README.md` הוא מפת הדרכים, `EDITORIAL.md` ו-`SOURCES.md` הם מקורות האמת העריכתיים. הקובץ הזה הוא תמונת מצב + סדר עדיפויות — הוא **לא** מחליף אותם.

---

## מה כבר בנוי ועובד (נכון ל-14.8.2026)

- **ריפו:** `github.com/spbraction-create/PersonalNews` — ציבורי, `main` branch, מחובר ל-remote, מספר commits אמיתיים.
- **שלב 2 (גילוי-פיד):** `src/feedDiscovery.js` + `npm run discover`. 14/24 מקורות מ-`SOURCES.md` מאומתים ופעילים בפועל (לא רק "עונים 200" — נבדקו תאריכי פרסום אמיתיים). התוצאות ב-`data/sources.json` + `reports/`.
- **שלב 3 (קציר):** `src/harvest.js` + `npm run harvest`. מושך מהמקורות המאושרים, מסנן 24 שעות, מנקה כפילויות → `data/daily-flood.json`. רץ גם אוטומטית כל בוקר דרך GitHub Action (`harvest.yml`).
- **שלב 4 (עריכה):** `src/gemini.js`, `src/classify.js`, `src/dailyEdit.js` + `npm run edit-daily` (טוען `.env` בעצמו). מסווג ידיעה/עומק, בוחר top-10 כשיש יותר מדי, כותב בריף ~200 מילה לכל טור → `data/daily-edition.json`. פריטי עומק נשמרים ב-`data/depth-queue.json` (בלי תור אמיתי עדיין). **רץ רק ידנית כרגע — ראה סעיף 3 למטה, זו הבעיה הפתוחה המרכזית.**
- **שלב 5 (הגשה):** `worker/index.js` + `worker/render.js`. **חי בפועל:** `https://daily-digest.spbraction.workers.dev` — קורא ישירות מ-`raw.githubusercontent.com` בכל בקשה (בלי לשמור תוכן ב-Worker עצמו — קאש קצה של 5 דק' בלבד). פריסה: `npm run worker:deploy` (רק כשהקוד/הלוגיקה משתנים — לא כשהתוכן משתנה). בדיקה מקומית: `npm run worker:dev`.
- **שלב 5.2 (עמוד סיכום lazy-dive + KV) — ✅ חי בפרודקשן.** נבדק ישירות מול `https://daily-digest.spbraction.workers.dev/read?link=...`: cache miss ~19 שנ' (שליפה+Gemini), cache hit ~0.05 שנ' עם "נשמר במטמון".
- **Gemini API key** תקין ב-`.env` מקומי (לא ב-git). מודל: `gemini-flash-latest` (לא לנעוץ גרסה — גוגל מפסיקה גרסאות מהר, ראה תובנות ב-[[gemini-api-key-setup-gotchas]] בזיכרון).
- **שינוי עריכתי מהמקור:** טווח היעד לכל טור בכל שער (יומי/מוסף/ירחון) הוא **5–10 פריטים**, לא "ללא תקרה" — מעודכן ב-`EDITORIAL.md` §3-4.
- **תובנה ארכיטקטונית חשובה שהוסברה למשתמש (14.8.2026):** ה-Worker לא "זוכר" תוכן — הוא שולף מחדש את `data/daily-edition.json` מ-GitHub בכל בקשה (עם קאש קצה של 5 דק'). זה אומר: (א) שינוי בתוכן דורש רק `git push` של קובץ הדאטה, **לא** `worker:deploy`; (ב) הדף לא מתעדכן "לבד" — הוא נשאר קפוא עד שמישהו/משהו מריץ `edit-daily` ועושה push מחדש. כרגע זה קורה רק ידנית.

---

## מה נבנה בסבב session-ים 12–14.8.2026 (תמצית — לפרטים ראה git log)

1. **עמוד סיכום lazy-dive + KV** (README שלב 5.2 / EDITORIAL.md §3.3) — ✅ הושלם, חי בפרודקשן, commit+push. כרטיס → `/read?link=...` → KV cache hit? מציג מיד. Cache miss? שולף דף מקור, מחלץ טקסט (`HTMLRewriter`), Gemini, שומר ל-KV (TTL חודש). קבצים: `worker/gemini.js`, `worker/extract.js`, `worker/articleCache.js`, `worker/articleSummary.js`, `renderReadPage` ב-`render.js`. KV namespace `ARTICLE_CACHE` (id `66a49c18b33d4ac2b040ee2c211c8bf7`).
2. **מקורות טורים 1/2/5** — ✅ ברובו הושלם, ראה סעיף 2 בסדר העדיפויות למטה לפרטים.
3. **הגיליון עודכן בפועל** — הרצתי `npm run edit-daily` עם המקורות החדשים ו-push-תי; האתר החי כרגע מציג גיליון עם כל 5 הטורים מלאים (כולל חדשות וכלכלה בפעם הראשונה).

**הערת אבטחה פתוחה (בכוונה, MVP):** אין auth על ה-Worker — טכנית כל אחד עם הכתובת יכול לבקש סיכום לכל URL, לא רק לכתבות בגיליון. הרשת הביטחון היחידה כרגע: אין כרטיס אשראי מחובר, אז חריגת מכסה = חסימה לא חיוב. הפתרון המתוכנן — Cloudflare Access — כבר מתועד ב-README שלב 5.3, נדחה בכוונה יחד עם העיצוב (סעיף 4 למטה).

---

## סדר עדיפויות

### ~~1. עמוד סיכום-ביניים (lazy dive) + KV~~ — ✅ הושלם וחי בפרודקשן

### ~~2. השלמת מקורות טורים 1/2/5~~ — ✅ ברובו הושלם (12–13.8.2026)
mako נכשל כמעט לגמרי (פידים קפואים/פגומים — לקח נזכר: 200+RSS תקין לא מוכיח תוכן חי, צריך תאריכים אמיתיים). זוכה יחיד מ-mako: **Nexter** (טור 4, טק). לטור 1 נטשנו את mako/N12 (שניהם קפואים) ועברנו ל-**Ynet** — הצלחה מלאה, דפוס כתובות RSS ישן ולא-מפורסם (`ynet.co.il/Integration/StoryRss<N>.xml`): חדשות (טור 1), כלכלה (טור 2), ספורט (טור 5). **טורים 1+2 סגורים עם מקור עובד בפועל.** 14/24 מאומתים ופעילים. פירוט מלא ב-`SOURCES.md`.

**שארית פתוחה (קטנה, לא דחופה):** פיד הספורט של Ynet כללי (כל הענפים) — עדיין לא מסונן לפי הרשימה הסגורה ב-EDITORIAL.md §7. כלכליסט ו-sport5 פחות דחופים עכשיו.

### 3. חיבור GitHub Actions בפועל — **הבא בתור, הכי דחוף עכשיו**
`.github/workflows/harvest.yml` קיים ורץ בפועל כל בוקר (קציר בלבד, בלי AI). **חסר workflow מקביל ל-`edit-daily`** — זו הסיבה שהגיליון החי לא מתעדכן לבד: מישהו צריך להריץ ידנית `npm run edit-daily` + `git push` בכל פעם (כמו שעשיתי ב-14.8). כדי לפתור:
1. להוסיף `GEMINI_API_KEY` כ-secret ב-GitHub (Settings → Secrets → Actions).
2. ליצור workflow חדש (או להרחיב את הקיים) שמריץ `edit-daily` אחרי `harvest`, ועושה commit+push לתוצאה.
3. לבדוק את תזמון ה-05:00/DST שהוחלט (02:00 UTC, קירוב מכוון) — לוודא שגם ה-edit-daily רץ אחרי שה-harvest מסיים, לא לפניו/מקביל.

הוסבר למשתמש (14.8.2026) שהאתר לא "מתעדכן לבד" בגלל זה בדיוק — זו בעצם המוטיבציה הישירה לסעיף הזה.

### 4. עיצוב סופי ל-V1 — **בכוונה אחרון**
המשתמש ביקש מפורשות לדחות את זה עד שהתוכן/פונקציונליות שלם: "נעבוד על העיצוב כשיהיה לנו הכל ונגבש תוצאה סופית ל-V1." אל תתחיל לשפר עיצוב לפני שסעיפים 2-3 סגורים, אלא אם המשתמש יבקש אחרת.

---

## דברים טכניים שכדאי לזכור (כדי לא לגלות מחדש)

- **הרצת סקריפטים:** `discover` ו-`harvest` לא צריכים `.env`. `edit-daily` כן (`node --env-file=.env`, זה כבר מוגדר ב-package.json).
- **מודל Gemini:** תמיד `gemini-flash-latest`, לעולם לא גרסה נעוצה כמו `gemini-2.5-flash` — גוגל הפסיקה אותם תוך שבועות.
- **Cloudflare:** account ID `090fbf71af31fd0e4d1f2d1898bbab3d`, subdomain `spbraction.workers.dev`. wrangler כבר מחובר מקומית (`npx wrangler whoami` לבדיקה).
- **wrangler.toml compatibility_date:** נשאר על `2024-09-23` בכוונה — תאריכים חדשים יותר (כמו התאריך האמיתי של היום) נדחים על ידי wrangler כ"עתידיים ולא נתמכים".
- **אבטחה ב-Worker:** `render.js` מכיל `escapeHtml`/`safeUrl` כי title/summary/link/image מגיעים מפידי RSS חיצוניים — תוכן לא מהימן. כל רינדור חדש (כולל `renderReadPage`) חייב להשתמש באותן פונקציות.
- **`.env` מול `.dev.vars`:** גילינו ש-`wrangler dev` קורא `GEMINI_API_KEY` ישירות מ-`.env` אם אין `.dev.vars` — לא היה צריך ליצור `.dev.vars` בפועל לבדיקה מקומית. `.dev.vars.example` קיים כתיעוד אם זה משתנה בגרסה עתידית של wrangler.
- **Secret לפרודקשן נפרד מ-`.env`:** ה-Worker בפרודקשן לא רואה את `.env` המקומי — צריך `npx wrangler secret put GEMINI_API_KEY` בנפרד (זה כבר בוצע — המשתמש הריץ את זה בעצמו, לפי כלל בטיחות שאוסר על Claude להזין מפתחות API בעצמו).
- **תהליכי `wrangler dev` ישנים נשארים תקועים:** אם `worker:dev`/preview לא נסגר נקי (קריסת session וכו'), `workerd.exe` נשאר תופס את פורט 8787 ברקע. לבדוק עם `Get-CimInstance Win32_Process | Where-Object Name -match 'node|workerd'` ולסגור את כל השרשרת (npx→node→workerd), לא רק את ה-PID שתופס את הפורט.
- **חילוץ טקסט מדפי מקור:** `worker/extract.js` משתמש ב-`HTMLRewriter` המובנה של Workers (לא ספרייה) — מסיר script/style/nav/header/footer/aside ואוסף טקסט מ-`<article>` (או `<body>` כברירת מחדל), מוגבל ל-12,000 תווים.
