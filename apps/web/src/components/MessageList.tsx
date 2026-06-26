import { useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import type { UseQueryResult } from "@tanstack/react-query";
import type { MessageListItem } from "@email/shared";
import { Inbox } from "lucide-react";
import { MessageRow } from "@/components/MessageRow";

export function MessageList({ query }: { query: UseQueryResult<MessageListItem[]> }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeId = pathname.startsWith("/mail/") ? pathname.slice("/mail/".length) : null;

  if (query.isLoading) {
    return (
      <div className="space-y-1 p-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex gap-3 rounded-xl p-3">
            <div className="skeleton h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2 py-1">
              <div className="skeleton h-3 w-1/3 rounded" />
              <div className="skeleton h-3 w-2/3 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const items = query.data ?? [];

  if (items.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid h-full place-items-center p-8 text-center"
      >
        <div>
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-inset text-faint">
            <Inbox size={28} />
          </div>
          <p className="font-display text-lg font-medium">All clear</p>
          <p className="mt-1 text-sm text-muted">Nothing here right now.</p>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="scroll-thin h-full overflow-y-auto p-2">
      <AnimatePresence initial={false}>
        {items.map((m, i) => (
          <motion.div
            key={m.id}
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i * 0.015, 0.2) } }}
            exit={{ opacity: 0, height: 0, marginTop: 0, transition: { duration: 0.2 } }}
            transition={{ type: "spring", stiffness: 500, damping: 40 }}
          >
            <MessageRow message={m} active={activeId === m.id} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
