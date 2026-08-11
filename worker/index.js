/**
 * Cloudflare Worker — שכבת ההגשה הבסיסית (README.md שלב 5, גרסת MVP בלי KV/lazy-dive).
 * קורא את data/daily-edition.json ישירות מהריפו הציבורי ב-GitHub ומרנדר עמוד HTML.
 */
import { renderPage } from "./render.js";

export default {
  async fetch(request, env) {
    const dataUrl = `${env.DATA_REPO_RAW_BASE}/data/daily-edition.json`;

    let edition;
    try {
      const response = await fetch(dataUrl, {
        cf: { cacheTtl: 300, cacheEverything: true },
      });
      if (!response.ok) {
        return new Response(`שגיאה בטעינת הנתונים מהריפו (סטטוס ${response.status})`, {
          status: 502,
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      }
      edition = await response.json();
    } catch (err) {
      return new Response(`שגיאה בטעינת הגיליון: ${err.message}`, {
        status: 500,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    const html = renderPage(edition);
    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=300",
      },
    });
  },
};
