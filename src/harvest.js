/**
 * צינור הקציר (README.md שלב 3): מושך פידים מאומתים, מפרק אותם לכתבות בודדות,
 * מסנן ל-24 השעות האחרונות, ומנקה כפילויות. בלי AI בשלב הזה — זה איסוף גולמי בלבד.
 */
import { XMLParser } from "fast-xml-parser";
import { fetchText, DEFAULT_USER_AGENT } from "./http.js";

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
 * קוצר רשימת מקורות: {name, feedUrl, url, columns}[]
 * @param {{name: string, feedUrl: string, url: string, columns: number[]}[]} sources
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
      const response = await fetchText(source.feedUrl, {
        timeoutMs,
        userAgent,
        accept: FEED_ACCEPT,
      });
      if (!response.ok) {
        throw new Error(`הפיד החזיר סטטוס ${response.status}`);
      }

      const items = parseFeed(response.text, source).filter((item) => item.link);
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
