import { motion } from "framer-motion";
import { Mail } from "lucide-react";

export function EmptyDetail() {
  return (
    <div className="hidden h-full place-items-center md:grid">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 24 }}
        className="max-w-xs px-8 text-center"
      >
        <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-3xl bg-inset text-faint">
          <Mail size={34} strokeWidth={1.5} />
        </div>
        <h2 className="font-display text-2xl font-semibold tracking-tight">No message open</h2>
        <p className="mt-2 text-sm text-muted text-balance">
          Pick a conversation from the list to read it here. Swipe a row left to archive.
        </p>
      </motion.div>
    </div>
  );
}
