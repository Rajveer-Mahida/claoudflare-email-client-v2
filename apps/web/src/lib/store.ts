import { create } from "zustand";
import type { ViewName } from "@email/shared";

type Theme = "light" | "dark";

function initialTheme(): Theme {
  if (typeof document !== "undefined" && document.documentElement.classList.contains("dark")) {
    return "dark";
  }
  return "light";
}

type UIState = {
  theme: Theme;
  toggleTheme: () => void;

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

  view: "inbox",
  labelId: null,
  q: "",
  setFilter: (next) =>
    set((s) => ({
      view: next.view ?? s.view,
      labelId: next.labelId !== undefined ? next.labelId : s.labelId,
      q: next.q !== undefined ? next.q : s.q,
      selection: new Set<string>(),
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
}));
