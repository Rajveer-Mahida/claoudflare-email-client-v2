import { useEffect } from "react";
import { Outlet, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { api, ApiError } from "@/api/client";
import { AnimatePresence } from "framer-motion";
import { Sidebar } from "@/components/Sidebar";
import { Compose } from "@/components/Compose";
import { CommandPalette } from "@/components/CommandPalette";
import { KeyboardHelp } from "@/components/KeyboardHelp";
import { Spinner } from "@/components/primitives";
import { useUI } from "@/lib/store";
import { useShortcuts } from "@/lib/useShortcuts";

export function AppShell() {
  const navigate = useNavigate();
  const composeOpen = useUI((s) => s.composeOpen);
  const { openCompose, setPalette, setHelp } = useUI();

  // ⌘K / Ctrl-K toggles the command palette (works even from inputs).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette(!useUI.getState().paletteOpen);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPalette]);

  useShortcuts({
    c: () => openCompose(),
    "?": () => setHelp(true),
  });

  const { isLoading, error } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: api.me,
    retry: false,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) {
      navigate({ to: "/login" });
    }
  }, [error, navigate]);

  if (isLoading) {
    return (
      <div className="app-backdrop grid h-full place-items-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-3 text-muted"
        >
          <Spinner className="text-accent" />
          <span className="text-sm">Opening your inbox…</span>
        </motion.div>
      </div>
    );
  }

  if (error) return null; // redirecting

  return (
    <div className="app-backdrop flex h-full overflow-hidden">
      <Sidebar />
      <main className="flex min-w-0 flex-1 overflow-hidden md:p-2 md:pl-0">
        <div className="flex min-w-0 flex-1 overflow-hidden bg-surface md:rounded-2xl md:border md:border-border md:shadow-[var(--shadow-md)]">
          <Outlet />
        </div>
      </main>
      <AnimatePresence>{composeOpen && <Compose />}</AnimatePresence>
      <CommandPalette />
      <KeyboardHelp />
    </div>
  );
}
