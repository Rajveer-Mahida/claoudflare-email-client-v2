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

/**
 * Sanitize email HTML for safe rendering, after rewriting inline-image refs.
 * When `blockRemote` is set, remote `http(s)` images are stripped (their URL is
 * stashed on `data-blocked-src`) so tracking pixels don't load — returns how
 * many were blocked. cid:/data:/relative images are always kept.
 */
export function renderEmailHtml(
  html: string | null | undefined,
  messageId: string,
  opts?: { blockRemote?: boolean },
): { html: string; blocked: number } {
  if (!html) return { html: "", blocked: 0 };
  const withCids = rewriteCids(String(html), messageId);
  let out = DOMPurify.sanitize(withCids, {
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "link", "meta", "form"],
    FORBID_ATTR: ["srcset"],
    ALLOW_DATA_ATTR: false,
  });

  let blocked = 0;
  if (opts?.blockRemote) {
    out = out.replace(/<img\b[^>]*>/gi, (tag) => {
      const m = tag.match(/\ssrc\s*=\s*("([^"]*)"|'([^']*)')/i);
      if (!m) return tag;
      const url = (m[2] ?? m[3] ?? "").trim();
      if (!/^https?:/i.test(url)) return tag; // keep cid:/data:/relative
      blocked++;
      return tag
        .replace(m[0], ` data-blocked-src="${url.replace(/"/g, "&quot;")}"`)
        .replace(/<img\b/i, '<img data-blocked="1"');
    });
  }
  return { html: out, blocked };
}
