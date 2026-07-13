import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { HonoEnv, Env } from "./env";
import { verifyClerkJwt } from "./clerk";
import { upsertUser } from "./db";
import { handleEmail } from "./email-handler";
import { runScheduled } from "./scheduled";
import { auth } from "./routes/auth";
import { admin } from "./routes/admin";
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
import { push } from "./routes/push";
import { ai } from "./routes/ai";

const app = new Hono<HonoEnv>();

// Auth gate: everything under /api except health requires a valid Clerk session JWT.
const PUBLIC_PATHS = new Set(["/api/health"]);

app.use("/api/*", async (c, next) => {
  if (PUBLIC_PATHS.has(c.req.path)) return next();

  const bearer = c.req.header("Authorization");
  const token =
    (bearer?.startsWith("Bearer ") ? bearer.slice(7) : null) ||
    getCookie(c, "__session");
  const claims = token ? await verifyClerkJwt(c.env, token) : null;
  if (!claims) return c.json({ error: "unauthorized" }, 401);

  c.set("userId", claims.userId);
  c.set("email", claims.email);
  c.set("isAdmin", claims.role === "admin");

  // Mirror the Clerk identity locally on first sight (best-effort).
  c.executionCtx.waitUntil(upsertUser(c.env.DB, claims.userId, claims.email));

  return next();
});

app.route("/api/auth", auth);
app.route("/api/admin", admin);
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
app.route("/api/push", push);
app.route("/api/ai", ai);
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
