import { useCallback, useState } from "react";
import { copyShareLink, tryNativeShare } from "./quickCalculatorShare.js";

/**
 * Copy link (+ optional native share) for calculator results.
 */
export function QuickCalcShareBar({
  shareUrl,
  shareTitle = "Quala calculator",
  shareText = "",
  extraActions = null,
  className = "",
}) {
  const [status, setStatus] = useState("");

  const onCopyLink = useCallback(async () => {
    if (!shareUrl) return;
    setStatus("");
    try {
      const method = await copyShareLink(shareUrl);
      setStatus(method === "clipboard" ? "Link copied" : "Copy the link from the dialog");
    } catch (err) {
      console.warn("Copy share link failed:", err);
      setStatus("Copy failed — try again");
    }
    window.setTimeout(() => setStatus(""), 5000);
  }, [shareUrl]);

  const onNativeShare = useCallback(async () => {
    if (!shareUrl) return;
    setStatus("");
    const ok = await tryNativeShare({
      title: shareTitle,
      text: shareText || shareTitle,
      url: shareUrl,
    });
    if (ok) setStatus("Shared");
    else {
      try {
        await copyShareLink(shareUrl);
        setStatus("Link copied");
      } catch {
        setStatus("Share unavailable");
      }
    }
    window.setTimeout(() => setStatus(""), 5000);
  }, [shareUrl, shareTitle, shareText]);

  if (!shareUrl) return null;

  const canNativeShare = typeof navigator !== "undefined" && Boolean(navigator.share);

  return (
    <div className={`quick-calc-share-row capture-exclude ${className}`.trim()}>
      <button type="button" className="quick-calc-share-btn" onClick={onCopyLink}>
        Copy link
      </button>
      {canNativeShare ? (
        <button type="button" className="quick-calc-share-btn" onClick={onNativeShare}>
          Share…
        </button>
      ) : null}
      {extraActions}
      {status ? <span className="quick-calc-share-status">{status}</span> : null}
      <input
        type="text"
        className="quick-calc-share-url"
        readOnly
        value={shareUrl}
        aria-label="Shareable calculator link"
        onFocus={(e) => e.target.select()}
      />
    </div>
  );
}
