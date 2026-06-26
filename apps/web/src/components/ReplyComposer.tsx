import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Send, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useReply, useCancelSend, useSettings } from "@/api/hooks";
import { Button, Spinner } from "@/components/primitives";
import { api, ApiError } from "@/api/client";

const UNDO_WINDOW = 8000;

export function ReplyComposer({
  messageId,
  to,
  subject,
  onClose,
}: {
  messageId: string;
  to: string;
  subject: string;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const reply = useReply();
  const cancelSend = useCancelSend();
  const settings = useSettings();
  const qc = useQueryClient();
  const disabled = settings.data && !settings.data.reply_enabled;

  useEffect(() => {
    ref.current?.focus();
  }, []);

  async function send() {
    if (!text.trim() || busy) return;
    setBusy(true);
    const replySubject = subject.startsWith("Re:") ? subject : `Re: ${subject}`;
    try {
      const res = await reply.mutateAsync({
        messageId,
        to,
        subject: replySubject,
        text,
        sendAfter: Date.now() + UNDO_WINDOW,
      });
      onClose();

      // Flush the send ourselves once the undo window passes — independent of any
      // cron. send-now claims the pending row atomically, so it can't double-send
      // with the legacy worker's cron. Undo clears the timer + cancels the row.
      const timer = setTimeout(async () => {
        try {
          await api.sendNow(res.id);
        } catch {
          /* cron may have already claimed it */
        }
        qc.invalidateQueries({ queryKey: ["messages"] });
        qc.invalidateQueries({ queryKey: ["message"] });
        qc.invalidateQueries({ queryKey: ["counts"] });
      }, UNDO_WINDOW);

      toast.success("Sending reply", {
        description: `To ${to}`,
        duration: UNDO_WINDOW,
        action: {
          label: "Undo",
          onClick: () => {
            clearTimeout(timer);
            cancelSend.mutate(res.id);
            toast.message("Reply cancelled");
          },
        },
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to send");
      setBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 34 }}
      className="overflow-hidden"
    >
      <div className="px-5 py-3 md:px-8">
        <div className="overflow-hidden rounded-2xl border border-border-strong bg-elevated shadow-[var(--shadow-sm)]">
          <div className="flex items-center justify-between border-b border-border px-4 py-2 text-xs text-muted">
            <span>
              Reply to <span className="font-mono text-fg">{to}</span>
            </span>
            <button onClick={onClose} className="text-faint hover:text-fg" aria-label="Close">
              <X size={15} />
            </button>
          </div>
          <textarea
            ref={ref}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send();
            }}
            placeholder={disabled ? "Replies are disabled in Settings" : "Write your reply…"}
            disabled={!!disabled}
            rows={4}
            className="w-full resize-none bg-transparent px-4 py-3 text-[14px] leading-relaxed outline-none placeholder:text-faint disabled:opacity-60"
          />
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-[11px] text-faint">⌘↵ to send · 8s undo</span>
            <Button variant="primary" size="sm" onClick={send} disabled={!text.trim() || busy || !!disabled}>
              {busy ? <Spinner /> : <Send size={15} />}
              Send
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
