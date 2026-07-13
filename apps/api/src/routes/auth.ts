import { Hono } from "hono";
import type { HonoEnv } from "../env";
import type { MeResponse } from "@email/shared";

export const auth = new Hono<HonoEnv>();

// Identity is established by the Clerk JWT gate in index.ts. Login/logout live in
// the Clerk-hosted UI on the frontend; this route only reports the current user.
auth.get("/me", (c) => {
  const body: MeResponse = {
    userId: c.get("userId"),
    email: c.get("email") ?? null,
    isAdmin: c.get("isAdmin"),
  };
  return c.json(body);
});
