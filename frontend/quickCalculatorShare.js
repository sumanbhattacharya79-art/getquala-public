import { getJson } from "./api";
import { absoluteUrl } from "./seoConfig.js";

const RETIREMENT_PATH = "/retirement-calculator";
const TAX_PATH = "/tax-calculator";

/** @typedef {'retirement' | 'tax'} CalculatorShareKind */

/**
 * @param {string} pathname
 * @param {CalculatorShareKind} kind
 */
export function parseShareIdFromPath(pathname, kind) {
  const base = kind === "retirement" ? RETIREMENT_PATH : TAX_PATH;
  const m = String(pathname || "").match(new RegExp(`^${base}/s/([^/]+)/?$`));
  return m ? decodeURIComponent(m[1]) : null;
}

/** @param {CalculatorShareKind} kind */
export function sharePathForId(kind, shareId) {
  const base = kind === "retirement" ? RETIREMENT_PATH : TAX_PATH;
  return `${base}/s/${encodeURIComponent(shareId)}`;
}

/** @param {CalculatorShareKind} kind */
export function pushSharePathForKind(kind, shareId) {
  if (!shareId || typeof window === "undefined") return;
  try {
    window.history.replaceState(null, "", sharePathForId(kind, shareId));
  } catch {
    /* ignore */
  }
}

/** @param {CalculatorShareKind} kind */
export function absoluteShareUrl(kind, shareId) {
  return absoluteUrl(sharePathForId(kind, shareId));
}

/**
 * @param {string} shareId
 * @returns {Promise<{ kind: CalculatorShareKind, payload: Record<string, unknown>, share_url?: string }>}
 */
export async function fetchQuickCalculatorShare(shareId) {
  return getJson(`/api/quick-calculator-share/${encodeURIComponent(shareId)}`);
}

/**
 * @param {string} url
 * @returns {Promise<'clipboard' | 'prompt'>}
 */
export async function copyShareLink(url) {
  const text = String(url || "").trim();
  if (!text) throw new Error("No link to copy");
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return "clipboard";
  }
  window.prompt("Copy this link:", text);
  return "prompt";
}

/**
 * @param {{ title: string, text: string, url: string }} payload
 * @returns {Promise<boolean>}
 */
export async function tryNativeShare(payload) {
  if (!navigator.share) return false;
  try {
    await navigator.share(payload);
    return true;
  } catch (err) {
    if (err?.name === "AbortError") return true;
    return false;
  }
}
