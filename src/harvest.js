/**
 * צינור הקציר (README.md שלב 3): מושך פידים מאומתים, מפרק אותם לכתבות בודדות,
 * מסנן ל-24 השעות האחרונות, ומנקה כפילויות. בלי AI בשלב הזה — זה איסוף גולמי בלבד.
 */
import { gunzipSync } from "node:zlib";
import { XMLParser } from "fast-xml-parser";
import { fetchText, fetchBuffer, DEFAULT_USER_AGENT } from "./http.js";

const FEED_ACCEPT =
  "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  cdataPropName: "#cdata",
});

function toArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

/** ערכי טקסט ב-fast-xml-parser יכולים לצאת כמחרוזת, או כאובייקט אם יש CDATA/תגי-בת. */
function getText(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "object") {
    if ("#text" in value) return String(value["#text"]);
    if ("#cdata" in value) return String(value["#cdata"]);
  }
  return "";
}

function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/\s+/g, " ")
    .trim();
}

/** ב-RSS זו מחרוזת; ב-Atom זה link עם href, לפעמים מערך של כמה <link> עם rel שונה. */
function extractLink(rawLink, guid) {
  if (typeof rawLink === "string" && rawLink.trim()) return rawLink.trim();

  if (Array.isArray(rawLink)) {
    const alternate = rawLink.find((l) => !l?.["@_rel"] || l["@_rel"] === "alternate");
    const href = (alternate ?? rawLink[0])?.["@_href"];
    if (href) return href;
  } else if (rawLink && typeof rawLink === "object" && rawLink["@_href"]) {
    return rawLink["@_href"];
  }

  const guidText = getText(guid);
  return guidText.startsWith("http") ? guidText : null;
}

function parseDate(value) {
  const text = getText(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function extractImage(entry) {
  const enclosure = toArray(entry.enclosure)[0];
  if (enclosure?.["@_url"] && (!enclosure["@_type"] || enclosure["@_type"].startsWith("image"))) {
    return enclosure["@_url"];
  }

  const mediaContent = toArray(entry["media:content"]).find((m) => m?.["@_url"]);
  if (mediaContent) return mediaContent["@_url"];

  const mediaThumb = toArray(entry["media:thumbnail"])[0];
  if (mediaThumb?.["@_url"]) return mediaThumb["@_url"];

  const html =
    getText(entry.description) || getText(entry["content:encoded"]) || getText(entry.summary);
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match ? match[1] : null;
}

function normalizeItem(rawItem, { link, pubDate, summarySource, sourceMeta }) {
  return {
    title: stripHtml(getText(rawItem.title)),
    link,
    pubDate,
    summary: stripHtml(summarySource).slice(0, 500),
    image: extractImage(rawItem),
    source: sourceMeta.name,
    sourceUrl: sourceMeta.url,
    columns: sourceMeta.columns,
  };
}

function parseFeed(xmlText, sourceMeta) {
  const doc = xmlParser.parse(xmlText);

  if (doc.rss?.channel) {
    const channel = toArray(doc.rss.channel)[0];
    return toArray(channel.item).map((item) =>
      normalizeItem(item, {
        link: extractLink(item.link, item.guid),
        pubDate: parseDate(item.pubDate) ?? parseDate(item["dc:date"]),
        summarySource: getText(item["content:encoded"]) || getText(item.description),
        sourceMeta,
      })
    );
  }

  if (doc["rdf:RDF"]) {
    return toArray(doc["rdf:RDF"].item).map((item) =>
      normalizeItem(item, {
        link: extractLink(item.link, item.guid),
        pubDate: parseDate(item["dc:date"]),
        summarySource: getText(item.description),
        sourceMeta,
      })
    );
  }

  if (doc.feed) {
    return toArray(doc.feed.entry).map((entry) =>
      normalizeItem(entry, {
        link: extractLink(entry.link, entry.id),
        pubDate: parseDate(entry.published) ?? parseDate(entry.updated),
        summarySource: getText(entry.content) || getText(entry.summary),
        sourceMeta,
      })
    );
  }

  return [];
}

/**
 * sitemap חדשות של Google (למשל SiteMap/Mako-News-SitemapIndex.xml) — לא RSS.
 * מבנה: <urlset><url><loc>...</loc><n:news><n:publication_date>...</n:publication_date>
 * <n:title>...</n:title></n:news></url></urlset>. אין בו תקציר או תמונה כלל —
 * רק כותרת+קישור+תאריך פרסום. גילינו את זה כי כמה פידי RSS "רשמיים" של mako
 * התבררו כקפואים/נטושים (ראה SOURCES.md), בזמן שה-sitemap הזה נשאר חי בפועל —
 * כנראה כי גוגל דורש אותו טרי בשביל Google News, ולכן העורכים ממשיכים לתחזק אותו.
 */
function parseSitemapNews(xmlText, sourceMeta) {
  const doc = xmlParser.parse(xmlText);
  const urls = toArray(doc.urlset?.url);
  return urls
    .map((entry) => {
      const news = entry["n:news"];
      if (!news) return null;
      const link = getText(entry.loc);
      const title = stripHtml(getText(news["n:title"]));
      const pubDate = parseDate(news["n:publication_date"]);
      if (!link || !title) return null;
      return {
        title,
        link,
        pubDate,
        summary: "", // sitemap לא כולל תקציר — ראה הערת תיעוד ב-SOURCES.md
        image: null,
        source: sourceMeta.name,
        sourceUrl: sourceMeta.url,
        columns: sourceMeta.columns,
      };
    })
    .filter(Boolean);
}

/** קובץ ה-sitemap עצמו הוא gzip אמיתי (Content-Type: application/x-gzip, לא Content-Encoding) — fetch לא מפענח אותו לבד. */
function decodeMaybeGzip(buffer) {
  const isGzip = buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
  return isGzip ? gunzipSync(buffer).toString("utf8") : buffer.toString("utf8");
}

/**
 * source.feedUrl הוא כתובת אינדקס ה-sitemap (XML רגיל, לא gzip) — מכיל רשימת
 * כתובות sitemap בפועל (בדרך כלל gzip). source.pathFilter (אופציונלי) מסנן
 * רק פריטים שהכתובת שלהם מכילה אחת מהמחרוזות — כי sitemap אחד מכיל את *כל*
 * האתר מעורב (חדשות, בידור, אוכל...), לא רק את המדור שרלוונטי לטור הזה.
 */
async function fetchSitemapNewsItems(source, { timeoutMs, userAgent }) {
  const indexResponse = await fetchText(source.feedUrl, { timeoutMs, userAgent, accept: FEED_ACCEPT });
  if (!indexResponse.ok) {
    throw new Error(`אינדקס ה-sitemap החזיר סטטוס ${indexResponse.status}`);
  }
  const indexDoc = xmlParser.parse(indexResponse.text);
  const sitemapUrls = toArray(indexDoc.sitemapindex?.sitemap)
    .map((s) => getText(s.loc))
    .filter(Boolean);
  if (sitemapUrls.length === 0) {
    throw new Error("אינדקס ה-sitemap לא הכיל אף כתובת sitemap בפועל");
  }

  const allItems = [];
  for (const url of sitemapUrls) {
    const fileResponse = await fetchBuffer(url, { timeoutMs, userAgent });
    if (!fileResponse.ok) continue; // מדלגים על קובץ sitemap בודד שנכשל, לא מפילים את כל המקור
    allItems.push(...parseSitemapNews(decodeMaybeGzip(fileResponse.buffer), source));
  }

  const items = source.pathFilter
    ? allItems.filter((item) => source.pathFilter.some((p) => item.link.includes(p)))
    : allItems;
  return items;
}

async function fetchRssItems(source, { timeoutMs, userAgent }) {
  const response = await fetchText(source.feedUrl, { timeoutMs, userAgent, accept: FEED_ACCEPT });
  if (!response.ok) {
    throw new Error(`הפיד החזיר סטטוס ${response.status}`);
  }
  return parseFeed(response.text, source).filter((item) => item.link);
}

function normalizeLinkForDedupe(link) {
  if (!link) return null;
  try {
    const url = new URL(link);
    url.hash = "";
    for (const param of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|ref$)/.test(param)) url.searchParams.delete(param);
    }
    let normalized = url.toString().toLowerCase();
    if (normalized.endsWith("/")) normalized = normalized.slice(0, -1);
    return normalized;
  } catch {
    return link.trim().toLowerCase();
  }
}

