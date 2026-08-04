import { create } from "zustand";

export type Tab = {
  id: string;
  title: string;
  path: string | null;
  content: string;
  dirty: boolean;
  cursor: number;
  cursorLine: number;
  cursorCol: number;
};

type TabsState = {
  tabs: Tab[];
  activeId: string | null;
  saveStatus: "idle" | "saving" | "saved" | "error";
  setSaveStatus: (status: TabsState["saveStatus"]) => void;
  setTabs: (tabs: Tab[], activeId: string | null) => void;
  addTab: (tab?: Partial<Tab>) => string;
  closeTab: (id: string) => void;
  setActive: (id: string) => void;
  nextTab: () => void;
  updateContent: (id: string, content: string) => void;
  updateCursor: (id: string, cursor: number, line?: number, col?: number) => void;
  markSaved: (id: string, path?: string | null, title?: string) => void;
  getActiveTab: () => Tab | null;
};

let seq = 0;

export function createTabId(): string {
  seq += 1;
  return `tab-${Date.now()}-${seq}`;
}

export function titleFromPath(path: string | null | undefined): string {
  if (!path) return "Sem título";
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

export const useTabsStore = create<TabsState>((set, get) => ({
  tabs: [],
  activeId: null,
  saveStatus: "idle",

  setSaveStatus: (saveStatus) => set({ saveStatus }),

  setTabs: (tabs, activeId) => set({ tabs, activeId }),

  addTab: (partial) => {
    const id = partial?.id ?? createTabId();
    const tab: Tab = {
      id,
      title: partial?.title ?? "Sem título",
      path: partial?.path ?? null,
      content: partial?.content ?? "",
      dirty: partial?.dirty ?? false,
      cursor: partial?.cursor ?? 0,
      cursorLine: partial?.cursorLine ?? 1,
      cursorCol: partial?.cursorCol ?? 1,
    };
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeId: id,
    }));
    return id;
  },

  closeTab: (id) => {
    const { tabs, activeId } = get();
    const index = tabs.findIndex((t) => t.id === id);
    if (index < 0) return;
    const next = tabs.filter((t) => t.id !== id);
    if (next.length === 0) {
      const freshId = createTabId();
      set({
        tabs: [
          {
            id: freshId,
            title: "Sem título",
            path: null,
            content: "",
            dirty: false,
            cursor: 0,
            cursorLine: 1,
            cursorCol: 1,
          },
        ],
        activeId: freshId,
      });
      return;
    }
    let nextActive = activeId;
    if (activeId === id) {
      const neighbor = next[Math.min(index, next.length - 1)];
      nextActive = neighbor.id;
    }
    set({ tabs: next, activeId: nextActive });
  },

  setActive: (id) => set({ activeId: id }),

  nextTab: () => {
    const { tabs, activeId } = get();
    if (tabs.length < 2 || !activeId) return;
    const index = tabs.findIndex((t) => t.id === activeId);
    const next = tabs[(index + 1) % tabs.length];
    set({ activeId: next.id });
  },

  updateContent: (id, content) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === id ? { ...t, content, dirty: true } : t,
      ),
    })),

  updateCursor: (id, cursor, line, col) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === id
          ? {
              ...t,
              cursor,
              cursorLine: line ?? t.cursorLine,
              cursorCol: col ?? t.cursorCol,
            }
          : t,
      ),
    })),

  markSaved: (id, path, title) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === id
          ? {
              ...t,
              dirty: false,
              path: path === undefined ? t.path : path,
              title: title ?? (path ? titleFromPath(path) : t.title),
            }
          : t,
      ),
      saveStatus: "saved",
    })),

  getActiveTab: () => {
    const { tabs, activeId } = get();
    return tabs.find((t) => t.id === activeId) ?? null;
  },
}));
