"use client";

import { useEffect } from "react";
import { type Category, type Ticket, isOverdue } from "./domain";
import { selectTickets, useStore } from "./store";

const MIX: [Category, number][] = [
  ["garbage_dump", 30],
  ["overflowing_bin", 22],
  ["blocked_drain", 18],
  ["stagnant_water", 12],
  ["missed_collection", 14],
  ["dead_animal", 4],
];

function pickCat(): Category {
  let r = Math.random() * 100;
  for (const [c, w] of MIX) if ((r -= w) <= 0) return c;
  return "garbage_dump";
}

function pick<T>(xs: T[]): T | undefined {
  return xs[Math.floor(Math.random() * xs.length)];
}

/**
 * "Live morning" simulation for demos: every few seconds a resident reports, a supervisor assigns,
 * a crew starts or clears a job. New reports appear beside existing ones, so they land in real
 * dense lanes. Simulated reports are tagged source "sim" and are never persisted.
 */
export function useLiveSimulation(enabled: boolean, everyMs = 3200) {
  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      const s = useStore.getState();
      const all = selectTickets(s);
      const now = Date.now();
      const open = all.filter((t) => t.status !== "resolved");
      const r = Math.random();
      if (r < 0.42 || open.length < 10) {
        const anchor = pick(all);
        if (!anchor) return;
        const m = 25 + Math.random() * 70;
        const a = Math.random() * Math.PI * 2;
        s.addTicket({
          lat: anchor.lat + (Math.sin(a) * m) / 111_000,
          lon: anchor.lon + (Math.cos(a) * m) / 104_000,
          cat: pickCat(),
          sev: (1 + Math.floor(Math.random() * 3)) as 1 | 2 | 3,
          source: "sim",
        });
        return;
      }
      if (r < 0.5) {
        const t = pick(open);
        if (t) s.meToo(t.id);
        return;
      }
      const byStatus = (st: Ticket["status"]) => open.filter((t) => t.status === st);
      if (r < 0.68) {
        const t = pick(byStatus("open").length ? byStatus("open") : open);
        if (t && t.status === "open") s.patch(t.id, { status: "assigned" });
        return;
      }
      if (r < 0.8) {
        const t = pick(byStatus("assigned"));
        if (t) s.patch(t.id, { status: "in_progress" });
        return;
      }
      if (r < 0.88) {
        const late = open.filter((t) => isOverdue(t, now) && !t.escalated);
        const t = pick(late);
        if (t) s.patch(t.id, { escalated: true });
        return;
      }
      const t = pick(byStatus("in_progress").length ? byStatus("in_progress") : byStatus("assigned"));
      if (t) s.patch(t.id, { status: "resolved", resolvedAt: now });
    };
    tick();
    const id = setInterval(tick, everyMs);
    return () => clearInterval(id);
  }, [enabled, everyMs]);
}
