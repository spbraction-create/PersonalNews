/**
 * בניית ה-HTML של הגיליון. נפרד מ-index.js כדי שלוגיקת התצוגה תהיה נבדקת/קריאה בפני עצמה.
 *
 * עיצוב V1 (אושר כמוקאפ ב-Artifact, ראה CLAUDE.md): רשימת שורות שקטה ורוויית-אוויר
 * (לא רשת כרטיסים), על רקע כהה עם צבע זיהוי לכל טור (נקודה, קו הבריף, שם המקור).
 * כל טור מקבל --accent משלו דרך data-col על ה-<section> — ראה COLUMN_META למטה.
 *
 * הערת אבטחה: title/summary/source מגיעים במקור מפידי RSS/sitemap חיצוניים — תוכן לא מהימן.
 * לכן escapeHtml על כל טקסט, ו-safeUrl על כל link/image לפני הטמעה ב-href/src.
 */

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[ch]);
}

/** מחזיר את הכתובת רק אם היא http/https תקינה — אחרת null, כדי לא להטמיע javascript:/data: וכו'. */
export function safeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** בונה את כתובת עמוד הסיכום ה-lazy מתוך כתובת המקור (worker/index.js מנתב לפי הנתיב הזה). */
function readPageUrl(link) {
  return `/read?link=${encodeURIComponent(link)}`;
}

/**
 * slug + צבע זיהוי לכל טור (EDITORIAL.md §1). slug בונה את עוגן הניווט (#col-<slug>).
 * שני צבעים לכל טור — אחד לרקע בהיר, אחד לכהה — מוגדרים כ-CSS custom property בהמשך.
 */
const COLUMN_META = {
  1: { slug: "news", light: "#3450d1", dark: "#4c6fff" },
  2: { slug: "economy", light: "#1f8f6c", dark: "#34b892" },
  3: { slug: "marketing", light: "#a6740a", dark: "#e0a32e" },
  4: { slug: "tech", light: "#6d3fd1", dark: "#8b5cf6" },
  5: { slug: "sport", light: "#c93f3f", dark: "#ef5b5b" },
};

/** "לפני X שעות" וכו' — pubDate הוא ISO string (או undefined לתוכן ישן/חסר, למשל לפני שהוספנו את השדה). */
function formatRelativeTime(pubDateIso, now) {
  if (!pubDateIso) return null;
  const date = new Date(pubDateIso);
  if (Number.isNaN(date.getTime())) return null;

  const diffMin = Math.round((now.getTime() - date.getTime()) / 60000);
  if (diffMin < 2) return "הרגע";
  if (diffMin < 60) return `לפני ${diffMin} דקות`;

  const diffHours = Math.round(diffMin / 60);
  if (diffHours === 1) return "לפני שעה";
  if (diffHours < 24) return `לפני ${diffHours} שעות`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays === 1) return "אתמול";
  if (diffDays < 7) return `לפני ${diffDays} ימים`;

  return date.toLocaleDateString("he-IL", { day: "numeric", month: "short", timeZone: "Asia/Jerusalem" });
}

/**
 * שורה אחת בטור. mako/N12 (sitemap) מגיעים בלי summary/image (ראה SOURCES.md) —
 * השורה מתכווצת בהתאם (בלי עמודת תמונה) במקום להישאר עם רווח ריק.
 */
