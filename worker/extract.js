/**
 * חילוץ טקסט קריא מדף HTML גולמי של כתבת מקור (עמוד הסיכום ה-lazy, README.md שלב 5.2).
 * משתמש ב-HTMLRewriter — כלי סטרימינג מובנה בסביבת Cloudflare Worker (לא ספרייה חיצונית):
 * https://developers.cloudflare.com/workers/runtime-apis/html-rewriter/
 *
 * גישה: מסירים תגיות "רעש" (script/style/nav/header/footer וכו') ואז אוספים
 * טקסט מתוך <article> אם קיים, אחרת מתוך <body> כברירת מחדל.
 */

// תקרה על אורך הטקסט שנאסוף — כדי לא לשגר עמוד ענק ל-Gemini (עלות/זמן) ולא לצבור זיכרון ללא הגבלה.
const MAX_CHARS = 12000;

class ElementRemover {
  element(el) {
    el.remove();
  }
}

class TextCollector {
  constructor(sink) {
    this.sink = sink;
  }
  text(chunk) {
    if (this.sink.length >= MAX_CHARS) return;
    const value = chunk.text;
    if (value && value.trim()) {
      this.sink.push(value);
    }
  }
}

/**
 * מקבל Response של דף HTML גולמי ומחזיר { text, title }.
 * ה-body של Response אפשר לצרוך רק פעם אחת — לכן כותרת וטקסט מחולצים יחד, במעבר אחד.
 */
export async function extractArticle(response) {
  const articleChunks = [];
  const bodyChunks = [];
  let titleChunks = "";

  const rewriter = new HTMLRewriter()
    .on("script", new ElementRemover())
    .on("style", new ElementRemover())
    .on("noscript", new ElementRemover())
    .on("svg", new ElementRemover())
    .on("nav", new ElementRemover())
    .on("header", new ElementRemover())
    .on("footer", new ElementRemover())
    .on("form", new ElementRemover())
    .on("iframe", new ElementRemover())
    .on("aside", new ElementRemover())
    .on("article", new TextCollector(articleChunks))
    .on("body", new TextCollector(bodyChunks))
    .on("title", {
      text(chunk) {
        titleChunks += chunk.text;
      },
    });

  const transformed = rewriter.transform(response);
  // צריך "לצרוך" את הגוף כדי שה-handlers בכלל ירוצו (סטרימינג עצלן).
  await transformed.text();

  const raw = articleChunks.length > 0 ? articleChunks.join(" ") : bodyChunks.join(" ");
  return {
    text: raw.replace(/\s+/g, " ").trim().slice(0, MAX_CHARS),
    title: titleChunks.replace(/\s+/g, " ").trim(),
  };
}
