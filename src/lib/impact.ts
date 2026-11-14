import { CATEGORIES, type Category, CATEGORY_IDS, DAY, type Density, HOUR, type Ticket, type ZoneId, isOpenAt, isOverdue, peopleExposed, priority } from "./domain";

/**
 * Person-days of exposure avoided: the outcome SwachhGrid is built to move.
 *
 *   avoided = Σ over reports cleared in the window: people within 100 m × max(0, BASELINE_DAYS − days it took to clear)
 *
 * BASELINE_DAYS is a stated planning assumption for how long a complaint waits without an owner, a deadline
 * or proof of clean. With NMC's own historical clearing times it becomes the real baseline.
 */
export const BASELINE_DAYS = 5;

export function avoided(t: Ticket, density: Density | null): number {
  if (t.resolvedAt === undefined) return 0;
  const days = (t.resolvedAt - t.createdAt) / DAY;
  return peopleExposed(density, t) * Math.max(0, BASELINE_DAYS - days);
}

export function personDaysAvoided(tickets: Ticket[], density: Density | null, from: number, to: number): number {
  let n = 0;
  for (const t of tickets) if (t.resolvedAt !== undefined && t.resolvedAt > from && t.resolvedAt <= to) n += avoided(t, density);
  return Math.round(n);
}

export type ZoneStats = {
  zone: ZoneId;
  open: number;
  late: number;
  cleared30: number;
  medianH: number | null;
  onTimePct: number | null;
  reopened: number;
  avoided7: number;
  avoided30: number;
  exposedNow: number; // person-days already lived beside today's open reports
  peopleNow: number;
  daily: { reported: number; cleared: number }[];
  catMix: { cat: Category; open: number }[];
  worst: { t: Ticket; exposed: number }[];
};

export function zoneStats(zone: ZoneId, all: Ticket[], density: Density | null, at: number): ZoneStats {
  const tickets = all.filter((t) => t.zone === zone);
  const open = tickets.filter((t) => isOpenAt(t, at));
  const cleared = tickets.filter((t) => t.resolvedAt !== undefined && t.resolvedAt <= at && t.resolvedAt > at - 30 * DAY);
  const times = cleared.map((t) => ((t.resolvedAt as number) - t.createdAt) / HOUR).sort((a, b) => a - b);
  const onTime = cleared.filter((t) => ((t.resolvedAt as number) - t.createdAt) / HOUR <= CATEGORIES[t.cat].slaH).length;
  let exposedNow = 0;
  let peopleNow = 0;
  for (const t of open) {
    const e = peopleExposed(density, t);
    peopleNow += e;
    exposedNow += e * ((at - t.createdAt) / DAY);
  }
  const daily = Array.from({ length: 30 }, (_, i) => {
    const a = at - (30 - i) * DAY;
    const b = a + DAY;
    return {
      reported: tickets.filter((t) => t.createdAt > a && t.createdAt <= b).length,
      cleared: tickets.filter((t) => t.resolvedAt !== undefined && t.resolvedAt > a && t.resolvedAt <= b).length,
    };
  });
  return {
    zone,
    open: open.length,
    late: open.filter((t) => isOverdue(t, at)).length,
    cleared30: cleared.length,
    medianH: times.length ? times[Math.floor(times.length / 2)] : null,
    onTimePct: cleared.length ? Math.round((onTime / cleared.length) * 100) : null,
    reopened: tickets.filter((t) => t.reopened).length,
    avoided7: personDaysAvoided(tickets, density, at - 7 * DAY, at),
    avoided30: personDaysAvoided(tickets, density, at - 30 * DAY, at),
    exposedNow: Math.round(exposedNow),
    peopleNow,
    daily,
    catMix: CATEGORY_IDS.map((cat) => ({ cat, open: open.filter((t) => t.cat === cat).length })).filter((c) => c.open),
    worst: open
      .map((t) => ({ t, exposed: peopleExposed(density, t) }))
      .sort((a, b) => priority(b.t, b.exposed, at) - priority(a.t, a.exposed, at))
      .slice(0, 5),
  };
}

/** Indian-style grouping with a compact lakh form for big numbers. */
export function fmtBig(n: number): string {
  if (n >= 100000) return `${(n / 100000).toFixed(n >= 1000000 ? 0 : 1)} lakh`;
  return Math.round(n).toLocaleString("en-IN");
}
