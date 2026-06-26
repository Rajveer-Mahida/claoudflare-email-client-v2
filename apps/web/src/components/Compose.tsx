import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X, Paperclip, Send, Clock, Trash2, ChevronDown } from "lucide-react";
import type { UploadedAttachment } from "@email/shared";
import { useUI } from "@/lib/store";
import { useSend, useDeleteDraft, useSettings } from "@/api/hooks";
import { api, ApiError } from "@/api/client";
import { Button, IconButton, Spinner } from "@/components/primitives";
import { cn, formatBytes } from "@/lib/utils";

const UNDO_WINDOW = 8000;

function splitAddrs(s: string): string[] {
  return s.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
}

// Lightweight chip recipient field.
function Recipients({
  label,
  value,
  onChange,
  autoFocus,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  autoFocus?: boolean;
}) {
  const [draft, setDraft] = useState("");
  function commit() {
    const toks = splitAddrs(draft);
    if (toks.length) onChange([...value, ...toks]);
    setDraft("");
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-2">
      <span className="text-xs font-medium text-faint">{label}</span>
      {value.map((addr, i) => (
        <span
          key={`${addr}-${i}`}
          className="flex items-center gap-1 rounded-full bg-inset px-2 py-0.5 text-xs"
        >
          {addr}
          <button onClick={() => onChange(value.filter((_, j) => j !== i))} className="text-faint hover:text-danger">
            <X size={12} />
          </button>
        </span>
      ))}
      <input
        autoFocus={autoFocus}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={commit}
        className="min-w-[8ch] flex-1 bg-transparent text-sm outline-none"
      />
    </div>
  );
}