function renderRow(card, now) {
  const link = safeUrl(card.link);
  const image = safeUrl(card.image);
  const title = escapeHtml(card.title);
  const source = escapeHtml(card.source);
  const readHref = link ? readPageUrl(link) : null;
  const relTime = formatRelativeTime(card.pubDate, now);

  const dekHtml = card.summary ? `<p class="row__dek">${escapeHtml(card.summary)}</p>` : "";
  const metaRight = card.summary
    ? relTime
      ? `<span class="row__time">· ${escapeHtml(relTime)}</span>`
      : ""
    : `<span class="row__note">· ללא תקציר במקור</span>`;

  return `
    <article class="row${image ? "" : " row--no-photo"}">
      ${
        image
          ? `<a class="row__photo-link" href="${readHref ?? "#"}"><img class="row__photo" src="${image}" alt="" loading="lazy"></a>`
          : ""
      }
      <div class="row__body">
        <h3 class="row__title">
          ${readHref ? `<a href="${readHref}">${title}</a>` : title}
        </h3>
        ${dekHtml}
        <div class="row__meta">
          <span class="row__source">${source}</span>
          ${metaRight}
        </div>
      </div>
    </article>`;
}

function renderColumn(column, now) {
  const meta = COLUMN_META[column.column];
  const slug = meta?.slug ?? `col-${column.column}`;
  const rowsHtml = column.cards.map((card) => renderRow(card, now)).join("");

  return `
    <section class="column" id="col-${slug}" data-col="${column.column}">
      <div class="col-head">
        <span class="col-head__dot"></span>
        <h2>${escapeHtml(column.name)}</h2>
      </div>
      <p class="brief">${escapeHtml(column.brief)}</p>
      ${rowsHtml}
    </section>`;
}

function renderNav(columns) {
  const items = columns
    .map((column) => {
      const meta = COLUMN_META[column.column];
      const slug = meta?.slug ?? `col-${column.column}`;
      return `<li><a href="#col-${slug}" data-col="${column.column}">${escapeHtml(column.name)}</a></li>`;
    })
    .join("");
  return `<nav><ul class="nav">${items}</ul></nav>`;
}

function renderMasthead(dateLabel, columns) {
  return `
  <header class="masthead">
    <div class="masthead__top">
      <p class="brand">Daily</p>
      <p class="date">${escapeHtml(dateLabel)}</p>
    </div>
    ${columns.length > 0 ? renderNav(columns) : ""}
  </header>`;
}

// שם ה-column-accent (var(--accent)) לכל טור מוגדר כאן פעם אחת, ומשתנה עם ה-media
// query — כל אלמנט שנמצא בתוך .column[data-col] או .nav a[data-col] יורש אותו.
const COLUMN_ACCENT_RULES = Object.entries(COLUMN_META)
  .map(([id, meta]) => `.column[data-col="${id}"], .nav a[data-col="${id}"] { --accent: ${meta.light}; }`)
  .join("\n  ");
const COLUMN_ACCENT_RULES_DARK = Object.entries(COLUMN_META)
  .map(([id, meta]) => `.column[data-col="${id}"], .nav a[data-col="${id}"] { --accent: ${meta.dark}; }`)
  .join("\n    ");

// עיצוב משותף לעמוד הראשי ולעמוד הסיכום ה-lazy — כדי לא לשכפל CSS בשני מקומות.
const BASE_STYLES = `
  :root {
    color-scheme: light dark;
    --bg: #faf9f7;
    --surface: #ffffff;
    --text: #1c1c1f;
    --text-muted: #6b6d78;
    --border: #e4e3df;
    --border-soft: #edece8;
    --accent: #3450d1;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #131318;
      --surface: #1c1d22;
      --text: #eeeef1;
      --text-muted: #8b8e9b;
      --border: #26272d;
      --border-soft: #1c1d22;
      --accent: #4c6fff;
    }
  }
  ${COLUMN_ACCENT_RULES}
  @media (prefers-color-scheme: dark) {
    ${COLUMN_ACCENT_RULES_DARK}
  }

  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font-family: "Assistant", "Segoe UI", sans-serif;
    line-height: 1.6;
  }
  h1, h2, h3 { font-family: "Noto Serif Hebrew", serif; font-weight: 500; }

  .page { max-width: 720px; margin: 0 auto; padding: 0 1.25rem 4rem; }

  .masthead {
    padding: 1.75rem 0 1.25rem;
    border-bottom: 1px solid var(--border);
    margin-bottom: 2.25rem;
  }
  .masthead__top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 1.1rem;
  }
  .brand { font-size: 1.25rem; margin: 0; letter-spacing: 0.01em; }
  .date { font-size: 0.78rem; color: var(--text-muted); margin: 0; }

  .nav { display: flex; flex-wrap: wrap; gap: 0.3rem; margin: 0; padding: 0; list-style: none; }
  .nav a {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.7rem;
    border-radius: 999px;
    font-size: 0.83rem;
    font-weight: 600;
    color: var(--text-muted);
    text-decoration: none;
    transition: background-color 0.15s ease, color 0.15s ease;
  }
  .nav a:hover, .nav a:focus-visible { color: var(--text); background: var(--border-soft); }
  .nav a::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--accent); flex: none; }

  .column { margin-bottom: 3.5rem; scroll-margin-top: 1.25rem; }
  .column:last-child { margin-bottom: 0; }

  .col-head { display: flex; align-items: baseline; gap: 0.65rem; margin-bottom: 1.25rem; }
  .col-head__dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); flex: none; }
  .col-head h2 { font-size: 1.4rem; margin: 0; }

  .brief {
    font-size: 1rem;
    line-height: 1.8;
    margin: 0 0 2rem;
    padding-inline-start: 1rem;
    border-inline-start: 2px solid var(--accent);
  }

  .row {
    display: grid;
    grid-template-columns: 88px 1fr;
    gap: 1rem;
    padding: 1.15rem 0;
    border-top: 1px solid var(--border-soft);
    align-items: start;
  }
  .row:first-of-type { border-top: none; padding-top: 0; }
  .row--no-photo { grid-template-columns: 1fr; }

  .row__photo-link { display: block; }
  .row__photo { width: 88px; aspect-ratio: 1 / 1; object-fit: cover; border-radius: 6px; display: block; }

  .row__title { font-family: "Assistant", sans-serif; font-weight: 600; font-size: 1rem; line-height: 1.5; margin: 0 0 0.45rem; }
  .row__title a { color: var(--text); text-decoration: none; }
  .row__title a:hover { color: var(--accent); }
  .row__dek { font-size: 0.88rem; line-height: 1.6; color: var(--text-muted); margin: 0 0 0.55rem; }
  .row__meta { display: flex; align-items: center; gap: 0.5rem; font-size: 0.78rem; flex-wrap: wrap; }
  .row__source { color: var(--accent); font-weight: 600; }
  .row__time { color: var(--text-muted); }
  .row__note { color: var(--text-muted); font-style: italic; }

  .empty-state { text-align: center; color: var(--text-muted); padding: 3rem 1rem; }
  footer {
    text-align: center;
    color: var(--text-muted);
    font-size: 0.8rem;
    padding: 1.5rem 1rem 2.5rem;
    border-top: 1px solid var(--border);
    margin-top: 2rem;
  }

  .back-link { display: inline-block; margin: 1.75rem 0 1.25rem; color: var(--accent); text-decoration: none; font-size: 0.9rem; }
  .back-link:hover { text-decoration: underline; }
  .read-article__image { width: 100%; max-height: 360px; object-fit: cover; border-radius: 10px; display: block; margin-bottom: 1.25rem; }
  .read-article__title { font-size: 1.5rem; margin: 0 0 0.5rem; }
  .read-article__source { font-size: 0.85rem; color: var(--accent); font-weight: 600; margin: 0 0 1.5rem; }
  .read-article__summary { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 1.25rem 1.5rem; }
  .read-article__summary p { margin: 0 0 1rem; line-height: 1.8; }
  .read-article__summary p:last-child { margin-bottom: 0; }
  .read-article__source-link {
    display: inline-block;
    margin-top: 1.5rem;
    padding: 0.6rem 1.2rem;
    border: 1px solid var(--accent);
    border-radius: 8px;
    color: var(--accent);
    text-decoration: none;
    font-size: 0.9rem;
  }
  .read-article__source-link:hover { background: var(--accent); color: var(--surface); }
  .read-article__note { color: var(--text-muted); font-size: 0.8rem; margin-top: 0.75rem; }
