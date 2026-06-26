import { useState } from "react";
import * as Switch from "@radix-ui/react-switch";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { Filter, Plus, Trash2, Play, ArrowRight } from "lucide-react";
import type { RuleRow, RuleField, RuleOp, RuleAction } from "@email/shared";
import {
  useRules,
  useCreateRule,
  useUpdateRule,
  useDeleteRule,
  useRunRules,
  useLabels,
} from "@/api/hooks";
import { Button, IconButton, Spinner } from "@/components/primitives";

const OP_LABEL: Record<RuleOp, string> = {
  contains: "contains",
  equals: "is",
  startswith: "starts with",
  endswith: "ends with",
};

const FIELDS: RuleField[] = ["from", "to", "subject"];
const OPS: RuleOp[] = ["contains", "equals", "startswith", "endswith"];
const ACTIONS: RuleAction[] = ["label", "archive", "read", "trash"];
const ACTION_LABEL: Record<RuleAction, string> = {
  label: "Apply label",
  archive: "Archive",
  read: "Mark read",
  trash: "Move to trash",
};

export function RulesManager() {
  const rules = useRules();
  const labels = useLabels();
  const create = useCreateRule();
  const update = useUpdateRule();
  const del = useDeleteRule();
  const run = useRunRules();

  const [field, setField] = useState<RuleField>("from");
  const [op, setOp] = useState<RuleOp>("contains");
  const [value, setValue] = useState("");
  const [action, setAction] = useState<RuleAction>("label");
  const [labelId, setLabelId] = useState("");

  const labelName = (id: string | null) => labels.data?.find((l) => l.id === id)?.name ?? "label";

  async function add() {
    if (!value.trim()) return toast.error("Enter a value to match");
    if (action === "label" && !labelId) return toast.error("Pick a label");
    try {
      await create.mutateAsync({
        field,
        op,
        value: value.trim(),
        action,
        action_value: action === "label" ? labelId : null,
      });
      setValue("");
      toast.success("Rule added");
    } catch {
      toast.error("Could not add rule");
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border bg-elevated p-5"
    >
      <div className="mb-4 flex items-start gap-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-inset text-muted">
          <Filter size={18} />
        </span>
        <div className="flex-1">
          <h3 className="font-medium">Filters</h3>
          <p className="text-sm text-muted">Automatically label, archive, read, or trash incoming mail.</p>
        </div>
        <Button
          variant="soft"
          size="sm"
          onClick={() =>
            run.mutate(undefined, {
              onSuccess: (r) => toast.success(`Applied to ${r.touched} messages`),
            })
          }
          disabled={run.isPending}
        >
          {run.isPending ? <Spinner /> : <Play size={14} />} Run on existing
        </Button>
      </div>

      {/* existing rules */}
      <div className="space-y-2">
        <AnimatePresence initial={false}>
          {rules.data?.map((r) => (
            <RuleRowView key={r.id} r={r} labelName={labelName} update={update} del={del} />
          ))}
        </AnimatePresence>
        {rules.data?.length === 0 && (
          <p className="py-2 text-sm text-faint">No filters yet.</p>
        )}
      </div>

      {/* add rule */}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4 text-sm">
        <span className="text-muted">If</span>
        <select
          value={field}
          onChange={(e) => setField(e.target.value as RuleField)}
          className="rounded-lg border border-border bg-bg px-2 py-1.5 outline-none"
        >
          {FIELDS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <select
          value={op}
          onChange={(e) => setOp(e.target.value as RuleOp)}
          className="rounded-lg border border-border bg-bg px-2 py-1.5 outline-none"
        >
          {OPS.map((o) => (
            <option key={o} value={o}>
              {OP_LABEL[o]}
            </option>
          ))}
        </select>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="value"
          className="min-w-32 flex-1 rounded-lg border border-border bg-bg px-2.5 py-1.5 outline-none focus:border-accent-ring"
        />
        <ArrowRight size={15} className="text-faint" />
        <select
          value={action}
          onChange={(e) => setAction(e.target.value as RuleAction)}
          className="rounded-lg border border-border bg-bg px-2 py-1.5 outline-none"
        >
          {ACTIONS.map((a) => (
            <option key={a} value={a}>
              {ACTION_LABEL[a]}
            </option>
          ))}
        </select>
        {action === "label" && (
          <select
            value={labelId}
            onChange={(e) => setLabelId(e.target.value)}
            className="rounded-lg border border-border bg-bg px-2 py-1.5 outline-none"
          >
            <option value="">— label —</option>
            {labels.data?.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        )}
        <Button variant="primary" size="sm" onClick={add} disabled={create.isPending}>
          <Plus size={15} /> Add
        </Button>
      </div>
    </motion.div>
  );
}

function RuleRowView({
  r,
  labelName,
  update,
  del,
}: {
  r: RuleRow;
  labelName: (id: string | null) => string;
  update: ReturnType<typeof useUpdateRule>;
  del: ReturnType<typeof useDeleteRule>;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2 text-sm"
    >
      <Switch.Root
        checked={r.enabled === 1}
        onCheckedChange={(v) => update.mutate({ id: r.id, enabled: v })}
        className="relative h-5 w-9 shrink-0 rounded-full bg-border-strong transition-colors data-[state=checked]:bg-success"
      >
        <Switch.Thumb className="block h-3.5 w-3.5 translate-x-1 rounded-full bg-white transition-transform data-[state=checked]:translate-x-[1.15rem]" />
      </Switch.Root>
      <span className={r.enabled ? "" : "opacity-50"}>
        <span className="text-muted">If </span>
        <span className="font-medium">{r.field}</span>{" "}
        <span className="text-muted">{OP_LABEL[r.op]}</span>{" "}
        <span className="font-mono text-[13px]">"{r.value}"</span>
        <ArrowRight size={13} className="mx-1.5 inline text-faint" />
        <span className="font-medium">
          {ACTION_LABEL[r.action]}
          {r.action === "label" ? ` "${labelName(r.action_value)}"` : ""}
        </span>
      </span>
      <IconButton className="ml-auto" onClick={() => del.mutate(r.id)} aria-label="Delete rule">
        <Trash2 size={15} />
      </IconButton>
    </motion.div>
  );
}
