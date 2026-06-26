import { useNavigate, useRouterState } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Inbox,
  Star,
  Clock,
  Archive,
  Send,
  Trash2,
  Settings,
  Sparkles,
  PenLine,
  FileText,
  Sun,
  Moon,
  Tag,
  PanelLeftClose,
  PanelLeft,
  LogOut,
  X,
} from "lucide-react";
import type { ViewName } from "@email/shared";
import { useUI } from "@/lib/store";
import { useCounts, useSettings } from "@/api/hooks";
import { api } from "@/api/client";
import { randomAlias } from "@/lib/alias";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { Logomark } from "@/components/Logomark";
import { cn } from "@/lib/utils";
import { IconButton, Tip } from "@/components/primitives";

const VIEW_META: { view: ViewName; label: string; icon: typeof Inbox; countKey: keyof CountShape }[] = [
  { view: "inbox", label: "Inbox", icon: Inbox, countKey: "inbox" },
  { view: "starred", label: "Starred", icon: Star, countKey: "starred" },
  { view: "snoozed", label: "Snoozed", icon: Clock, countKey: "snoozed" },
  { view: "sent", label: "Sent", icon: Send, countKey: "sent" },
  { view: "archived", label: "Archive", icon: Archive, countKey: "archived" },
  { view: "trash", label: "Trash", icon: Trash2, countKey: "trash" },
];

type CountShape = {
  inbox: number;
  unread: number;
  starred: number;
  snoozed: number;
  archived: number;
  trash: number;
  sent: number;
};