function dedupeByLink(items) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = normalizeLinkForDedupe(item.link);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

/**
 * קוצר רשימת מקורות: {name, feedUrl, url, columns, type?, pathFilter?}[].
 * type ברירת מחדל "rss" (RSS/Atom/RDF רגיל). type: "sitemap-news" — feedUrl הוא
 * כתובת אינדקס sitemap של Google News (לא פיד RSS); pathFilter (מערך מחרוזות,
 * אופציונלי) מסנן רק פריטים שהכתובת שלהם מכילה אחת מהן — ראה fetchSitemapNewsItems.
 * @param {{name: string, feedUrl: string, url: string, columns: number[], type?: string, pathFilter?: string[]}[]} sources
 * @param {{ windowHours?: number, now?: Date, timeoutMs?: number, userAgent?: string }} [options]
 */
export async function harvestSources(sources, options = {}) {
  const windowHours = options.windowHours ?? 24;
  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - windowHours * 60 * 60 * 1000);
  const timeoutMs = options.timeoutMs ?? 15000;
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;

  const perSource = [];
  const collected = [];

  for (const source of sources) {
    try {
      const items =
        source.type === "sitemap-news"
          ? await fetchSitemapNewsItems(source, { timeoutMs, userAgent })
          : await fetchRssItems(source, { timeoutMs, userAgent });

      const withDate = items.filter((item) => item.pubDate);
      const inWindow = withDate.filter((item) => item.pubDate >= cutoff && item.pubDate <= now);

      perSource.push({
        name: source.name,
        feedUrl: source.feedUrl,
        totalItems: items.length,
        itemsWithoutDate: items.length - withDate.length,
        itemsInWindow: inWindow.length,
        error: null,
      });
      collected.push(...inWindow);
    } catch (err) {
      perSource.push({
        name: source.name,
        feedUrl: source.feedUrl,
        totalItems: 0,
        itemsWithoutDate: 0,
        itemsInWindow: 0,
        error: err.message,
      });
    }
  }

  const deduped = dedupeByLink(collected).sort((a, b) => b.pubDate - a.pubDate);

  return {
    generatedAt: now.toISOString(),
    windowHours,
    items: deduped,
    perSource,
    droppedDuplicates: collected.length - deduped.length,
  };
}
