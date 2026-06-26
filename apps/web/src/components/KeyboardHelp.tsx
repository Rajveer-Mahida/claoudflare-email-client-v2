import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useUI } from "@/lib/store";

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: "General",
    items: [
      ["⌘ K", "Command palette"],
      ["/", "Search"],
      ["c", "Compose"],
      ["?", "Keyboard shortcuts"],
    ],
  },
  {
    title: "Navigate",
    items: [
      ["g i", "Go to Inbox"],
      ["g s", "Starred"],
      ["g n", "Snoozed"],
      ["g e", "Archive"],
      ["g t", "Trash"],
      ["j / k", "Move down / up"],
      ["Enter", "Open message"],
    ],
  },
  {
    title: "In a message",
    items: [
      ["r", "Reply"],
      ["e", "Archive"],
      ["s", "Star"],
      ["#", "Trash"],
      ["Esc", "Back to list"],
    ],
  },
];

function Keycap({ k }: { k: string }) {
  return (
    <span className="inline-flex min-w-6 items-center justify-center rounded-md border border-border bg-inset px-1.5 py-0.5 font-mono text-[11px] text-fg">
      {k}
    </span>
  );
}

export function KeyboardHelp() {
  const { helpOpen, setHelp } = useUI();
  return (
    <Dialog.Root open={helpOpen} onOpenChange={setHelp}>
      <AnimatePresence>
        {helpOpen && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-[2px]"
              />
            </Dialog.Overlay>
            <Dialog.Content asChild>
              <motion.div
                initial={{ opacity: 0, y: -10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.98 }}
                transition={{ type: "spring", stiffness: 300, damping: 28 }}
                className="fixed left-1/2 top-1/2 z-[61] w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-border-strong bg-elevated p-6 shadow-[var(--shadow-lg)]"
              >
                <div className="mb-4 flex items-center justify-between">
                  <Dialog.Title className="font-display text-xl font-semibold tracking-tight">
                    Keyboard shortcuts
                  </Dialog.Title>
                  <Dialog.Close className="grid h-8 w-8 place-items-center rounded-full text-faint hover:bg-inset hover:text-fg">
                    <X size={16} />
                  </Dialog.Close>
                </div>
                <div className="grid gap-6 sm:grid-cols-3">
                  {GROUPS.map((g) => (
                    <div key={g.title}>
                      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-faint">
                        {g.title}
                      </h3>
                      <ul className="space-y-1.5">
                        {g.items.map(([k, label]) => (
                          <li key={label} className="flex items-center justify-between gap-2 text-sm">
                            <span className="text-muted">{label}</span>
                            <Keycap k={k} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