export function Sidebar() {
  const navigate = useNavigate();
  const {
    view,
    labelId,
    setFilter,
    theme,
    toggleTheme,
    sidebarCollapsed,
    toggleSidebar,
    mobileNavOpen,
    setMobileNav,
    openCompose,
  } = useUI();
  const counts = useCounts();
  const settings = useSettings();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const onSettings = pathname === "/settings";

  // Collapse only applies on desktop; the mobile drawer is always full-width.
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const collapsed = sidebarCollapsed && isDesktop;

  function go(v: ViewName) {
    setFilter({ view: v, labelId: null, q: "" });
    navigate({ to: "/" });
  }

  function goLabel(id: string) {
    setFilter({ labelId: id, q: "" });
    navigate({ to: "/" });
  }

  async function genAlias() {
    const domain = settings.data?.primary_alias_domain ?? "rajveer.space";
    const alias = randomAlias(domain);
    try {
      await navigator.clipboard.writeText(alias);
      toast.success("Alias copied", { description: alias });
    } catch {
      toast.message(alias);
    }
  }

  async function logout() {
    await api.logout();
    navigate({ to: "/login" });
  }

  return (
    <>
      {/* Mobile scrim */}
      <AnimatePresence>
        {mobileNavOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileNav(false)}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] md:hidden"
          />
        )}
      </AnimatePresence>

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col gap-1 bg-bg p-3 pr-2 shadow-[var(--shadow-lg)]",
          "transition-transform duration-300 ease-out",
          "md:static md:z-auto md:w-auto md:translate-x-0 md:shadow-none md:transition-[width]",
          mobileNavOpen ? "translate-x-0" : "-translate-x-full",
          sidebarCollapsed ? "md:w-[76px]" : "md:w-[264px]",
        )}
      >
      {/* Brand + collapse */}
      <div className="flex items-center justify-between px-2 pb-2 pt-1">
        <AnimatePresence mode="wait">
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              className="flex items-center gap-2.5"
            >
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-accent-fg">
                <Logomark size={18} />
              </div>
              <span className="font-display text-lg font-semibold tracking-tight">Driftmail</span>
            </motion.div>
          )}
        </AnimatePresence>
        <IconButton className="md:hidden" onClick={() => setMobileNav(false)} aria-label="Close menu">
          <X size={18} />
        </IconButton>
        <IconButton className="hidden md:inline-grid" onClick={toggleSidebar} aria-label="Toggle sidebar">
          {collapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
        </IconButton>
      </div>

      {/* Compose */}
      <button
        onClick={() => {
          setMobileNav(false);
          openCompose();
        }}
        className={cn(
          "group flex items-center gap-3 rounded-[var(--radius-lg)] bg-accent px-3 py-2.5 font-medium text-accent-fg shadow-[var(--shadow-sm)] transition-all duration-150 hover:bg-accent-hover active:scale-[0.98]",
          collapsed && "justify-center px-0",
        )}
      >
        <PenLine size={18} className="transition-transform group-hover:rotate-[-8deg]" />
        {!collapsed && <span className="text-sm">Compose</span>}
      </button>

      {/* New alias */}
      <button
        onClick={genAlias}
        className={cn(
          "group mb-1 flex items-center gap-3 rounded-[var(--radius-lg)] border border-border px-3 py-2 font-medium text-muted transition-all duration-150 hover:border-accent-ring hover:text-fg active:scale-[0.98]",
          collapsed && "justify-center px-0",
        )}
      >
        <Sparkles size={17} className="transition-transform group-hover:rotate-12" />
        {!collapsed && <span className="text-[13px]">New alias</span>}
      </button>

      {/* Views */}
      <nav className="flex flex-col gap-0.5">
        {VIEW_META.map(({ view: v, label, icon: Icon, countKey }) => {
          const active = !onSettings && !labelId && view === v;
          const n = counts.data?.views[countKey] ?? 0;
          const unread = v === "inbox" ? (counts.data?.views.unread ?? 0) : 0;
          return (
            <SideItem
              key={v}
              active={active}
              collapsed={collapsed}
              icon={<Icon size={18} />}
              label={label}
              badge={v === "inbox" ? unread : n}
              emphasize={v === "inbox" && unread > 0}
              onClick={() => go(v)}
            />
          );
        })}
        <SideItem
          active={pathname === "/drafts"}
          collapsed={collapsed}
          icon={<FileText size={18} />}
          label="Drafts"
          badge={counts.data?.drafts ?? 0}
          onClick={() => {
            setMobileNav(false);
            navigate({ to: "/drafts" });
          }}
        />
      </nav>

      {/* Labels */}
      {!collapsed && (counts.data?.labels.length ?? 0) > 0 && (
        <div className="mt-3">
          <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-faint">
            Labels
          </div>
          <nav className="flex flex-col gap-0.5">
            {counts.data!.labels.map((l) => (
              <SideItem
                key={l.id}
                active={labelId === l.id}
                collapsed={false}
                icon={<Tag size={16} style={{ color: l.color }} />}
                label={l.name}
                badge={l.count}
                onClick={() => goLabel(l.id)}
              />
            ))}
          </nav>
        </div>
      )}

      {/* Footer */}
      <div className="mt-auto flex flex-col gap-0.5 pt-3">
        <SideItem
          active={onSettings}
          collapsed={collapsed}
          icon={<Settings size={18} />}
          label="Settings"
          onClick={() => {
            setMobileNav(false);
            navigate({ to: "/settings" });
          }}
        />
        <div className={cn("flex items-center gap-1", collapsed ? "flex-col" : "justify-between px-1")}>
          <Tip label={theme === "dark" ? "Light mode" : "Dark mode"}>
            <IconButton onClick={toggleTheme} aria-label="Toggle theme">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={theme}
                  initial={{ opacity: 0, rotate: -45, scale: 0.6 }}
                  animate={{ opacity: 1, rotate: 0, scale: 1 }}
                  exit={{ opacity: 0, rotate: 45, scale: 0.6 }}
                  transition={{ duration: 0.18 }}
                >
                  {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
                </motion.span>
              </AnimatePresence>
            </IconButton>
          </Tip>
          <Tip label="Sign out">
            <IconButton onClick={logout} aria-label="Sign out">
              <LogOut size={18} />
            </IconButton>
          </Tip>
        </div>
      </div>
      </aside>
    </>
  );
}

function SideItem({
  active,
  collapsed,
  icon,
  label,
  badge,
  emphasize,
  onClick,
}: {
  active: boolean;
  collapsed: boolean;
  icon: React.ReactNode;
  label: string;
  badge?: number;
  emphasize?: boolean;
  onClick: () => void;
}) {
  const content = (
    <button
      onClick={onClick}
      className={cn(
        "relative flex h-10 items-center gap-3 rounded-[var(--radius-lg)] px-3 text-sm font-medium transition-colors duration-150",
        collapsed && "justify-center px-0",
        active ? "text-accent" : "text-muted hover:text-fg hover:bg-inset",
      )}
    >
      {active && (
        <motion.span
          layoutId="side-active"
          className="absolute inset-0 -z-10 rounded-[var(--radius-lg)] bg-accent-soft"
          transition={{ type: "spring", stiffness: 400, damping: 34 }}
        />
      )}
      <span className="shrink-0">{icon}</span>
      {!collapsed && <span className="flex-1 text-left">{label}</span>}
      {!collapsed && !!badge && (
        <span
          className={cn(
            "min-w-5 rounded-full px-1.5 text-center text-xs font-semibold tabular-nums",
            emphasize ? "bg-accent text-accent-fg" : "text-faint",
          )}
        >
          {badge}
        </span>
      )}
    </button>
  );
  return collapsed ? (
    <Tip label={label} side="right">
      {content}
    </Tip>
  ) : (
    content
  );
}
