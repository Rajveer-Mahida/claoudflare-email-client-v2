import { create } from "zustand";
import type { ViewName } from "@email/shared";

type Theme = "light" | "dark";

function initialTheme(): Theme {
  if (typeof document !== "undefined" && document.documentElement.classList.contains("dark")) {
    return "dark";
  }
  return "light";
}

function initialEmailTheme(): Theme {
  try {
    return localStorage.getItem("aria-email-theme") === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

type UIState = {
  theme: Theme;
  toggleTheme: () => void;

  // reading-pane-only theme for email content (separate from app theme)
  emailTheme: Theme;
  toggleEmailTheme: () => void;

  // current list filter
  view: ViewName;
  labelId: string | null;
  q: string;
  setFilter: (next: { view?: ViewName; labelId?: string | null; q?: string }) => void;

  // multi-select for bulk actions
  selection: Set<string>;
  toggleSelect: (id: string) => void;
  selectOnly: (ids: string[]) => void;
  clearSelection: () => void;

  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  mobileNavOpen: boolean;
  setMobileNav: (open: boolean) => void;
};

export const useUI = create<UIState>((set, get) => ({
  theme: initialTheme(),
  toggleTheme: () => {
    const next: Theme = get().theme === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem("aria-theme", next);
    } catch {
      /* ignore */
    }
    set({ theme: next });
  },

  emailTheme: initialEmailTheme(),
  toggleEmailTheme: () => {
    const next: Theme = get().emailTheme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem("aria-email-theme", next);
    } catch {
      /* ignore */
    }
    set({ emailTheme: next });
  },

  view: "inbox",
  labelId: null,
  q: "",
  setFilter: (next) =>
    set((s) => ({
      view: next.view ?? s.view,
      labelId: next.labelId !== undefined ? next.labelId : s.labelId,
      q: next.q !== undefined ? next.q : s.q,
      selection: new Set<string>(),
      mobileNavOpen: false,
    })),

  selection: new Set<string>(),
  toggleSelect: (id) =>
    set((s) => {
      const next = new Set(s.selection);
      next.has(id) ? next.delete(id) : next.add(id);
      return { selection: next };
    }),
  selectOnly: (ids) => set({ selection: new Set(ids) }),
  clearSelection: () => set({ selection: new Set<string>() }),

  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  mobileNavOpen: false,
  setMobileNav: (open) => set({ mobileNavOpen: open }),
}));
