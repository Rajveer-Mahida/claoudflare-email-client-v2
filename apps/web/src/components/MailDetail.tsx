import { useState } from "react";
import { useParams, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowLeft,
  Archive,
  Trash2,
  Clock,
  Tag,
  Star,
  Mail,
  Reply as ReplyIcon,
  Paperclip,
  Download,
} from "lucide-react";
import type { MessageRow, AttachmentRow } from "@email/shared";
import { useMessage, useFlag, useMarkRead, useSnooze, useSoftDelete } from "@/api/hooks";
import { Avatar, IconButton, Tip, Spinner } from "@/components/primitives";
import { SnoozeMenu } from "@/components/SnoozeMenu";
import { LabelMenu } from "@/components/LabelMenu";
import { ReplyComposer } from "@/components/ReplyComposer";
import { useShortcuts } from "@/lib/useShortcuts";
import { renderEmailHtml } from "@/lib/sanitize";
import { formatFullDate, formatBytes, displayName } from "@/lib/utils";

export function MailDetail() {
  const { id } = useParams({ from: "/shell/mailLayout/mail/$id" });
  const navigate = useNavigate();
  const { data, isLoading, error } = useMessage(id);
  const flag = useFlag();
  const markRead = useMarkRead();
  const snooze = useSnooze();
  const del = useSoftDelete();
  const [replying, setReplying] = useState(false);

  function back() {
    navigate({ to: "/" });
  }

  useShortcuts({
    Escape: back,
    e: () => {
      if (!data) return;
      flag.mutate({ ids: [id], field: "is_archived", value: 1 });
      toast.success("Archived");
      back();
    },
    "#": () => {
      if (!data) return;
      del.mutate(id);
      toast.success("Moved to trash");
      back();
    },
    r: () => data && setReplying(true),
    s: () => data && flag.mutate({ ids: [id], field: "is_starred", value: data.message.is_starred ? 0 : 1 }),
  });

  if (isLoading) {
    return (
      <div className="grid h-full place-items-center">
        <Spinner className="text-accent" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="grid h-full place-items-center text-muted">
        <p>Message not found.</p>
      </div>
    );
  }

  const { message, thread, attachments, labels } = data;
  const last = thread[thread.length - 1] ?? message;
  const replyPeer = message.direction === "out" ? message.to_addr : message.from_addr;

  return (
    <motion.div
      key={id}
      initial={{ opacity: 0, x: 18 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 32 }}
      className="flex h-full flex-col"
    >
      {/* toolbar */}
      <header className="flex items-center gap-1 border-b border-border px-3 py-2.5">
        <IconButton className="md:hidden" onClick={back} aria-label="Back">
          <ArrowLeft size={18} />
        </IconButton>
        <Tip label="Archive">
          <IconButton
            onClick={() => {
              flag.mutate({ ids: [id], field: "is_archived", value: 1 });
              toast.success("Archived");
              back();
            }}
          >
            <Archive size={18} />
          </IconButton>
        </Tip>
        <Tip label="Trash">
          <IconButton
            onClick={() => {
              del.mutate(id);
              toast.success("Moved to trash");
              back();
            }}
          >
            <Trash2 size={18} />
          </IconButton>
        </Tip>
        <SnoozeMenu
          showUnsnooze={!!message.snooze_until}
          onPick={(until) => {
            snooze.mutate({ ids: [id], until });
            toast.success(until ? "Snoozed" : "Unsnoozed");
            if (until) back();
          }}
        >
          <Tip label="Snooze">
            <IconButton aria-label="Snooze">
              <Clock size={18} />
            </IconButton>
          </Tip>
        </SnoozeMenu>
        <LabelMenu messageId={id} applied={labels}>
          <IconButton aria-label="Label">
            <Tag size={18} />
          </IconButton>
        </LabelMenu>
        <Tip label="Mark unread">
          <IconButton
            onClick={() => {
              markRead.mutate({ id, read: false });
              toast.success("Marked unread");
              back();
            }}
          >
            <Mail size={18} />
          </IconButton>
        </Tip>

        <div className="ml-auto flex items-center gap-1">
          <IconButton
            active={!!message.is_starred}
            onClick={() => flag.mutate({ ids: [id], field: "is_starred", value: message.is_starred ? 0 : 1 })}
            aria-label="Star"
          >
            <Star size={18} className={message.is_starred ? "fill-star text-star" : ""} />
          </IconButton>
        </div>
      </header>

      {/* scroll body */}
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-5 py-6 md:px-8">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            {labels.map((l) => (
              <span
                key={l.id}
                className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{ background: `${l.color}22`, color: l.color }}
              >
                {l.name}
              </span>
            ))}
          </div>
          <h1 className="mb-5 font-display text-[1.7rem] font-semibold leading-tight tracking-tight text-balance">
            {message.subject || "(no subject)"}
          </h1>

          <div className="space-y-3">
            {thread.map((m, i) => (
              <ThreadMessage
                key={m.id}
                m={m}
                attachments={m.id === message.id ? attachments : []}
                defaultOpen={i === thread.length - 1}
              />
            ))}
          </div>
        </div>
      </div>

      {/* reply */}
      <div className="border-t border-border bg-surface">
        <AnimatePresence mode="wait">
          {replying ? (
            <ReplyComposer
              key="composer"
              messageId={message.id}
              to={replyPeer}
              subject={last.subject ?? message.subject ?? ""}
              onClose={() => setReplying(false)}
            />
          ) : (
            <motion.div
              key="cta"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-3 px-5 py-3 md:px-8"
            >
              <button
                onClick={() => setReplying(true)}
                className="flex flex-1 items-center gap-2.5 rounded-full border border-border bg-bg px-4 py-2.5 text-sm text-muted transition hover:border-accent-ring hover:text-fg"
              >
                <ReplyIcon size={16} />
                Reply to {displayName(message.from_name, replyPeer)}…
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function ThreadMessage({
  m,
  attachments,
  defaultOpen,
}: {
  m: MessageRow;
  attachments: AttachmentRow[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const outbound = m.direction === "out";
  const peer = outbound ? m.to_addr : m.from_addr;
  const html = renderEmailHtml(m.html, m.id);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-elevated">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        <Avatar name={m.from_name} email={peer} size={38} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">
              {outbound ? "You" : displayName(m.from_name, m.from_addr)}
            </span>
            {m.send_state === "pending" && (
              <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent">
                sending…
              </span>
            )}
            <span className="ml-auto shrink-0 text-[11px] text-faint">{formatFullDate(m.received_at)}</span>
          </div>
          <p className="truncate text-xs text-muted">
            {outbound ? `to ${m.to_addr}` : m.from_addr}
          </p>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="border-t border-border px-4 py-4">
              {html ? (
                <div className="email-html text-[14px]" dangerouslySetInnerHTML={{ __html: html }} />
              ) : (
                <pre className="whitespace-pre-wrap font-sans text-[14px] leading-relaxed">{m.text}</pre>
              )}

              {attachments.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
                  {attachments.map((a) => (
                    <AttachmentPill key={a.id} a={a} />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AttachmentPill({ a }: { a: AttachmentRow }) {
  return (
    <a
      href={`/api/attachments/${a.r2_key}`}
      target="_blank"
      rel="noreferrer"
      className="group flex items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2 transition hover:border-accent-ring"
    >
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-inset text-muted">
        <Paperclip size={16} />
      </span>
      <span className="min-w-0">
        <span className="block max-w-44 truncate text-[13px] font-medium">{a.filename ?? "attachment"}</span>
        <span className="text-[11px] text-faint">{formatBytes(a.size_bytes)}</span>
      </span>
      <Download size={15} className="ml-1 text-faint opacity-0 transition group-hover:opacity-100" />
    </a>
  );
}
