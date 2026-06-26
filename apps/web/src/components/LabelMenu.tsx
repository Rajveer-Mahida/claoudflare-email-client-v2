import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { motion } from "framer-motion";
import { Plus, Check } from "lucide-react";
import type { LabelRow } from "@email/shared";
import { useLabels, useApplyLabels, useRemoveLabel, useCreateLabel } from "@/api/hooks";
import { Button } from "@/components/primitives";

const SWATCHES = ["#b4632a", "#4f7a3a", "#2f6f8f", "#8a4f9e", "#b3431f", "#d99e2b"];

export function LabelMenu({
  children,
  messageId,
  applied,
}: {
  children: React.ReactNode;
  messageId: string;
  applied: LabelRow[];
}) {
  const labels = useLabels();
  const apply = useApplyLabels();
  const remove = useRemoveLabel();
  const create = useCreateLabel();
  const [name, setName] = useState("");
  const [color, setColor] = useState(SWATCHES[0]);

  const appliedIds = new Set(applied.map((l) => l.id));

  function toggle(l: LabelRow) {
    if (appliedIds.has(l.id)) remove.mutate({ messageId, labelId: l.id });
    else apply.mutate({ messageIds: [messageId], labelIds: [l.id] });
  }

  async function add() {
    if (!name.trim()) return;
    const label = await create.mutateAsync({ name: name.trim(), color });
    apply.mutate({ messageIds: [messageId], labelIds: [label.id] });
    setName("");
  }

  return (
    <Popover.Root>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content asChild align="end" sideOffset={6}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.14 }}
            className="z-50 w-64 rounded-xl border border-border bg-elevated p-2 shadow-[var(--shadow-lg)]"
          >
            <div className="px-1.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-faint">
              Label as
            </div>
            <div className="max-h-52 overflow-y-auto scroll-thin">
              {labels.data?.map((l) => (
                <button
                  key={l.id}
                  onClick={() => toggle(l)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-inset"
                >
                  <span className="h-3 w-3 rounded-sm" style={{ background: l.color }} />
                  <span className="flex-1 text-left">{l.name}</span>
                  {appliedIds.has(l.id) && <Check size={15} className="text-accent" />}
                </button>
              ))}
            </div>

            <div className="mt-2 border-t border-border pt-2">
              <div className="mb-2 flex gap-1.5 px-1">
                {SWATCHES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className="h-5 w-5 rounded-full ring-2 ring-offset-2 ring-offset-elevated transition"
                    style={{ background: c, boxShadow: color === c ? `0 0 0 2px ${c}` : "none" }}
                  />
                ))}
              </div>
              <div className="flex gap-1.5">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && add()}
                  placeholder="New label"
                  className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-bg px-2.5 text-sm outline-none focus:border-accent-ring"
                />
                <Button size="sm" variant="primary" onClick={add} disabled={!name.trim()}>
                  <Plus size={15} />
                </Button>
              </div>
            </div>
          </motion.div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
