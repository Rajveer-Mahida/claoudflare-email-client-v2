import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import type { UseInfiniteQueryResult, InfiniteData } from "@tanstack/react-query";
import type { MessageListItem } from "@email/shared";
import { Inbox } from "lucide-react";
import { MessageRow } from "@/components/MessageRow";
import { Spinner } from "@/components/primitives";

export function MessageList({
  query,
  focusedId,
}: {
  query: UseInfiniteQueryResult<InfiniteData<MessageListItem[]>>;
  focusedId?: string | null;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeId = pathname.startsWith("/mail/") ? pathname.slice("/mail/".length) : null;

  const { fetchNextPage, hasNextPage, isFetchingNextPage } = query;
  const sentinel = useRef<HTMLDivElement>(null);

  // Load more when the sentinel scrolls into view.
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

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

  const items = query.data?.pages.flat() ?? [];

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
        {items.map((m) => (
          <motion.div
            key={m.id}
            initial={false}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, height: 0, marginTop: 0, transition: { duration: 0.2 } }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          >
            <MessageRow message={m} active={activeId === m.id} focused={focusedId === m.id} />
          </motion.div>
        ))}
      </AnimatePresence>

      {/* infinite-scroll sentinel + loader */}
      <div ref={sentinel} className="h-8" />
      {isFetchingNextPage && (
        <div className="grid place-items-center py-3 text-muted">
          <Spinner className="text-accent" />
        </div>
      )}
    </div>
  );
}
