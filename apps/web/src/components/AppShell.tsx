import { useEffect } from "react";
import { Outlet } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useClerk } from "@clerk/clerk-react";
import { motion } from "framer-motion";
import { api, ApiError, setActingOwner } from "@/api/client";
import { AnimatePresence } from "framer-motion";
import { Sidebar } from "@/components/Sidebar";
import { Compose } from "@/components/Compose";
import { CommandPalette } from "@/components/CommandPalette";
import { KeyboardHelp } from "@/components/KeyboardHelp";
import { Spinner } from "@/components/primitives";
import { useUI } from "@/lib/store";
import { useShortcuts } from "@/lib/useShortcuts";

export function AppShell() {
  const { signOut } = useClerk();
  const qc = useQueryClient();
  const composeOpen = useUI((s) => s.composeOpen);
  const actingAs = useUI((s) => s.actingAs);
  const setActingAs = useUI((s) => s.setActingAs);
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
    // Token expired or revoked → return to the Clerk sign-in gate.
    if (error instanceof ApiError && error.status === 401) {
      void signOut();
    }
  }, [error, signOut]);

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
    <div className="app-backdrop flex h-full flex-col overflow-hidden">
      {actingAs && (
        <div className="flex items-center justify-center gap-3 bg-accent px-4 py-1.5 text-xs font-medium text-accent-fg">
          <span>
            Viewing {actingAs.email ?? actingAs.id}&apos;s mailbox (admin)
          </span>
          <button
            onClick={() => {
              setActingOwner(null);
              setActingAs(null);
              void qc.invalidateQueries();
            }}
            className="rounded bg-black/15 px-2 py-0.5 font-semibold hover:bg-black/25"
          >
            Stop
          </button>
        </div>
      )}
      <div className="flex min-h-0 flex-1 overflow-hidden">
      <Sidebar />
      <main className="flex min-w-0 flex-1 overflow-hidden md:p-2 md:pl-0">
        <div className="flex min-w-0 flex-1 overflow-hidden bg-surface md:rounded-2xl md:border md:border-border md:shadow-[var(--shadow-md)]">
          <Outlet />
        </div>
      </main>
      </div>
      <AnimatePresence>{composeOpen && <Compose />}</AnimatePresence>
      <CommandPalette />
      <KeyboardHelp />
    </div>
  );
}