export function Compose() {
  const { composeInit, closeCompose } = useUI();
  const qc = useQueryClient();
  const send = useSend();
  const delDraft = useDeleteDraft();
  const settings = useSettings();

  const [from, setFrom] = useState(composeInit?.from ?? "");
  const [to, setTo] = useState<string[]>(composeInit?.to ?? []);
  const [cc, setCc] = useState<string[]>(composeInit?.cc ?? []);
  const [bcc, setBcc] = useState<string[]>(composeInit?.bcc ?? []);
  const [showCc, setShowCc] = useState((composeInit?.cc?.length ?? 0) > 0 || (composeInit?.bcc?.length ?? 0) > 0);
  const [subject, setSubject] = useState(composeInit?.subject ?? "");
  const [text, setText] = useState(composeInit?.text ?? "");
  const [attachments, setAttachments] = useState<UploadedAttachment[]>(composeInit?.attachments ?? []);
  const [uploading, setUploading] = useState(0);
  const [scheduleAt, setScheduleAt] = useState("");
  const [showSchedule, setShowSchedule] = useState(false);
  const [busy, setBusy] = useState(false);

  const draftId = useRef(composeInit?.draftId);
  const sigApplied = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const inReplyTo = composeInit?.inReplyToMessageId;

  // Append signature once, for a fresh blank compose (not reply/forward/draft).
  useEffect(() => {
    if (sigApplied.current) return;
    const sig = settings.data?.signature;
    if (sig && !composeInit?.text && !composeInit?.draftId && !inReplyTo && !text) {
      sigApplied.current = true;
      setText(`\n\n-- \n${sig}`);
    }
  }, [settings.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced autosave to the drafts table.
  useEffect(() => {
    if (!to.length && !subject && !text) return;
    const t = setTimeout(async () => {
      try {
        const row = await api.saveDraft({
          id: draftId.current,
          to_addr: to.join(", "),
          cc: cc.join(", ") || null,
          bcc: bcc.join(", ") || null,
          subject: subject || null,
          text: text || null,
          in_reply_to_id: inReplyTo ?? null,
          attachments: attachments.length ? JSON.stringify(attachments) : null,
        });
        draftId.current = row.id;
        qc.invalidateQueries({ queryKey: ["drafts"] });
        qc.invalidateQueries({ queryKey: ["counts"] });
      } catch {
        /* ignore autosave errors */
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [to, cc, bcc, subject, text, attachments]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading((n) => n + files.length);
    for (const f of Array.from(files)) {
      try {
        const up = await api.uploadFile(f);
        setAttachments((a) => [...a, up]);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : `Upload failed: ${f.name}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  async function doSend() {
    if (!to.length) return toast.error("Add a recipient");
    if (!subject.trim()) return toast.error("Add a subject");
    setBusy(true);
    const sendAfter = showSchedule && scheduleAt ? new Date(scheduleAt).getTime() : Date.now() + UNDO_WINDOW;
    try {
      const res = await send.mutateAsync({
        from: from.trim() || undefined,
        to,
        cc: cc.length ? cc : undefined,
        bcc: bcc.length ? bcc : undefined,
        subject,
        text,
        inReplyToMessageId: inReplyTo,
        attachments,
        sendAfter,
        draftId: draftId.current,
      });
      closeCompose();
      if (showSchedule && scheduleAt) {
        toast.success("Scheduled to send", { description: to.join(", ") });
        return;
      }
      // Flush after the undo window (cron-independent, snappy). Undo cancels.
      const timer = setTimeout(async () => {
        try {
          await api.sendNow(res.id);
        } catch (err) {
          toast.error(err instanceof ApiError ? `Send failed: ${err.message}` : "Send failed");
        }
        qc.invalidateQueries({ queryKey: ["messages"] });
        qc.invalidateQueries({ queryKey: ["message"] });
        qc.invalidateQueries({ queryKey: ["counts"] });
      }, UNDO_WINDOW);
      toast.success("Sending message", {
        description: to.join(", "),
        duration: UNDO_WINDOW,
        action: {
          label: "Undo",
          onClick: () => {
            clearTimeout(timer);
            api.cancelSend(res.id).catch(() => {});
            toast.message("Message cancelled");
          },
        },
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Send failed");
      setBusy(false);
    }
  }

  async function discard() {
    if (draftId.current) delDraft.mutate(draftId.current);
    closeCompose();
  }

  return (
    <motion.div
      initial={{ y: 40, opacity: 0, scale: 0.98 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: 40, opacity: 0, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="fixed inset-x-2 bottom-2 z-50 mx-auto flex max-h-[88vh] w-auto max-w-2xl flex-col overflow-hidden rounded-2xl border border-border-strong bg-elevated shadow-[var(--shadow-lg)] md:inset-x-auto md:right-4 md:bottom-4 md:w-[min(40rem,calc(100vw-2rem))]"
    >
      <div className="flex items-center justify-between bg-inset px-4 py-2.5">
        <span className="text-sm font-semibold">{inReplyTo ? "Reply" : "New message"}</span>
        <IconButton onClick={closeCompose} aria-label="Close">
          <X size={16} />
        </IconButton>
      </div>

      <Recipients label="From" value={from ? [from] : []} onChange={(v) => setFrom(v[v.length - 1] ?? "")} />
      <div className="relative">
        <Recipients label="To" value={to} onChange={setTo} autoFocus={!to.length} />
        {!showCc && (
          <button
            onClick={() => setShowCc(true)}
            className="absolute right-3 top-2 text-xs text-faint hover:text-fg"
          >
            Cc/Bcc
          </button>
        )}
      </div>
      {showCc && (
        <>
          <Recipients label="Cc" value={cc} onChange={setCc} />
          <Recipients label="Bcc" value={bcc} onChange={setBcc} />
        </>
      )}

      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Subject"
        className="border-b border-border bg-transparent px-3 py-2.5 text-sm font-medium outline-none"
      />

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write your message…"
        className="min-h-40 flex-1 resize-none bg-transparent px-3 py-3 text-[14px] leading-relaxed outline-none"
      />

      {(attachments.length > 0 || uploading > 0) && (
        <div className="flex flex-wrap gap-2 border-t border-border px-3 py-2">
          {attachments.map((a, i) => (
            <span key={a.key} className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs">
              <Paperclip size={13} className="text-faint" />
              <span className="max-w-40 truncate">{a.filename}</span>
              <span className="text-faint">{formatBytes(a.size_bytes)}</span>
              <button onClick={() => setAttachments((p) => p.filter((_, j) => j !== i))} className="text-faint hover:text-danger">
                <X size={13} />
              </button>
            </span>
          ))}
          {uploading > 0 && (
            <span className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted">
              <Spinner className="h-3 w-3" /> uploading {uploading}…
            </span>
          )}
        </div>
      )}

      {showSchedule && (
        <div className="flex items-center gap-2 border-t border-border px-3 py-2 text-sm">
          <Clock size={15} className="text-muted" />
          <input
            type="datetime-local"
            value={scheduleAt}
            onChange={(e) => setScheduleAt(e.target.value)}
            className="rounded-lg border border-border bg-bg px-2 py-1 text-sm outline-none"
          />
          <button onClick={() => { setShowSchedule(false); setScheduleAt(""); }} className="text-xs text-faint hover:text-fg">
            cancel
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-border px-3 py-2.5">
        <Button variant="primary" size="sm" onClick={doSend} disabled={busy || uploading > 0}>
          {busy ? <Spinner /> : <Send size={15} />}
          {showSchedule && scheduleAt ? "Schedule" : "Send"}
        </Button>
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => onFiles(e.target.files)} />
        <IconButton onClick={() => fileRef.current?.click()} aria-label="Attach">
          <Paperclip size={17} />
        </IconButton>
        <IconButton
          active={showSchedule}
          onClick={() => setShowSchedule((s) => !s)}
          aria-label="Schedule send"
        >
          <Clock size={17} />
        </IconButton>
        <button
          onClick={() => setShowCc((s) => !s)}
          className={cn("ml-1 hidden items-center gap-0.5 text-xs text-faint hover:text-fg sm:flex", showCc && "text-fg")}
        >
          Cc/Bcc <ChevronDown size={12} />
        </button>
        <IconButton className="ml-auto" onClick={discard} aria-label="Discard">
          <Trash2 size={17} />
        </IconButton>
      </div>
    </motion.div>
  );
}
