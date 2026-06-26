import { Hono } from "hono";
import type { HonoEnv } from "../env";
import { getAttachmentByCid } from "../db";

export const attachments = new Hono<HonoEnv>();

const ALLOWED_PREFIXES = ["attachments/", "emails/"];
const INLINE_EXT = ["png", "jpg", "jpeg", "gif", "webp", "pdf", "txt"];

// GET /api/attachments/cid?mid=&cid=  → inline image referenced by Content-ID
attachments.get("/cid", async (c) => {
  const mid = c.req.query("mid");
  const cid = c.req.query("cid");
  if (!mid || !cid) return c.json({ error: "mid and cid required" }, 400);

  const att = await getAttachmentByCid(c.env.DB, mid, decodeURIComponent(cid));
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

// GET /api/attachments/*  → raw object from R2 (attachments/ or emails/ only)
attachments.get("/*", async (c) => {
  const fullKey = c.req.path.replace(/^\/api\/attachments\//, "");
  if (!ALLOWED_PREFIXES.some((p) => fullKey.startsWith(p))) {
    return c.json({ error: "forbidden" }, 403);
  }

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
