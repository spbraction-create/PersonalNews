/**
 * בניית ה-HTML של הגיליון. נפרד מ-index.js כדי שלוגיקת התצוגה תהיה נבדקת/קריאה בפני עצמה.
 *
 * הערת אבטחה: title/summary/source מגיעים במקור מפידי RSS חיצוניים — תוכן לא מהימן.
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

function renderCard(card) {
  const link = safeUrl(card.link);
  const image = safeUrl(card.image);
  const title = escapeHtml(card.title);
  const summary = escapeHtml(card.summary);
  const source = escapeHtml(card.source);
  // כרטיס לא קופץ ישר למקור — הוא עובר קודם דרך עמוד הסיכום ה-lazy (EDITORIAL.md §3.3).
  const readHref = link ? readPageUrl(link) : null;

  return `
    <article class="card">
      ${image ? `<a class="card__image-link" href="${readHref ?? "#"}"><img class="card__image" src="${image}" alt="" loading="lazy"></a>` : ""}
      <div class="card__body">
        <h3 class="card__title">
          ${readHref ? `<a href="${readHref}">${title}</a>` : title}
        </h3>
        <p class="card__summary">${summary}</p>
        <p class="card__source">${source}</p>
      </div>
    </article>`;
}

function renderColumn(column) {
  return `
    <section class="column">
      <h2 class="column__title">${escapeHtml(column.name)}</h2>
      <p class="column__brief">${escapeHtml(column.brief)}</p>
      <div class="card-grid">
        ${column.cards.map(renderCard).join("")}
      </div>
    </section>`;
}

// עיצוב משותף לעמוד הראשי ולעמוד הסיכום ה-lazy — כדי לא לשכפל CSS בשני מקומות.
const BASE_STYLES = `
  :root {
    color-scheme: light dark;
    --bg: #f7f7f5;
    --surface: #ffffff;
    --text: #1a1a1a;
    --text-muted: #666666;
    --border: #e5e5e0;
    --accent: #b3441e;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #16161a;
      --surface: #1f1f24;
      --text: #f0f0ee;
      --text-muted: #a0a0a8;
      --border: #34343c;
      --accent: #e08a5c;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font-family: "Segoe UI", system-ui, sans-serif;
    line-height: 1.6;
  }
  header {
    padding: 1.5rem 1rem 1rem;
    text-align: center;
    border-bottom: 1px solid var(--border);
  }
  header h1 { margin: 0 0 0.25rem; font-size: 1.6rem; }
  header p { margin: 0; color: var(--text-muted); font-size: 0.9rem; }
  main {
    max-width: 1100px;
    margin: 0 auto;
    padding: 1rem;
  }
  .column { margin-bottom: 2.5rem; }
  .column__title {
    font-size: 1.3rem;
    border-bottom: 2px solid var(--accent);
    padding-bottom: 0.4rem;
    margin-bottom: 0.75rem;
  }
  .column__brief {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 1rem 1.25rem;
    margin-bottom: 1.25rem;
  }
  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 1rem;
  }
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .card__image-link { display: block; }
  .card__image {
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    display: block;
  }
  .card__body { padding: 0.75rem 1rem 1rem; flex: 1; display: flex; flex-direction: column; }
  .card__title { font-size: 1rem; margin: 0 0 0.4rem; }
  .card__title a { color: var(--text); text-decoration: none; }
  .card__title a:hover { color: var(--accent); }
  .card__summary {
    font-size: 0.85rem;
    color: var(--text-muted);
    margin: 0 0 0.5rem;
    flex: 1;
  }
  .card__source { font-size: 0.75rem; color: var(--accent); margin: 0; }
  .empty-state { text-align: center; color: var(--text-muted); padding: 3rem 1rem; }
  footer {
    text-align: center;
    color: var(--text-muted);
    font-size: 0.8rem;
    padding: 1.5rem 1rem 2.5rem;
  }
  .back-link { display: inline-block; margin-bottom: 1rem; color: var(--accent); text-decoration: none; font-size: 0.9rem; }
  .back-link:hover { text-decoration: underline; }
  .read-article__image {
    width: 100%;
    max-height: 360px;
    object-fit: cover;
    border-radius: 10px;
    display: block;
    margin-bottom: 1rem;
  }
  .read-article__title { font-size: 1.4rem; margin: 0 0 0.4rem; }
  .read-article__source { font-size: 0.85rem; color: var(--accent); margin: 0 0 1.25rem; }
  .read-article__summary {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 1.25rem 1.5rem;
  }
  .read-article__summary p { margin: 0 0 1rem; }
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
  const generatedDate = new Date(edition.generatedAt).toLocaleString("he-IL", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Asia/Jerusalem",
  });

  const columnsHtml =
    edition.columns.length > 0
      ? edition.columns.map(renderColumn).join("")
      : `<p class="empty-state">אין עדיין גיליון להיום.</p>`;

  return pageShell({
    title: "הדייג'סט היומי",
    bodyHtml: `
  <header>
    <h1>הדייג'סט היומי שלי</h1>
    <p>עודכן: ${escapeHtml(generatedDate)}</p>
  </header>
  <main>
    ${columnsHtml}
  </main>`,
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
    title: record.title ? `${record.title} — סיכום` : "סיכום כתבה",
    bodyHtml: `
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
  </main>`,
  });
}
