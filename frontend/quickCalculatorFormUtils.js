/** Shared parsing for free calculator forms (tax + retirement share payloads). */

/** Ignore React click events mistakenly passed as estimate payloads (onClick={fn} vs () => fn()). */
export function isTaxEstimatePayload(value) {
  return (
    value != null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    ("estimate_mode" in value || "age" in value || "current_age" in value)
  );
}

export function isRetirementEstimatePayload(value) {
  return (
    value != null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    ("portfolio_value_usd" in value ||
      "current_age" in value ||
      "years_to_retirement" in value ||
      "household" in value)
  );
}

/**
 * Parse a current-age field; empty/invalid input returns null (never 0 from "").
 * @param {unknown} value
 * @returns {number | null}
 */
export function parseAgeInput(value) {
  const s = String(value ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 18 || rounded > 100) return null;
  return rounded;
}

/**
 * @param {Record<string, unknown> | null | undefined} payload
 * @returns {number | null}
 */
export function resolvePayloadAge(payload) {
  if (!payload || typeof payload !== "object") return null;
  for (const key of ["age", "current_age"]) {
    const n = parseAgeInput(payload[key]);
    if (n != null) return n;
  }
  return null;
}

/**
 * @param {unknown} value
 * @param {number} [fallback=62]
 * @returns {number | null} null if user entered invalid SS start age
 */
export function parseSsStartAgeInput(value, fallback = 62) {
  const s = String(value ?? "").trim();
  if (s === "") return fallback;
  const n = Math.round(Number(s));
  if (!Number.isFinite(n) || n < 62 || n > 70) return null;
  return n;
}
