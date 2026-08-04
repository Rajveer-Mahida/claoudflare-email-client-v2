// Deriving the "mailed-by" / "signed-by" lines Gmail shows in its details panel.
//
// Both come from authentication headers on the raw .eml, not from anything we
// store in D1:
//   mailed-by → the domain that passed SPF (the envelope sender's domain)
//   signed-by → the domain in the DKIM signature
//
// Preferred source is the `Authentication-Results` header, because it records a
// *verified* result. Falling back to `Return-Path` / `DKIM-Signature` only tells
// us what the sender claimed, so those are used just to fill in the blanks.

export type MailHeader = { key: string; value: string };

/** The domain of an address, tolerating `Name <a@b.com>` and `<a@b.com>`. */
export function domainOf(address: string | undefined | null): string | null {
  if (!address) return null;
  const inAngle = address.match(/<([^>]*)>/);
  const bare = (inAngle ? inAngle[1] : address).trim();
  const at = bare.lastIndexOf("@");
  if (at < 0) return null;
  const domain = bare
    .slice(at + 1)
    .trim()
    .replace(/[>;,\s].*$/, "")
    .toLowerCase();
  return domain || null;
}

/** postal-mime lowercases header keys; be tolerant anyway. */
export function headerValue(headers: MailHeader[], key: string): string | undefined {
  return headers.find((h) => h.key?.toLowerCase() === key)?.value;
}

/** Message-IDs travel in angle brackets; stored values may lack them. */
export function messageIdRef(id: string): string {
  const t = id.trim();
  return t.startsWith("<") ? t : `<${t}>`;
}

/** Strip angle brackets for comparisons against bare stored Message-IDs. */
export function messageIdBare(id: string): string {
  const t = id.trim();
  return t.startsWith("<") && t.endsWith(">") ? t.slice(1, -1).trim() : t;
}

/**
 * Expand each Message-ID into bracketed + bare forms so DB lookups match
 * either storage convention. Caps at `limit` distinct values.
 */
export function expandMessageIdCandidates(ids: string[], limit = 20): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const t = raw?.trim();
    if (!t) continue;
    for (const v of [messageIdRef(t), messageIdBare(t)]) {
      if (!v || seen.has(v)) continue;
      seen.add(v);
      out.push(v);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/**
 * Pull `method=pass ... prop=value` out of an Authentication-Results header.
 * Only a `pass` counts — reporting the domain from a failed check would put a
 * forged sender in the UI as though it had been verified.
 */
function authResult(
  headers: MailHeader[],
  method: "spf" | "dkim",
  prop: string,
): string | null {
  const raw = headerValue(headers, "authentication-results");
  if (!raw) return null;
  // Each result is separated by ';' — e.g. "dkim=pass header.d=netflix.com".
  for (const part of raw.split(";")) {
    const m = part.match(new RegExp(`\\b${method}\\s*=\\s*(\\w+)`, "i"));
    if (!m || m[1].toLowerCase() !== "pass") continue;
    const p = part.match(new RegExp(`\\b${prop.replace(".", "\\.")}\\s*=\\s*([^\\s;]+)`, "i"));
    if (p) return p[1].replace(/[<>]/g, "").toLowerCase();
  }
  return null;
}

/** The domain that sent the mail, per SPF. */
export function mailedBy(headers: MailHeader[]): string | null {
  const verified = authResult(headers, "spf", "smtp.mailfrom");
  if (verified) return domainOf(verified) ?? verified;
  // Unverified fallbacks: what the envelope claimed.
  return domainOf(headerValue(headers, "return-path")) ?? null;
}

/** The domain that DKIM-signed the mail. */
export function signedBy(headers: MailHeader[]): string | null {
  const verified = authResult(headers, "dkim", "header.d");
  if (verified) return verified;
  const sig = headerValue(headers, "dkim-signature");
  const d = sig?.match(/\bd\s*=\s*([^;\s]+)/i);
  return d ? d[1].toLowerCase() : null;
}

/** Reply-To, when it differs from From (Gmail surfaces it in the same panel). */
export function replyToOf(headers: MailHeader[]): string | null {
  return headerValue(headers, "reply-to")?.trim() || null;
}
