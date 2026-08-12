# CLAUDE.md — הנחיה לתחילת כל session בפרויקט הזה

**קרא את הקובץ הזה ראשון, לפני כל דבר אחר, בכל פעם שנפתח session חדש בפרויקט הזה** (כולל בפעם הראשונה שנטען ב-VSCODE). אחרי זה, תמשיך לפי הכלל הרגיל של הפרויקט: `README.md` הוא מפת הדרכים, `EDITORIAL.md` ו-`SOURCES.md` הם מקורות האמת העריכתיים. הקובץ הזה הוא תמונת מצב + סדר עדיפויות — הוא **לא** מחליף אותם.

---

## מה כבר בנוי ועובד (נכון ל-12.8.2026, אחרי session בוקר)

- **ריפו:** `github.com/spbraction-create/PersonalNews` — ציבורי, `main` branch, מחובר ל-remote, מספר commits אמיתיים.
- **שלב 2 (גילוי-פיד):** `src/feedDiscovery.js` + `npm run discover`. 10/24 מקורות מ-`SOURCES.md` אומתו אוטומטית ואושרו (5 ישראליים בטור שיווק/טק + 5 בין-לאומיים בטור טק). התוצאות ב-`data/sources.json` + `reports/`.
- **שלב 3 (קציר):** `src/harvest.js` + `npm run harvest`. מושך את 10 המקורות המאושרים, מסנן 24 שעות, מנקה כפילויות → `data/daily-flood.json`.
- **שלב 4 (עריכה):** `src/gemini.js`, `src/classify.js`, `src/dailyEdit.js` + `npm run edit-daily` (טוען `.env` בעצמו). מסווג ידיעה/עומק, בוחר top-10 כשיש יותר מדי, כותב בריף ~200 מילה לכל טור → `data/daily-edition.json`. פריטי עומק נשמרים ב-`data/depth-queue.json` (בלי תור אמיתי עדיין).
- **שלב 5 (הגשה):** `worker/index.js` + `worker/render.js`. **חי בפועל:** `https://daily-digest.spbraction.workers.dev` — קורא ישירות מ-`raw.githubusercontent.com`. פריסה: `npm run worker:deploy`, בדיקה מקומית: `npm run worker:dev`.
- **שלב 5.2 (עמוד סיכום lazy-dive + KV) — ✅ חי בפרודקשן.** נבדק ישירות מול `https://daily-digest.spbraction.workers.dev/read?link=...`: cache miss ~19 שנ' (שליפה+Gemini), cache hit ~0.05 שנ' עם "נשמר במטמון". ראה "מה נבנה ב-session הזה" למטה.
- **Gemini API key** תקין ב-`.env` מקומי (לא ב-git). מודל: `gemini-flash-latest` (לא לנעוץ גרסה — גוגל מפסיקה גרסאות מהר, ראה תובנות ב-[[gemini-api-key-setup-gotchas]] בזיכרון).
- **שינוי עריכתי מהמקור:** טווח היעד לכל טור בכל שער (יומי/מוסף/ירחון) הוא **5–10 פריטים**, לא "ללא תקרה" — מעודכן ב-`EDITORIAL.md` §3-4.

---

## מה נבנה ב-session הזה (עמוד הסיכום ה-lazy + KV)

לפי README שלב 5.2 / EDITORIAL.md §3.3. הזרימה: כרטיס → `/read?link=<כתובת המקור>` → KV cache hit? מציג מיד. Cache miss? שולף את דף המקור, מחלץ טקסט קריא (`HTMLRewriter`), שולח ל-Gemini, שומר ב-KV (TTL חודש), מציג.

**קבצים חדשים:** `worker/gemini.js` (קריאת Gemini מתוך Worker, בלי `process.env`), `worker/extract.js` (חילוץ טקסט מ-HTML גולמי), `worker/articleCache.js` (hash + get/put ל-KV), `worker/articleSummary.js` (התזמור: cache → מטא-דאטה מהגיליון → fetch → Gemini → cache). `worker/render.js` קיבל `renderReadPage` (בשימוש `escapeHtml`/`safeUrl` הקיימים). `worker/index.js` מנתב בין `/` ל-`/read`.

