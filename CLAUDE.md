# CLAUDE.md — הנחיה לתחילת כל session בפרויקט הזה

**קרא את הקובץ הזה ראשון, לפני כל דבר אחר, בכל פעם שנפתח session חדש בפרויקט הזה** (כולל בפעם הראשונה שנטען ב-VSCODE). אחרי זה, תמשיך לפי הכלל הרגיל של הפרויקט: `README.md` הוא מפת הדרכים, `EDITORIAL.md` ו-`SOURCES.md` הם מקורות האמת העריכתיים. הקובץ הזה הוא תמונת מצב + סדר עדיפויות — הוא **לא** מחליף אותם.

---

## מה כבר בנוי ועובד (נכון ל-20.8.2026)

- **ריפו:** `github.com/spbraction-create/PersonalNews` — ציבורי, `main` branch, מחובר ל-remote, מספר commits אמיתיים.
- **שלב 2 (גילוי-פיד):** `src/feedDiscovery.js` + `npm run discover`. 19/24 מקורות מ-`SOURCES.md` מאומתים ופעילים בפועל (לא רק "עונים 200" — נבדקו תאריכי פרסום אמיתיים). התוצאות ב-`data/sources.json` + `reports/`.
- **שלב 3 (קציר):** `src/harvest.js` + `npm run harvest`. מושך מהמקורות המאושרים, מסנן 24 שעות, מנקה כפילויות → `data/daily-flood.json`. רץ אוטומטית כל בוקר דרך GitHub Action (`harvest.yml`). **אזהרה: התזמון לא אמין — ראה סעיף 5 בסדר העדיפויות.**
- **שלב 4 (עריכה):** `src/gemini.js`, `src/classify.js`, `src/dailyEdit.js`. מסווג ידיעה/עומק, בוחר top-10 כשיש יותר מדי, כותב בריף ~200 מילה לכל טור → `data/daily-edition.json`. פריטי עומק נשמרים ב-`data/depth-queue.json` (בלי תור אמיתי עדיין). **✅ רץ עכשיו אוטומטית, אחרי harvest, באותו GitHub Action** — ראה "מה נבנה ב-20.8.2026" למטה.
- **שלב 5 (הגשה):** `worker/index.js` + `worker/render.js`. **חי בפועל:** `https://daily-digest.spbraction.workers.dev` — קורא ישירות מ-`raw.githubusercontent.com` בכל בקשה (בלי לשמור תוכן ב-Worker עצמו — קאש קצה של 5 דק' בלבד). פריסה: `npm run worker:deploy` (רק כשהקוד/הלוגיקה משתנים — לא כשהתוכן משתנה). בדיקה מקומית: `npm run worker:dev`.
- **שלב 5.2 (עמוד סיכום lazy-dive + KV) — ✅ חי בפרודקשן.** נבדק ישירות מול `https://daily-digest.spbraction.workers.dev/read?link=...`: cache miss ~19 שנ' (שליפה+Gemini), cache hit ~0.05 שנ' עם "נשמר במטמון".
- **Gemini API key** תקין בשני מקומות נפרדים: `.env` מקומי (לא ב-git, ל-scripts), ו-secret בשם `GEMINI_API_KEY` ב-GitHub Actions (ל-workflow האוטומטי). מודל: `gemini-flash-latest` (לא לנעוץ גרסה — גוגל מפסיקה גרסאות מהר, ראה תובנות ב-[[gemini-api-key-setup-gotchas]] בזיכרון).
- **שינוי עריכתי מהמקור:** טווח היעד לכל טור בכל שער (יומי/מוסף/ירחון) הוא **5–10 פריטים**, לא "ללא תקרה" — מעודכן ב-`EDITORIAL.md` §3-4.
- **תובנה ארכיטקטונית:** ה-Worker לא "זוכר" תוכן — הוא שולף מחדש את `data/daily-edition.json` מ-GitHub בכל בקשה (עם קאש קצה של 5 דק'). שינוי בתוכן דורש רק `git push` של קובץ הדאטה, **לא** `worker:deploy`. עכשיו שגם ה-edit-daily אוטומטי, זה קורה לבד כל בוקר.

---

## מה נבנה בסבב session-ים 12–20.8.2026 (תמצית — לפרטים ראה git log)

1. **עמוד סיכום lazy-dive + KV** (README שלב 5.2 / EDITORIAL.md §3.3) — ✅ הושלם, חי בפרודקשן. כרטיס → `/read?link=...` → KV cache hit? מציג מיד. Cache miss? שולף דף מקור, מחלץ טקסט (`HTMLRewriter`), Gemini, שומר ל-KV (TTL חודש). קבצים: `worker/gemini.js`, `worker/extract.js`, `worker/articleCache.js`, `worker/articleSummary.js`, `renderReadPage` ב-`render.js`. KV namespace `ARTICLE_CACHE` (id `66a49c18b33d4ac2b040ee2c211c8bf7`).
2. **מקורות טורים 1/2/5** — ✅ ברובו הושלם (Ynet לטורים 1/2/5, Nexter לטור 4). ראה סעיף 2 בסדר העדיפויות למטה.
3. **חיבור GitHub Actions ל-edit-daily (20.8.2026) — ✅ הושלם ואומת מקצה לקצה בפרודקשן.** ראה פירוט מלא תחת סעיף 3 למטה — כולל שני באגים אמיתיים שנתקלנו בהם ותוקנו.
4. **פתרון mako/N12 + עוד מקורות (20.8.2026) — ✅ הושלם.** המשתמש דרש מפורשות פתרון ל-mako/N12 ("חייבים!!!") לפני מעבר לעיצוב. נמצא Google News sitemap חי (בניגוד לפידי RSS הקפואים שכבר נשללו). ראה סעיף 2 למטה לפירוט המלא, כולל שינוי קוד ב-`src/harvest.js`/`src/http.js`.

**הערת אבטחה פתוחה (בכוונה, MVP):** אין auth על ה-Worker — טכנית כל אחד עם הכתובת יכול לבקש סיכום לכל URL, לא רק לכתבות בגיליון. הרשת הביטחון היחידה כרגע: אין כרטיס אשראי מחובר, אז חריגת מכסה = חסימה לא חיוב. הפתרון המתוכנן — Cloudflare Access — כבר מתועד ב-README שלב 5.3, נדחה בכוונה יחד עם העיצוב (סעיף 4 למטה).

---

## סדר עדיפויות

### ~~1. עמוד סיכום-ביניים (lazy dive) + KV~~ — ✅ הושלם וחי בפרודקשן

### ~~2. השלמת מקורות טורים 1/2/5~~ — ✅ הושלם (12–20.8.2026)
**סבב 1 (12–13.8):** mako נכשל כמעט לגמרי דרך RSS (פידים קפואים/פגומים — לקח נזכר: 200+RSS תקין לא מוכיח תוכן חי, צריך תאריכים אמיתיים). זוכה יחיד: **Nexter** (טור 4, טק, RSS רגיל). לטור 1 נטשנו את mako/N12 (קפוא) ועברנו ל-**Ynet** — דפוס כתובות RSS ישן ולא-מפורסם (`ynet.co.il/Integration/StoryRss<N>.xml`): חדשות (טור 1), כלכלה (טור 2), ספורט (טור 5). 14/24 מאומתים.

**סבב 2 (20.8) — פתרון mako/N12 סופי, לפי דרישה מפורשת של המשתמש:** במקום לוותר על mako/N12 כי ה-RSS קפוא, נמצא ש-mako חושף **Google News sitemap** חי לגמרי (`mako.co.il/SiteMap/Mako-News-SitemapIndex.xml`, מ-`robots.txt`) — פורמט שונה מ-RSS, נדרשה תמיכה קוד חדשה:
- `src/http.js`: `fetchBuffer` — קובץ ה-sitemap עצמו הוא gzip אמיתי (`Content-Type: application/x-gzip`, לא `Content-Encoding`), fetch לא מפענח אותו לבד.
- `src/harvest.js`: `type: "sitemap-news"` + `pathFilter` (מערך מחרוזות) — sitemap אחד מכיל את *כל* האתר מעורב, ה-pathFilter מסנן רק את המדור הרלוונטי לכל "מקור וירטואלי" ב-`sources.json`. **מגבלה:** sitemap לא כולל תקציר/תמונה — רק כותרת+קישור+תאריך. כרטיסי mako/N12 בגיליון מוצגים בלי תמונה/תקציר (נבדק ברינדור בפועל — לא שבור, רק פחות עשיר חזותית; עמוד ה-lazy-dive מפצה כי הוא שולף את הכתבה המלאה בלחיצה).
- `scripts/harvest.js` תוקן כי הוא סינן/השמיט את שדות `type`/`pathFilter` בטעות בדרך למקורות בפועל.

תוצאה: 4 מקורות mako/N12 חדשים (חדשות+מגזין/דעות טור 1, כלכלה טור 2, ספורט טור 5), + **Marketing Week** (403 מקורי התברר זמני) לטור 3. **סה"כ 19/24 מאומתים ופעילים.** אומת קצה-לקצה: `npm run harvest` (247 כתבות) → `npm run edit-daily` (5 טורים מלאים, כולל 2 כרטיסי mako/N12 אמיתיים בטור החדשות).

**שארית פתוחה (לא דחופה):** פידי הספורט (Ynet + mako/sitemap) כלליים — עדיין לא מסוננים לפי הרשימה הסגורה ב-EDITORIAL.md §7. כלכליסט ו-sport5 פחות דחופים עכשיו (יש כבר 2 מקורות לכל אחד מהטורים האלה).

### ~~3. חיבור GitHub Actions בפועל~~ — ✅ הושלם ואומת (20.8.2026)
`.github/workflows/harvest.yml` הורחב (לא workflow נפרד — כדי להבטיח סדר, אותו job, בטור) עם שני steps נוספים אחרי harvest: `Edit daily (Gemini)` ואז `Commit edited edition`. רץ ב-02:00 UTC, אותו תזמון כמו קודם.

**שני באגים אמיתיים שנתפסו רק בהרצה בפועל (workflow_dispatch ידני, לא חיכינו למחר):**
1. **`node: .env: not found` (exit 9).** `npm run edit-daily` מוגדר עם `node --env-file=.env` לנוחות מקומית — אבל `.env` לא קיים ב-CI (ב-`.gitignore`), ו-node קורס אם `--env-file` מצביע על קובץ שלא קיים, **גם אם** המפתח כבר הגיע כ-env אמיתי דרך ה-secret. **הפתרון:** ב-workflow קוראים ל-`node scripts/edit-daily.js` ישירות, לא דרך ה-npm script.
2. **"הצלחה" מטעה — `columns: []`.** אחרי תיקון #1, ה-job דיווח success, אבל `data/daily-edition.json` יצא עם מערך טורים ריק לגמרי. הסיבה: `edit-daily.js` בכוונה בולע כשלים per-column (כדי שטור אחד שנכשל לא יפיל את כולם) — אבל זה גם הסתיר שכל 5 הטורים נכשלו באותה שגיאה: `Gemini API 400: API key not valid`. ה-secret ב-GitHub נשמר עם ערך שגוי (כנראה תקלת העתקה) — המשתמש ערך ושמר מחדש בזהירות, ואז זה עבד. **לקח:** "ה-job הצליח" ו"התוכן בפועל תקין" הם שתי בדיקות נפרדות — לוודא את שתיהן, לא להסתפק בירוק של GitHub.

**אומת סופית מול הפרודקשן:** `data/daily-edition.json` עם 5 טורים אמיתיים, ואתר החי (`daily-digest.spbraction.workers.dev`) הציג מיד את הזמן העדכני.

**נשאר, לא דחוף:** Node.js 20 ב-workflow deprecated (הריצה בפועל נכפית ל-Node 24 עם warning) — שווה לעדכן `node-version` ב-`harvest.yml` מתישהו.

### 4. עיצוב סופי ל-V1 — ⏳ בעבודה (23.8.2026)
המשתמש אישר לעבור לזה אחרי שסעיפים 1-3 נסגרו. **תהליך:** הוצגו 3 כיווני עיצוב כ-mockup ב-Artifact (לא בקוד אמיתי) — המשתמש בחר שילוב בין שניים מהם (צבעוניות של כיוון אחד + פריסה שקטה של כיוון אחר), ואז ביקש להוסיף תפריט ניווט עם עוגנים ולשנות את שם המוצר ל-"Daily". אחרי אישור על ה-mockup הסופי — **יושם בקוד האמיתי** (`worker/render.js`).

**מה השתנה בקוד בפועל:**
- **`worker/render.js` — שיפוץ מלא.** במקום רשת כרטיסים (`card-grid`), רשימת שורות שקטה ורוויית-אוויר. כל טור מקבל צבע זיהוי משלו (5 גוונים, `COLUMN_META`) דרך `data-col` על ה-`<section>` — נקודה ליד כותרת הטור, קו לצד הבריף, שם המקור בכרטיס. תומך light+dark (`prefers-color-scheme`), עם ערכי צבע נפרדים לכל מצב לשמירה על ניגודיות.
- **תפריט ניווט עם עוגנים** — נבנה דינמית מ-`edition.columns` בפועל (לא רשימה קבועה) כדי שלעולם לא יהיה קישור מת ביום שטור כלשהו ריק.
- **שם המוצר שונה ל-"Daily"** במרום ובכותרת הטאב.
- **זמן יחסי ("לפני X שעות")** — דרש שדה חדש: `scripts/edit-daily.js` מעכשיו שומר גם `pubDate` לכל כרטיס (לא היה קודם). `render.js` מחשב זאת ב-`formatRelativeTime` בזמן הרינדור (לא ב-build time) — כך שהזמן תמיד מדויק גם בקאש קצה של 5 דק'.
- **כרטיסי mako/N12 בלי תמונה/תקציר** (מגבלת ה-sitemap, ראה סעיף 2) — טופלו במפורש: שורה בלי עמודת תמונה (`row--no-photo`) + הערה "· ללא תקציר במקור" במקום פסקה ריקה.
- גופנים: Google Fonts (Noto Serif Hebrew לכותרות, Assistant לטקסט) — נטענים ב-`pageShell`.

**נבדק:** תגי HTML מאוזנים (article/section/div/h2/h3/nav), `formatRelativeTime` מוודא נכון מול `data/daily-edition.json` אמיתי, `renderReadPage` עדיין עובד עם הפלטה החדשה. **טעות שנתפסה בבדיקה:** preview מקומי (`worker:dev`) קורא תמיד מ-GitHub (`DATA_REPO_RAW_BASE`), **לא** מהקובץ המקומי שרק נערך — אי אפשר לבדוק שינויי-דאטה מקומיים דרך ה-preview בלי push קודם. הבדיקה בפועל נעשתה בקריאה ישירה לפונקציות מ-`render.js` על `data/daily-edition.json` המקומי, לא דרך ה-preview.

**עדיין לא בוצע:** commit+push (קוד) ו-`npm run worker:deploy` (כי זה שינוי בלוגיקת ה-Worker, לא רק בתוכן — צריך גם את השניים, לא רק push).

### 5. תזמון לא-אמין של GitHub Actions + watchdog — ⏳ בתהליך (28.8.2026)

**הבעיה:** ה-`schedule` של GitHub Actions הוא best-effort ולא מובטח. ב-27.8 ההרצה היומית אחרה ~10 שעות (רצה 12:08 UTC במקום ~02:00). ב-28.8 היא **לא רצה בכלל** — המשתמש דיווח "שוב אין Daily". חשוב: האתר החי (`daily-digest.spbraction.workers.dev`) והקוד תקינים לגמרי — הוא פשוט הגיש את גיליון אתמול כי לא נוצר חדש. זו תקלה בצד GitHub, לא באג בפרויקט.

**מה נוסה ולא הספיק:** commit `8eb936a` הזיז את ה-cron מ-`0 2` ל-`23 2` UTC (דקה לא-עגולה = slot פחות עמוס אצל GitHub). לא עזר — ב-28.8 עדיין לא רצה.

**מה בוצע ב-28.8:**
- **הרצת catch-up ידנית מקומית:** `npm run harvest` → `npm run edit-daily` → commit + push. גיליון 28.8 עלה לאוויר.
- **תוכנן watchdog (routine בענן):** scheduled cloud agent שרץ כל יום ב-`0 4 * * *` UTC (≈07:00 שעון ישראל בקיץ). לוגיקה: בודק דרך `gh run list --workflow harvest.yml` אם יש הרצה של "Daily Harvest + Edit" מהתאריך UTC הנוכחי במצב `success`/`in_progress`/`queued`. אם כן → לא עושה כלום. אם לא → `gh workflow run "Daily Harvest + Edit"` (ה-workflow עצמו רץ עם ה-secret של GitHub). ה-watchdog **לא** נוגע בקבצים, לא עושה commit, לא פותח PR — הפעולה היחידה שלו היא הפעלת ה-workflow הקיים.
- **חסום — צריך פעולה של המשתמש:** יצירת ה-routine נכשלה עם `HTTP 401 — "Connect your GitHub account before saving a routine that uses a GitHub repository"`. צריך לחבר את חשבון ה-GitHub (דרך `/web-setup` או התקנת Claude GitHub App על הריפו), ואז ליצור את ה-routine מחדש (skill: `schedule`).

**הערת DST:** ה-cron בענן הוא UTC. `0 4 * * *` = 07:00 בקיץ (IDT, UTC+3) אבל 06:00 בחורף (IST, UTC+2) — קירוב מכוון, כמו שאר התזמונים בפרויקט. ההרצה היומית של `harvest.yml` (02:23 UTC) סובלת מאותו drift.

**לקח:** "האתר לא מציג תוכן חדש" ≠ "האתר/הקוד שבור". קודם לבדוק אם ההרצה היומית בכלל רצה (`gh run list` או `https://api.github.com/repos/spbraction-create/PersonalNews/actions/workflows/harvest.yml/runs`), רק אחר כך לחשוד בקוד.

---

## דברים טכניים שכדאי לזכור (כדי לא לגלות מחדש)

- **הרצת סקריפטים מקומית:** `discover` ו-`harvest` לא צריכים `.env`. `edit-daily` כן (`node --env-file=.env`, זה כבר מוגדר ב-package.json) — **אבל זה רק לנוחות מקומית**. ב-CI (GitHub Actions) קוראים ל-`node scripts/edit-daily.js` ישירות, בלי `--env-file`, כי `.env` לא קיים שם והדגל קורס אם הקובץ חסר (ראה סעיף 3 למעלה).
- **מודל Gemini:** תמיד `gemini-flash-latest`, לעולם לא גרסה נעוצה כמו `gemini-2.5-flash` — גוגל הפסיקה אותם תוך שבועות.
- **Cloudflare:** account ID `090fbf71af31fd0e4d1f2d1898bbab3d`, subdomain `spbraction.workers.dev`. wrangler כבר מחובר מקומית (`npx wrangler whoami` לבדיקה).
- **wrangler.toml compatibility_date:** נשאר על `2024-09-23` בכוונה — תאריכים חדשים יותר (כמו התאריך האמיתי של היום) נדחים על ידי wrangler כ"עתידיים ולא נתמכים".
- **אבטחה ב-Worker:** `render.js` מכיל `escapeHtml`/`safeUrl` כי title/summary/link/image מגיעים מפידי RSS חיצוניים — תוכן לא מהימן. כל רינדור חדש (כולל `renderReadPage`) חייב להשתמש באותן פונקציות.
- **`.env` מול `.dev.vars`:** גילינו ש-`wrangler dev` קורא `GEMINI_API_KEY` ישירות מ-`.env` אם אין `.dev.vars` — לא היה צריך ליצור `.dev.vars` בפועל לבדיקה מקומית. `.dev.vars.example` קיים כתיעוד אם זה משתנה בגרסה עתידית של wrangler.
- **Secret לפרודקשן נפרד מ-`.env`:** ה-Worker בפרודקשן לא רואה את `.env` המקומי — צריך `npx wrangler secret put GEMINI_API_KEY` בנפרד (זה כבר בוצע — המשתמש הריץ את זה בעצמו, לפי כלל בטיחות שאוסר על Claude להזין מפתחות API בעצמו).
- **תהליכי `wrangler dev` ישנים נשארים תקועים:** אם `worker:dev`/preview לא נסגר נקי (קריסת session וכו'), `workerd.exe` נשאר תופס את פורט 8787 ברקע. לבדוק עם `Get-CimInstance Win32_Process | Where-Object Name -match 'node|workerd'` ולסגור את כל השרשרת (npx→node→workerd), לא רק את ה-PID שתופס את הפורט.
- **חילוץ טקסט מדפי מקור:** `worker/extract.js` משתמש ב-`HTMLRewriter` המובנה של Workers (לא ספרייה) — מסיר script/style/nav/header/footer/aside ואוסף טקסט מ-`<article>` (או `<body>` כברירת מחדל), מוגבל ל-12,000 תווים.
- **כשפיד RSS "רשמי" קפוא — לבדוק Google News sitemap לפני שמוותרים.** `robots.txt` של כל אתר חדשות בדרך כלל מפרסם `Sitemap:` — לחפש אחד עם "news" בשם (למשל `Mako-News-SitemapIndex.xml`). לרוב חי יותר מ-RSS ישן כי גוגל דורש אותו טרי לאינדוקס. מגבלה: אין תקציר/תמונה, רק כותרת+קישור+תאריך. תמיכה כללית כבר קיימת ב-`src/harvest.js` (`type: "sitemap-news"`, `pathFilter`) — שווה לנסות את זה על מקורות אחרים שנכשלו (Daily, Bizportal, Funder, ITtime) לפני שמוותרים עליהם.
