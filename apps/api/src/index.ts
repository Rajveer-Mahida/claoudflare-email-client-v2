import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { HonoEnv } from "./env";
import { verifySessionToken, cookieName } from "./auth";
import { auth } from "./routes/auth";
import { messages } from "./routes/messages";
import { labels, counts } from "./routes/labels";
import { settings } from "./routes/settings";
import { reply } from "./routes/reply";
import { attachments } from "./routes/attachments";

const app = new Hono<HonoEnv>();

// Auth gate: everything under /api except the login endpoint requires a valid session.
const PUBLIC_PATHS = new Set(["/api/auth/login"]);

app.use("/api/*", async (c, next) => {
  if (PUBLIC_PATHS.has(c.req.path)) return next();

  const token = getCookie(c, cookieName());
  if (token) {
    try {
      if (await verifySessionToken(c.env, token)) return next();
    } catch {
      // fall through to 401
    }
  }
  return c.json({ error: "unauthorized" }, 401);
});

app.route("/api/auth", auth);
app.route("/api/messages", messages);
app.route("/api/labels", labels);
app.route("/api/counts", counts);
app.route("/api/settings", settings);
app.route("/api/reply", reply);
app.route("/api/attachments", attachments);

app.get("/api/health", (c) => c.json({ ok: true }));

app.notFound((c) => c.json({ error: "not found" }, 404));

export default app;
