import { useEffect, useRef, useState } from "react";
import { Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Search, X, CheckCheck, RefreshCw } from "lucide-react";
import { useUI } from "@/lib/store";
import { useMessages, useMarkAllRead, useLabels } from "@/api/hooks";
import { MessageList } from "@/components/MessageList";
import { BulkBar } from "@/components/BulkBar";
import { IconButton, Tip } from "@/components/primitives";
import { useShortcuts } from "@/lib/useShortcuts";
import { cn } from "@/lib/utils";

const VIEW_TITLE: Record<string, string> = {
  inbox: "Inbox",
  starred: "Starred",
  snoozed: "Snoozed",
  archived: "Archive",
  trash: "Trash",
  sent: "Sent",
};

export function MailLayout() {
  const { view, q, labelId, setFilter, selection } = useUI();
  const [draft, setDraft] = useState(q);
  const inputRef = useRef<HTMLInputElement>(null);
  const messages = useMessages(view, q, labelId);
  const markAllRead = useMarkAllRead();
  const labels = useLabels();

  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const hasDetail = pathname.startsWith("/mail/");

  useShortcuts({
    "/": () => inputRef.current?.focus(),
    "g i": () => { setFilter({ view: "inbox", labelId: null, q: "" }); navigate({ to: "/" }); },
    "g s": () => { setFilter({ view: "starred", labelId: null, q: "" }); navigate({ to: "/" }); },
    "g e": () => { setFilter({ view: "archived", labelId: null, q: "" }); navigate({ to: "/" }); },
    "g t": () => { setFilter({ view: "trash", labelId: null, q: "" }); navigate({ to: "/" }); },
    "g n": () => { setFilter({ view: "snoozed", labelId: null, q: "" }); navigate({ to: "/" }); },
  });

  // debounce search into the store filter
  useEffect(() => {
    const t = setTimeout(() => {
      if (draft !== q) setFilter({ q: draft });
    }, 220);
    return () => clearTimeout(t);
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => setDraft(q), [q]);

  const labelName = labelId ? labels.data?.find((l) => l.id === labelId)?.name : null;
  const title = labelName ?? VIEW_TITLE[view] ?? "Inbox";

  return (
    <div className="flex min-w-0 flex-1 overflow-hidden">
      {/* List pane */}
      <section
        className={cn(
          "flex w-full flex-col overflow-hidden border-border md:w-[clamp(340px,38%,460px)] md:border-r",
          hasDetail && "hidden md:flex",
        )}
      >
        {/* Header */}
        <header className="flex flex-col gap-3 border-b border-border px-4 pb-3 pt-4">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-xl font-semibold tracking-tight">{title}</h1>
            <div className="flex items-center gap-0.5">
              <Tip label="Mark all read">
                <IconButton
                  onClick={() => markAllRead.mutate({ view, labelId })}
                  aria-label="Mark all read"
                >
                  <CheckCheck size={18} />
                </IconButton>
              </Tip>
              <Tip label="Refresh">
                <IconButton onClick={() => messages.refetch()} aria-label="Refresh">
                  <RefreshCw size={17} className={messages.isFetching ? "animate-spin" : ""} />
                </IconButton>
              </Tip>
            </div>
          </div>

          <div className="group relative flex items-center">
            <Search
              size={16}
              className="pointer-events-none absolute left-3.5 text-faint transition-colors group-focus-within:text-accent"
            />
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Search mail"
              className="h-10 w-full rounded-full border border-border bg-bg pl-10 pr-9 text-sm outline-none transition focus:border-accent-ring focus:ring-4 focus:ring-accent-ring/15"
            />
            {draft && (
              <button
                onClick={() => {
                  setDraft("");
                  setFilter({ q: "" });
                  inputRef.current?.focus();
                }}
                className="absolute right-3 text-faint hover:text-fg"
                aria-label="Clear search"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </header>

        {/* Bulk action bar */}
        <BulkBar />

        {/* List */}
        <div className="relative min-h-0 flex-1">
          <motion.div
            key={`${view}-${labelId}-${q}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0"
          >
            <MessageList query={messages} />
          </motion.div>
        </div>

        <div className="border-t border-border px-4 py-2 text-center text-[11px] text-faint">
          {selection.size > 0
            ? `${selection.size} selected`
            : `${messages.data?.length ?? 0} conversations`}
        </div>
      </section>

      {/* Detail pane */}
      <section className={cn("min-w-0 flex-1 overflow-hidden", !hasDetail && "hidden md:block")}>
        <Outlet />
      </section>
    </div>
  );
}
