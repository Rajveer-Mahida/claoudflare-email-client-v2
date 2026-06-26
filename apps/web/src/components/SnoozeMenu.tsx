import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { motion } from "framer-motion";
import { Sun, Sunrise, Coffee, CalendarDays, BellOff } from "lucide-react";

function atHour(daysAhead: number, hour: number): number {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

function nextWeekend(): number {
  const d = new Date();
  const day = d.getDay();
  const delta = (6 - day + 7) % 7 || 7; // upcoming Saturday
  return atHour(delta, 9);
}

export function SnoozeMenu({
  children,
  onPick,
  showUnsnooze,
}: {
  children: React.ReactNode;
  onPick: (until: number | null) => void;
  showUnsnooze?: boolean;
}) {
  const options = [
    { label: "Later today", icon: Coffee, value: () => Date.now() + 3 * 3600_000 },
    { label: "Tomorrow", icon: Sunrise, value: () => atHour(1, 8) },
    { label: "This weekend", icon: Sun, value: () => nextWeekend() },
    { label: "Next week", icon: CalendarDays, value: () => atHour(7, 8) },
  ];

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{children}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content asChild align="end" sideOffset={6}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.14 }}
            className="z-50 min-w-48 rounded-xl border border-border bg-elevated p-1.5 shadow-[var(--shadow-lg)]"
          >
            <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">
              Snooze until
            </div>
            {options.map((o) => (
              <DropdownMenu.Item
                key={o.label}
                onSelect={() => onPick(o.value())}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm outline-none data-[highlighted]:bg-inset"
              >
                <o.icon size={16} className="text-muted" />
                {o.label}
              </DropdownMenu.Item>
            ))}
            {showUnsnooze && (
              <DropdownMenu.Item
                onSelect={() => onPick(null)}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm outline-none data-[highlighted]:bg-inset"
              >
                <BellOff size={16} className="text-muted" />
                Unsnooze
              </DropdownMenu.Item>
            )}
          </motion.div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