**נבדק מקומית (`npm run worker:dev`) בהצלחה:** cache miss שלף כתבה אמיתית וייצר סיכום איכותי עם פרטים שלא היו בתקציר ה-RSS (~12 שנ'), cache hit חזר תוך פחות משנייה עם הערת "נשמר במטמון", קישור לא תקין (`javascript:`, ריק) מחזיר 400.

**KV namespace `ARTICLE_CACHE` כבר נוצר בענן** (id `66a49c18b33d4ac2b040ee2c211c8bf7`, מחובר ב-`wrangler.toml`).

**סטטוס: הושלם ב-100%.** המשתמש הריץ `wrangler secret put GEMINI_API_KEY` בעצמו, אישר במפורש, ו-deploy בוצע (`npm run worker:deploy`) ואומת בפרודקשן. **שינוי אחד עדיין לא נעשה: אין commit ל-git** — Claude לא commit-ה לפי הכלל "commit רק כשמבקשים".

**הערת אבטחה פתוחה (בכוונה, MVP):** אין auth על ה-Worker — טכנית כל אחד עם הכתובת יכול לבקש סיכום לכל URL, לא רק לכתבות בגיליון. הרשת הביטחון היחידה כרגע: אין כרטיס אשראי מחובר, אז חריגת מכסה = חסימה לא חיוב. הפתרון המתוכנן — Cloudflare Access — כבר מתועד ב-README שלב 5.3, נדחה בכוונה יחד עם העיצוב (סעיף 4 למטה).

---

## סדר עדיפויות

### ~~1. עמוד סיכום-ביניים (lazy dive) + KV~~ — ✅ הושלם וחי בפרודקשן
ראה "מה נבנה ב-session הזה" למעלה לפרטים המלאים. **הבא בתור: סעיף 2.**

### 2. השלמת מקורות טורים 1/2/5
mako, ynet, כלכליסט — דורשים איתור ידני של כתובת פיד פר-מדור (עמודי ריכוז, לא feed יחיד גלוי). sport5 — לא נמצא לו פיד אוטומטית בכלל, דורש בדיקה. פירוט מלא ב-`SOURCES.md` (סעיף "אימות פידים").

### 3. חיבור GitHub Actions בפועל
`.github/workflows/harvest.yml` קיים אבל לא רץ בפועל — חסר `GEMINI_API_KEY` כ-secret ב-GitHub, וחסר workflow מקביל ל-`edit-daily` (יש רק ל-harvest). גם שווה לבדוק את תזמון ה-05:00/DST שהוחלט (02:00 UTC, קירוב מכוון).

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
- **Secret לפרודקשן נפרד מ-`.env`:** ה-Worker בפרודקשן לא רואה את `.env` המקומי — צריך `npx wrangler secret put GEMINI_API_KEY` בנפרד (המשתמש מריץ בעצמו, ראה סעיף 1 למעלה).
- **תהליכי `wrangler dev` ישנים נשארים תקועים:** אם `worker:dev`/preview לא נסגר נקי (קריסת session וכו'), `workerd.exe` נשאר תופס את פורט 8787 ברקע. לבדוק עם `Get-CimInstance Win32_Process | Where-Object Name -match 'node|workerd'` ולסגור את כל השרשרת (npx→node→workerd), לא רק את ה-PID שתופס את הפורט.
- **חילוץ טקסט מדפי מקור:** `worker/extract.js` משתמש ב-`HTMLRewriter` המובנה של Workers (לא ספרייה) — מסיר script/style/nav/header/footer/aside ואוסף טקסט מ-`<article>` (או `<body>` כברירת מחדל), מוגבל ל-12,000 תווים.
