/**
 * עזר משותף ל-fetch עם timeout ו-User-Agent אחיד.
 * משמש גם את רכיב גילוי-הפיד (feedDiscovery.js) וגם את הקציר (harvest.js) —
 * כדי לא לשכפל את אותה לוגיקת timeout/headers פעמיים.
 */

export const DEFAULT_USER_AGENT =
  "DailyDigestBot/0.1 (+personal RSS reader; not a crawler)";

/**
 * @param {string} url
 * @param {{ timeoutMs?: number, userAgent?: string, accept?: string }} [options]
 */
export async function fetchText(url, options = {}) {
  const timeoutMs = options.timeoutMs ?? 10000;
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  const accept =
    options.accept ?? "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": userAgent, Accept: accept },
    });
    const text = await response.text();
    return { ok: response.ok, status: response.status, finalUrl: response.url, text };
  } finally {
    clearTimeout(timer);
  }
}
