import { useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "@/api/client";
import { Button, Spinner } from "@/components/primitives";
import { Logomark } from "@/components/Logomark";

export function LoginPage() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.login(password);
      await qc.invalidateQueries();
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Login failed");
      setBusy(false);
    }
  }

  return (
    <div className="app-backdrop grid min-h-full place-items-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
        className="w-full max-w-sm"
      >
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-accent text-accent-fg shadow-[var(--shadow-md)]">
            <Logomark size={30} />
          </div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Driftmail</h1>
          <p className="mt-1.5 text-sm text-muted">Your private inbox, beautifully quiet.</p>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-border bg-surface/80 p-6 shadow-[var(--shadow-lg)] backdrop-blur"
        >
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted">
            Passphrase
          </label>
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••"
            className="mb-4 w-full rounded-[var(--radius-lg)] border border-border bg-bg px-4 py-3 text-fg outline-none transition focus:border-accent-ring focus:ring-4 focus:ring-accent-ring/20"
          />
          <Button type="submit" variant="primary" className="w-full" disabled={busy}>
            {busy ? <Spinner /> : "Enter inbox"}
          </Button>
        </form>
      </motion.div>
    </div>
  );
}
