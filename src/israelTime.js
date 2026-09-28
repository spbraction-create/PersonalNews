/**
 * שערי הפרסום (מוסף שישי / ירחון) נקבעים לפי התאריך המקומי בישראל, לא UTC —
 * ה-Action רץ ב-UTC, ו-05:20 UTC יכול להיות עדיין "אתמול" או כבר "היום" בישראל
 * תלוי עונה, אז אין להשוואות תאריך גולמיות על Date() בלי אזור זמן.
 *
 * FORCE_WEEKLY=1 / FORCE_MONTHLY=1 (env) עוקפים את הבדיקה — לבדיקה ידנית
 * (workflow_dispatch) בלי להמתין ליום שישי/1 לחודש בפועל.
 */

function israeliParts(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    weekday: "short",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const day = Number(parts.find((p) => p.type === "day")?.value);
  return { weekday, day };
}

export function isFridayInIsrael(now = new Date()) {
  if (process.env.FORCE_WEEKLY === "1") return true;
  return israeliParts(now).weekday === "Fri";
}

export function isFirstOfMonthInIsrael(now = new Date()) {
  if (process.env.FORCE_MONTHLY === "1") return true;
  return israeliParts(now).day === 1;
}
