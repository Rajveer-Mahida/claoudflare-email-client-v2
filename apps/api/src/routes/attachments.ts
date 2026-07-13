import { Hono } from "hono";
import type { HonoEnv } from "../env";
import { getAttachmentByCid } from "../db";
import { effectiveOwner } from "../scope";

export const attachments = new Hono<HonoEnv>();

const INLINE_EXT = ["png", "jpg", "jpeg", "gif", "webp", "pdf", "txt"];

// GET /api/attachments/cid?mid=&cid=  → inline image referenced by Content-ID
attachments.get("/cid", async (c) => {
  const mid = c.req.query("mid");
  const cid = c.req.query("cid");
  if (!mid || !cid) return c.json({ error: "mid and cid required" }, 400);

  const att = await getAttachmentByCid(c.env.DB, mid, decodeURIComponent(cid), effectiveOwner(c).owner);
  if (!att) return c.json({ error: "not found" }, 404);

  const obj = await c.env.EMAIL_CACHE.get(att.r2_key);
  if (!obj) return c.json({ error: "not found" }, 404);

  return new Response(obj.body, {
    headers: {
      "content-type":
        att.mime_type ?? obj.httpMetadata?.contentType ?? "application/octet-stream",
      "cache-control": "private, max-age=86400",
      "content-disposition": "inline",
    },
  });
});

// GET /api/attachments/*  → raw object from R2. Keys are owner-namespaced
// (emails/<owner>/…, attachments/<owner>/…, uploads/<owner>/…), so a caller may
// only read objects under their own prefix. Admins (owner=null) may read any.
attachments.get("/*", async (c) => {
  const fullKey = c.req.path.replace(/^\/api\/attachments\//, "");
  const { owner } = effectiveOwner(c);
  const allowed =
    owner === null
      ? ["attachments/", "emails/", "uploads/"].some((p) => fullKey.startsWith(p))
      : [`emails/${owner}/`, `attachments/${owner}/`, `uploads/${owner}/`].some((p) =>
          fullKey.startsWith(p),
        );
  if (!allowed) return c.json({ error: "forbidden" }, 403);

  const obj = await c.env.EMAIL_CACHE.get(fullKey);
  if (!obj) return c.json({ error: "not found" }, 404);

  const ext = fullKey.split(".").pop()?.toLowerCase();
  const isInline = INLINE_EXT.includes(ext ?? "");

  return new Response(obj.body, {
    headers: {
      "content-type": obj.httpMetadata?.contentType ?? "application/octet-stream",
      "content-length": String(obj.size),
      "cache-control": "private, max-age=3600",
      "content-disposition": isInline ? "inline" : "attachment",
    },
  });
});
