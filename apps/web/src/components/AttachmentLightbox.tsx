import { useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { X, Download, ChevronLeft, ChevronRight } from "lucide-react";
import type { AttachmentRow } from "@email/shared";
import { formatBytes } from "@/lib/utils";

export function isPreviewable(a: AttachmentRow): boolean {
  const t = (a.mime_type ?? "").toLowerCase();
  if (t.startsWith("image/") || t === "application/pdf") return true;
  // fall back to extension when mime is generic/missing
  const ext = (a.filename ?? "").split(".").pop()?.toLowerCase();
  return ["png", "jpg", "jpeg", "gif", "webp", "pdf"].includes(ext ?? "");
}

function isPdf(a: AttachmentRow): boolean {
  return (
    (a.mime_type ?? "").toLowerCase() === "application/pdf" ||
    (a.filename ?? "").toLowerCase().endsWith(".pdf")
  );
}

export function AttachmentLightbox({
  items,
  index,
  onIndex,
  onClose,
}: {
  items: AttachmentRow[];
  index: number | null;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const open = index !== null;
  const a = open ? items[index] : null;
  const many = items.length > 1;

  const go = (dir: number) => {
    if (index === null) return;
    onIndex((index + dir + items.length) % items.length);
  };

  // arrow-key navigation
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index, items.length]);

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <AnimatePresence>
        {open && a && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm"
              />
            </Dialog.Overlay>
            <Dialog.Content asChild aria-describedby={undefined}>
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="fixed inset-0 z-[61] flex flex-col"
              >
                {/* top bar */}
                <div className="flex items-center gap-3 px-4 py-3 text-white">
                  <Dialog.Title className="min-w-0 flex-1 truncate text-sm font-medium">
                    {a.filename ?? "attachment"}
                  </Dialog.Title>
                  <span className="shrink-0 text-xs text-white/60">{formatBytes(a.size_bytes)}</span>
                  <a
                    href={`/api/attachments/${a.r2_key}`}
                    download={a.filename ?? true}
                    className="grid h-9 w-9 place-items-center rounded-lg text-white/80 transition hover:bg-white/10 hover:text-white"
                    aria-label="Download"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Download size={18} />
                  </a>
                  <Dialog.Close
                    className="grid h-9 w-9 place-items-center rounded-lg text-white/80 transition hover:bg-white/10 hover:text-white"
                    aria-label="Close"
                  >
                    <X size={20} />
                  </Dialog.Close>
                </div>

                {/* stage */}
                <div
                  className="relative flex min-h-0 flex-1 items-center justify-center p-3 md:p-8"
                  onClick={(e) => e.target === e.currentTarget && onClose()}
                >
                  {many && (
                    <button
                      onClick={() => go(-1)}
                      aria-label="Previous"
                      className="absolute left-2 z-10 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 md:left-5"
                    >
                      <ChevronLeft size={24} />
                    </button>
                  )}

                  {isPdf(a) ? (
                    <iframe
                      key={a.id}
                      title={a.filename ?? "PDF"}
                      src={`/api/attachments/${a.r2_key}`}
                      className="h-full w-full max-w-4xl rounded-lg bg-white"
                    />
                  ) : (
                    <motion.img
                      key={a.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      src={`/api/attachments/${a.r2_key}`}
                      alt={a.filename ?? "image"}
                      className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
                    />
                  )}

                  {many && (
                    <button
                      onClick={() => go(1)}
                      aria-label="Next"
                      className="absolute right-2 z-10 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 md:right-5"
                    >
                      <ChevronRight size={24} />
                    </button>
                  )}
                </div>

                {many && (
                  <div className="pb-4 text-center text-xs text-white/60">
                    {index! + 1} / {items.length}
                  </div>
                )}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
