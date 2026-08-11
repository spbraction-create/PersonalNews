/**
 * רכיב גילוי-פיד (README.md שלב 2 / שלב 7).
 *
 * מקבל כתובת אתר ומנסה לגלות את פיד ה-RSS/Atom שלו בשתי שיטות, לפי הסדר:
 *   1. חיפוש תג <link rel="alternate" type="application/rss+xml"> (או atom+xml) בדף הבית.
 *   2. אם לא נמצא — ניסיון נתיבי ברירת מחדל נפוצים (/feed וכו').
 *
 * לא מסתפק בכך שהכתובת עונה 200 — מושך את הפיד עצמו ומוודא שהוא XML תקין
 * עם לפחות פריט אחד (<item> או <entry>), כדי לא "לאמת" פיד ריק או שבור.
 *
 * בלי תלויות חיצוניות בכוונה: אותו קובץ ישמש גם בתוך GitHub Action (Node)
 * וגם בתוך Cloudflare Worker (שלב 7) — שניהם תומכים ב-fetch המובנה.
 */

import { fetchText, DEFAULT_USER_AGENT } from "./http.js";

const DEFAULT_FALLBACK_PATHS = ["/feed", "/feed/", "/rss", "/rss.xml"];

/** מוצא תגי <link> שמסמנים פיד alternate בתוך HTML, ומחזיר את כתובות ה-href הגולמיות. */
function extractFeedLinksFromHtml(html) {
  const linkTags = html.match(/<link\b[^>]*>/gi) || [];
  const hrefs = [];

  for (const tag of linkTags) {
    const rel = tag.match(/\brel\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const type = tag.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];

    if (!rel || !href || !rel.includes("alternate")) continue;
    if (!type || (!type.includes("rss") && !type.includes("atom"))) continue;

    hrefs.push(href);
  }

  return hrefs;
}

function looksLikeFeedXml(text) {
  return /<rss[\s>]/i.test(text) || /<feed[\s>]/i.test(text) || /<rdf:rdf/i.test(text);
}

function countFeedItems(xml) {
  const items = xml.match(/<item[\s>]/gi)?.length ?? 0;
  const entries = xml.match(/<entry[\s>]/gi)?.length ?? 0;
  return items + entries;
}

/**
 * מגלה את פיד ה-RSS/Atom של אתר.
 * @param {string} siteUrl כתובת הבית של האתר.
 * @param {{ timeoutMs?: number, userAgent?: string, fallbackPaths?: string[] }} [options]
 * @returns {Promise<{
 *   url: string, ok: boolean, feedUrl: string|null, itemCount: number,
 *   method: string|null, candidatesTried: string[], error: string|null
 * }>}
 */
export async function discoverFeed(siteUrl, options = {}) {
  const timeoutMs = options.timeoutMs ?? 10000;
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  const fallbackPaths = options.fallbackPaths ?? DEFAULT_FALLBACK_PATHS;

  const result = {
    url: siteUrl,
    ok: false,
    feedUrl: null,
    itemCount: 0,
    method: null,
    candidatesTried: [],
    error: null,
  };

  let homepage = null;
  try {
    homepage = await fetchText(siteUrl, { timeoutMs, userAgent });
    if (!homepage.ok) {
      result.error = `דף הבית החזיר סטטוס ${homepage.status}`;
    }
  } catch (err) {
    result.error = `שגיאה בטעינת דף הבית: ${err.message}`;
  }

  const candidates = [];

  if (homepage?.ok) {
    const base = homepage.finalUrl || siteUrl;
    for (const href of extractFeedLinksFromHtml(homepage.text)) {
      try {
        candidates.push({ url: new URL(href, base).toString(), method: "link-tag" });
      } catch {
        // כתובת לא תקינה בתג ה-link — מתעלמים ועוברים הלאה
      }
    }
  }

  for (const fallbackPath of fallbackPaths) {
    try {
      candidates.push({
        url: new URL(fallbackPath, siteUrl).toString(),
        method: `fallback:${fallbackPath}`,
      });
    } catch {
      // כתובת בסיס לא תקינה — לא אמור לקרות, אבל לא מפיל את הריצה
    }
  }

  const seen = new Set();
  for (const candidate of candidates) {
    if (seen.has(candidate.url)) continue;
    seen.add(candidate.url);
    result.candidatesTried.push(candidate.url);

    try {
      const feedResponse = await fetchText(candidate.url, { timeoutMs, userAgent });
      if (!feedResponse.ok) continue;
      if (!looksLikeFeedXml(feedResponse.text)) continue;

      const itemCount = countFeedItems(feedResponse.text);
      if (itemCount === 0) continue;

      result.ok = true;
      result.feedUrl = candidate.url;
      result.itemCount = itemCount;
      result.method = candidate.method;
      result.error = null;
      return result;
    } catch {
      // מועמד נכשל — ממשיכים למועמד הבא
      continue;
    }
  }

  if (!result.error) {
    result.error = "לא נמצא פיד תקין — לא בדף הבית ולא בנתיבי ברירת המחדל";
  }
  return result;
}
