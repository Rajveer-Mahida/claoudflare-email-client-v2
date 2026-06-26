import { useEffect } from "react";
import { Outlet, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { api, ApiError } from "@/api/client";
import { Sidebar } from "@/components/Sidebar";
import { Spinner } from "@/components/primitives";

export function AppShell() {
  const navigate = useNavigate();
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
      <main className="flex min-w-0 flex-1 overflow-hidden p-2 pl-0">
        <div className="flex min-w-0 flex-1 overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-md)]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
