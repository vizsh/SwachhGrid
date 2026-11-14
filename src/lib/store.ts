"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  type Category,
  type Density,
  type SeedRow,
  type Ticket,
  hydrateSeed,
  localityFor,
  metres,
  zoneFor,
} from "./domain";

/**
 * Demo data layer. Seeded reports come from /data/seed.json; anything a visitor creates or
 * changes is kept in this browser (localStorage) and synced across tabs. Swap this module for
 * a hosted database to make reports shared between devices.
 */
interface State {
  seed: Ticket[];
  density: Density | null;
  loaded: boolean;
  userTickets: Ticket[];
  patches: Record<string, Partial<Ticket>>;
  load: () => Promise<void>;
  addTicket: (t: { lat: number; lon: number; cat: Category; sev: 1 | 2 | 3; photo?: string; note?: string }) => Ticket;
  patch: (id: string, p: Partial<Ticket>) => void;
  meToo: (id: string) => void;
  resetDemo: () => void;
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      seed: [],
      density: null,
      loaded: false,
      userTickets: [],
      patches: {},
      load: async () => {
        if (get().loaded) return;
        const [seed, density] = await Promise.all([
          fetch("/data/seed.json").then((r) => r.json() as Promise<SeedRow[]>),
          fetch("/data/density.json").then((r) => r.json() as Promise<Density>),
        ]);
        set({ seed: hydrateSeed(seed, Date.now()), density, loaded: true });
      },
      addTicket: (t) => {
        const ticket: Ticket = {
          ...t,
          id: `NGP-${2000 + get().userTickets.length + Math.floor(Math.random() * 900)}`,
          createdAt: Date.now(),
          status: "open",
          meToo: 0,
          zone: zoneFor(t.lat, t.lon),
          locality: localityFor(t.lat, t.lon),
          source: "user",
        };
        set({ userTickets: [...get().userTickets, ticket] });
        return ticket;
      },
      patch: (id, p) => {
        if (get().userTickets.some((t) => t.id === id)) {
          set({ userTickets: get().userTickets.map((t) => (t.id === id ? { ...t, ...p } : t)) });
        } else {
          set({ patches: { ...get().patches, [id]: { ...get().patches[id], ...p } } });
        }
      },
      meToo: (id) => {
        const t = selectTickets(get()).find((x) => x.id === id);
        if (t) get().patch(id, { meToo: t.meToo + 1 });
      },
      resetDemo: () => set({ userTickets: [], patches: {} }),
    }),
    {
      name: "swachhgrid-demo-v1",
      partialize: (s) => ({ userTickets: s.userTickets, patches: s.patches }),
    },
  ),
);

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === "swachhgrid-demo-v1") void useStore.persist.rehydrate();
  });
}

let cacheKey: unknown[] = [];
let cache: Ticket[] = [];
export function selectTickets(s: Pick<State, "seed" | "userTickets" | "patches">): Ticket[] {
  if (cacheKey[0] === s.seed && cacheKey[1] === s.userTickets && cacheKey[2] === s.patches) return cache;
  cacheKey = [s.seed, s.userTickets, s.patches];
  cache = [...s.seed.map((t) => (s.patches[t.id] ? { ...t, ...s.patches[t.id] } : t)), ...s.userTickets];
  return cache;
}

export function useTickets(): Ticket[] {
  return useStore(selectTickets);
}

/** An open report of the same kind within 30 m counts as the same problem. */
export function findDuplicate(tickets: Ticket[], lat: number, lon: number, cat: Category): Ticket | undefined {
  return tickets.find((t) => t.status !== "resolved" && t.cat === cat && metres(lat, lon, t.lat, t.lon) <= 30);
}
