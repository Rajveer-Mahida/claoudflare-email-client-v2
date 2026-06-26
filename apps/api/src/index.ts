import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { HonoEnv, Env } from "./env";
import { verifySessionToken, cookieName } from "./auth";
import { handleEmail } from "./email-handler";
import { runScheduled } from "./scheduled";
import { auth } from "./routes/auth";
import { messages } from "./routes/messages";
import { labels, counts } from "./routes/labels";
import { settings } from "./routes/settings";
import { reply } from "./routes/reply";
import { attachments } from "./routes/attachments";
import { compose } from "./routes/compose";
import { uploads } from "./routes/uploads";
import { drafts } from "./routes/drafts";
import { aliases } from "./routes/aliases";
import { rules } from "./routes/rules";

const app = new Hono<HonoEnv>();

// Auth gate: everything under /api except the login endpoint requires a valid session.
const PUBLIC_PATHS = new Set(["/api/auth/login", "/api/health"]);

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
app.route("/api/send", compose);
app.route("/api/uploads", uploads);
app.route("/api/drafts", drafts);
app.route("/api/aliases", aliases);
app.route("/api/rules", rules);
app.route("/api/attachments", attachments);

app.get("/api/health", (c) => c.json({ ok: true }));

app.notFound((c) => c.json({ error: "not found" }, 404));

// Single worker: HTTP (SPA + API) via Hono, plus inbound email + undo-send cron.
export default {
  fetch: app.fetch,
  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext) {
    await handleEmail(message, env, ctx);
  },
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduled(env));
  },
};
