/**
 * מטמון עמוד הסיכום ה-lazy ב-KV (EDITORIAL.md §3.3): מפתח = hash של כתובת המקור,
 * כדי שלא נצטרך "טבלת מיפוי" בין id לכתובת — הכתובת עצמה היא המקור לאמת.
 */

// TTL של המטמון — חודש. אחרי זה, לחיצה הבאה על אותה כתבה תיצור סיכום מחדש.
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30;

/** hash יציב (SHA-256, מקוצר) של כתובת — משמש כמפתח ב-KV. Web Crypto מובנה ב-Worker. */
export async function hashLink(link) {
  const data = new TextEncoder().encode(link);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex.slice(0, 32);
}

export async function getCachedSummary(kv, link) {
  const key = `article:${await hashLink(link)}`;
  return kv.get(key, "json");
}

export async function putCachedSummary(kv, link, summaryRecord) {
  const key = `article:${await hashLink(link)}`;
  await kv.put(key, JSON.stringify(summaryRecord), { expirationTtl: CACHE_TTL_SECONDS });
}
