import DOMPurify from "dompurify";

// Open links in a new tab and harden them.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if ("target" in node && node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer nofollow");
  }
});

/**
 * Rewrite `cid:` image references to the API endpoint that streams the inline
 * attachment from R2. Mirrors legacy lib/sanitize.ts rewriteCids.
 */
export function rewriteCids(html: string, messageId: string): string {
  return html.replace(/\bsrc=(["'])cid:([^"'>\s]+)\1/gi, (_m, quote, cid) => {
    const encoded = encodeURIComponent(cid);
    const mid = encodeURIComponent(messageId);
    return `src=${quote}/api/attachments/cid?mid=${mid}&cid=${encoded}${quote}`;
  });
}

/** Sanitize email HTML for safe rendering, after rewriting inline-image refs. */
export function renderEmailHtml(html: string | null | undefined, messageId: string): string {
  if (!html) return "";
  const withCids = rewriteCids(String(html), messageId);
  return DOMPurify.sanitize(withCids, {
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "link", "meta", "form"],
    FORBID_ATTR: ["srcset"],
    ALLOW_DATA_ATTR: false,
  });
}
