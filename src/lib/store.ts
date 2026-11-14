"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  CATEGORIES,
  type Category,
  type Density,
  type SeedRow,
  type Ticket,
  hydrateSeed,
  inPlace,
  localityFor,
  metres,
  zoneFor,
} from "./domain";

/**
 * Demo data layer. Seeded reports come from /data/seed.json; anything a visitor creates or
 * changes is kept in this browser (localStorage) and synced across tabs. Swap this module for
 * a hosted database to make reports shared between devices.
 */
export type FeedKind = "reported" | "assigned" | "started" | "cleared" | "escalated" | "reopened" | "metoo" | "alert" | "bin";
export interface FeedEvent {
  id: string;
  at: number;
  kind: FeedKind;
  text: string;
  ticketId?: string;
  zone?: string;
  lat?: number;
  lon?: number;
}

interface State {
  seed: Ticket[];
  density: Density | null;
  loaded: boolean;
  userTickets: Ticket[];
  patches: Record<string, Partial<Ticket>>;
  feed: FeedEvent[];
  /** QR "this bin is full" scans per community bin, as timestamps */
  binScans: Record<string, number[]>;
  load: () => Promise<void>;
  addTicket: (t: {
    lat: number;
    lon: number;
    cat: Category;
    sev: 1 | 2 | 3;
    photo?: string;
    note?: string;
    source?: "user" | "sim";
  }) => Ticket;
  log: (e: Omit<FeedEvent, "id" | "at"> & { at?: number }) => void;
  patch: (id: string, p: Partial<Ticket>) => void;
  meToo: (id: string) => void;
  scanBin: (bin: { id: string; lat: number; lon: number }) => Ticket;
  flushQueue: () => number;
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
      feed: [],
      binScans: {},
      log: (e) =>
        set({
          feed: [{ ...e, at: e.at ?? Date.now(), id: Math.random().toString(36).slice(2, 9) }, ...get().feed].slice(0, 60),
        }),
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
          source: t.source ?? "user",
        };
        // no network: keep it on the phone; it reaches the city when the connection is back
        if (ticket.source === "user" && typeof navigator !== "undefined" && navigator.onLine === false) ticket.queued = true;
        set({ userTickets: [...get().userTickets, ticket] });
        if (ticket.queued) return ticket;
        get().log({
          kind: "reported",
          text: `${CATEGORIES[ticket.cat].label} reported ${inPlace(ticket.locality)}`,
          ticketId: ticket.id,
          zone: ticket.zone,
          lat: ticket.lat,
          lon: ticket.lon,
        });
        return ticket;
      },
      patch: (id, p) => {
        const before = selectTickets(get()).find((x) => x.id === id);
        if (before) {
          const where = { ticketId: id, zone: before.zone, lat: before.lat, lon: before.lon };
          const label = CATEGORIES[before.cat].label;
          if (p.status && p.status !== before.status) {
            const kind = (
              { assigned: before.status === "resolved" ? "reopened" : "assigned", in_progress: "started", resolved: "cleared", open: "reopened" } as const
            )[p.status];
            const text = {
              assigned: `${label} ${inPlace(before.locality)} assigned to the crew`,
              reopened: `${label} ${inPlace(before.locality)} reopened by the resident`,
              started: `Crew started work on ${label.toLowerCase()} ${inPlace(before.locality)}`,
              cleared: `${label} ${inPlace(before.locality)} cleared with photo proof`,
            }[kind as "assigned" | "reopened" | "started" | "cleared"];
            get().log({ kind, text, ...where });
          }
          if (p.escalated && !before.escalated)
            get().log({ kind: "escalated", text: `${label} ${inPlace(before.locality)} escalated to the Zonal Officer`, ...where });
        }
        if (get().userTickets.some((t) => t.id === id)) {
          set({ userTickets: get().userTickets.map((t) => (t.id === id ? { ...t, ...p } : t)) });
        } else {
          set({ patches: { ...get().patches, [id]: { ...get().patches[id], ...p } } });
        }
      },
      meToo: (id) => {
        const t = selectTickets(get()).find((x) => x.id === id);
        if (!t) return;
        get().patch(id, { meToo: t.meToo + 1 });
        get().log({ kind: "metoo", text: `A neighbour backed the ${CATEGORIES[t.cat].label.toLowerCase()} report ${inPlace(t.locality)}`, ticketId: id, zone: t.zone, lat: t.lat, lon: t.lon });
      },
      scanBin: (bin) => {
        set({ binScans: { ...get().binScans, [bin.id]: [...(get().binScans[bin.id] ?? []).slice(-20), Date.now()] } });
        // the scan also files (or backs) an "overflowing bin" report at the bin, so it enters the queue
        const dup = findDuplicate(selectTickets(get()), bin.lat, bin.lon, "overflowing_bin");
        let ticket: Ticket;
        if (dup) {
          get().meToo(dup.id);
          ticket = selectTickets(get()).find((t) => t.id === dup.id) ?? dup;
        } else {
          ticket = get().addTicket({ lat: bin.lat, lon: bin.lon, cat: "overflowing_bin", sev: 2, note: `QR scan, bin ${bin.id}` });
        }
        get().log({ kind: "bin", text: `Bin ${bin.id} ${inPlace(ticket.locality)} reported full by QR scan`, ticketId: ticket.id, zone: ticket.zone, lat: bin.lat, lon: bin.lon });
        return ticket;
      },
      flushQueue: () => {
        const queued = get().userTickets.filter((t) => t.queued);
        if (!queued.length) return 0;
        set({ userTickets: get().userTickets.map((t) => (t.queued ? { ...t, queued: false } : t)) });
        for (const t of queued)
          get().log({
            kind: "reported",
            text: `${CATEGORIES[t.cat].label} reported ${inPlace(t.locality)} (sent after reconnecting)`,
            ticketId: t.id,
            zone: t.zone,
            lat: t.lat,
            lon: t.lon,
          });
        return queued.length;
      },
      resetDemo: () => set({ userTickets: [], patches: {}, feed: [], binScans: {} }),
    }),
    {
      name: "swachhgrid-demo-v1",
      partialize: (s) => ({
        userTickets: s.userTickets.filter((t) => t.source !== "sim"),
        patches: s.patches,
        feed: s.feed.slice(0, 30),
        binScans: s.binScans,
      }),
    },
  ),
);

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === "swachhgrid-demo-v1") void useStore.persist.rehydrate();
  });
  window.addEventListener("online", () => useStore.getState().flushQueue());
}

let cacheKey: unknown[] = [];
let cache: Ticket[] = [];
export function selectTickets(s: Pick<State, "seed" | "userTickets" | "patches">): Ticket[] {
  if (cacheKey[0] === s.seed && cacheKey[1] === s.userTickets && cacheKey[2] === s.patches) return cache;
  cacheKey = [s.seed, s.userTickets, s.patches];
  cache = [...s.seed.map((t) => (s.patches[t.id] ? { ...t, ...s.patches[t.id] } : t)), ...s.userTickets];
  return cache;
}

/** Every report, including ones still queued on this phone (the resident's own view). */
export function useAllTickets(): Ticket[] {
  return useStore(selectTickets);
}

/** Reports the city has received: queued offline reports are not there yet. */
export function useTickets(): Ticket[] {
  const all = useStore(selectTickets);
  return useMemo(() => (all.some((t) => t.queued) ? all.filter((t) => !t.queued) : all), [all]);
}

/** An open report of the same kind within 30 m counts as the same problem. */
export function findDuplicate(tickets: Ticket[], lat: number, lon: number, cat: Category): Ticket | undefined {
  return tickets.find((t) => t.status !== "resolved" && t.cat === cat && metres(lat, lon, t.lat, t.lon) <= 30);
}