`;

function pageShell({ title, bodyHtml }) {
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+Hebrew:wght@400;500;600&family=Assistant:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${BASE_STYLES}</style>
</head>
<body>
  ${bodyHtml}
  <footer>
    נבנה עם README.md · EDITORIAL.md · SOURCES.md
  </footer>
</body>
</html>`;
}

export function renderPage(edition) {
  const now = new Date();
  const generatedDate = new Date(edition.generatedAt).toLocaleString("he-IL", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Asia/Jerusalem",
  });

  const hasColumns = edition.columns.length > 0;
  const columnsHtml = hasColumns
    ? edition.columns.map((column) => renderColumn(column, now)).join("")
    : `<p class="empty-state">אין עדיין גיליון להיום.</p>`;

  return pageShell({
    title: "Daily — הדייג'סט היומי",
    bodyHtml: `
  <div class="page">
    ${renderMasthead(generatedDate, hasColumns ? edition.columns : [])}
    <main>
      ${columnsHtml}
    </main>
  </div>`,
  });
}

/**
 * עמוד הסיכום ה-lazy (EDITORIAL.md §3.3): כותרת + תמונה + סיכום 300 מילה + לינק למקור.
 * record = { title, image, source, summary, link, generatedAt, fromCache }.
 * summary/title/source תמיד עוברים escapeHtml, link/image תמיד עוברים safeUrl —
 * גם אם מקורם הפעם ב-Gemini/בדף המקור ולא ב-RSS, הם עדיין תוכן חיצוני לא מהימן.
 */
export function renderReadPage(record) {
  const link = safeUrl(record.link);
  const image = safeUrl(record.image);
  const title = escapeHtml(record.title || "כתבה ללא כותרת");
  const source = escapeHtml(record.source || "");

  const summaryParagraphs = String(record.summary ?? "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join("");

  return pageShell({
    title: record.title ? `${record.title} — Daily` : "Daily — סיכום כתבה",
    bodyHtml: `
  <div class="page">
    <main>
      <a class="back-link" href="/">← חזרה לגיליון</a>
      <article>
        ${image ? `<img class="read-article__image" src="${image}" alt="">` : ""}
        <h1 class="read-article__title">${title}</h1>
        ${source ? `<p class="read-article__source">${source}</p>` : ""}
        <div class="read-article__summary">
          ${summaryParagraphs || "<p>לא נמצא תוכן מספק לסיכום.</p>"}
        </div>
        ${link ? `<a class="read-article__source-link" href="${link}" target="_blank" rel="noopener noreferrer">לינק למקור</a>` : ""}
        ${record.fromCache ? `<p class="read-article__note">סיכום זה נשמר במטמון — נוצר בלחיצה קודמת.</p>` : ""}
      </article>
    </main>
  </div>`,
  });
}
