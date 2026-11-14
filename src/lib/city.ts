"use client";

import { useEffect, useState } from "react";
import { type Category, DAY, type Density, type Ticket, metres } from "./domain";
import { type Lane, type Routes, TIME_LAPSE, VAN_SPEED_MS, positionAt, vanDistance } from "./vans";

/* ======================================================================
   Static city data: lane pieces and the community-bin registry
   ====================================================================== */

export type LanePiece = { i: number; path: [number, number][]; mid: [number, number] };
export type Bin = { id: string; lon: number; lat: number; van: string; s: number };

function useJson<T>(url: string, parse: (raw: unknown) => T, enabled = true): T | null {
  const [v, setV] = useState<T | null>(null);
  useEffect(() => {
    if (!enabled || v) return;
    let alive = true;
    fetch(url)
      .then((r) => r.json())
      .then((raw) => alive && setV(parse(raw)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [url, enabled, v, parse]);
  return v;
}

const parseLanes = (raw: unknown): LanePiece[] => {
  const d = raw as { lon0: number; lat0: number; q: number; pieces: number[][] };
  return d.pieces.map((flat, i) => {
    const path: [number, number][] = [];
    for (let k = 0; k < flat.length; k += 2) path.push([d.lon0 + flat[k] * d.q, d.lat0 + flat[k + 1] * d.q]);
    const m = path[Math.floor(path.length / 2)];
    const a = path[0];
    const b = path[path.length - 1];
    return { i, path, mid: path.length > 2 ? m : [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
  });
};
const parseBins = (raw: unknown) => raw as Bin[];

export const useLanes = (enabled: boolean) => useJson("/data/lanes.json", parseLanes, enabled);
export const useBins = () => useJson("/data/bins.json", parseBins);

/** Buildings in density cells whose centre is within r metres of a point. */
export function cellsWithin(d: Density, lat: number, lon: number, r: number): string[] {
  const ci = Math.floor((lat - d.lat0) / d.cell);
  const cj = Math.floor((lon - d.lon0) / d.cell);
  const n = Math.ceil(r / 50) + 1;
  const out: string[] = [];
  for (let a = -n; a <= n; a++)
    for (let b = -n; b <= n; b++) {
      const clat = d.lat0 + (ci + a + 0.5) * d.cell;
      const clon = d.lon0 + (cj + b + 0.5) * d.cell;
      if (metres(lat, lon, clat, clon) <= r) out.push(`${ci + a}_${cj + b}`);
    }
  return out;
}
const sumCells = (d: Density, cells: Iterable<string>) => {
  let n = 0;
  for (const c of cells) n += d.counts[c] ?? 0;
  return n;
};

/* ======================================================================
   Smart-bin twins
   ----------------------------------------------------------------------
   Each bin fills from the homes around it and is emptied when its van passes:
     fill = minutes since the van passed × homes within 100 m / 12,000; one resident "full" scan since then
            sets it to at least 92 % (which nudges the nearest van), each further scan adds 15 %
   Minutes are van-clock minutes, the same clock as the van ETAs.
   ====================================================================== */

export type BinState = {
  bin: Bin;
  fill: number; // 0..1.3
  homes: number;
  sinceMin: number; // since the van emptied it
  nextMin: number; // until the van is back
  scans: number; // "full" scans since it was emptied
};

export function binStates(bins: Bin[], routes: Routes, density: Density | null, scans: Record<string, number[]>, t: number): BinState[] {
  return bins.map((bin) => {
    const index = routes.vans.findIndex((v) => v.id === bin.van);
    const van = routes.vans[index];
    const d = vanDistance(van, t, index);
    const since = (((d - bin.s) % van.lengthM) + van.lengthM) % van.lengthM;
    const sinceMin = since / VAN_SPEED_MS / 60;
    const nextMin = (van.lengthM - since) / VAN_SPEED_MS / 60;
    const passedAtReal = t - (since / (VAN_SPEED_MS * TIME_LAPSE)) * 1000;
    const homes = density ? sumCells(density, cellsWithin(density, bin.lat, bin.lon, 100)) : 200;
    const fresh = (scans[bin.id] ?? []).filter((s) => s >= passedAtReal).length;
    // a resident saying "full" is trusted: one scan puts the bin at 92 % or more, each further scan adds 15 %
    const modelled = (sinceMin * homes) / 12000;
    const fill = Math.min(1.3, fresh ? Math.max(modelled, 0.92) + 0.15 * (fresh - 1) : modelled);
    return { bin, fill, homes, sinceMin, nextMin, scans: fresh };
  });
}

/** The van nearest to a point right now, and how far its head is. */
export function nearestVan(routes: Routes, lat: number, lon: number, t: number) {
  let best = { id: "", index: 0, distM: Infinity, lon: 0, lat: 0 };
  routes.vans.forEach((v, i) => {
    const h = positionAt(v, vanDistance(v, t, i));
    const dm = metres(lat, lon, h.lat, h.lon);
    if (dm < best.distM) best = { id: v.id, index: i, distM: dm, lon: h.lon, lat: h.lat };
  });
  return { ...best, etaMin: (best.distM * 1.3) / VAN_SPEED_MS / 60 };
}

/* ======================================================================
   Clean-lane ribbons
   ----------------------------------------------------------------------
   A lane piece is scored if any report fell within 50 m of it in the last 30 days.
   Open report nearby → "dirty". Otherwise its streak runs from the latest event
   (report filed or cleared) nearby: under 7 days watching, then 1, 2 and 3 weeks clean.
   ====================================================================== */

export type LaneTier = "dirty" | "watching" | "week" | "fortnight" | "three";
export const TIER: Record<LaneTier, { label: string; color: [number, number, number] }> = {
  dirty: { label: "Open complaint", color: [215, 55, 43] },
  watching: { label: "Cleared, under 7 days", color: [232, 140, 30] },
  week: { label: "Clean 7+ days", color: [196, 205, 70] },
  fortnight: { label: "Clean 14+ days", color: [92, 190, 120] },
  three: { label: "Clean 21+ days", color: [30, 150, 95] },
};

export type LaneScore = { lane: LanePiece; tier: LaneTier; days: number; reports: Ticket[] };

const GRID = 0.001;
const gkey = (lat: number, lon: number) => Math.floor(lat / GRID) * 100000 + Math.floor(lon / GRID);

export function laneScores(lanes: LanePiece[], tickets: Ticket[], at: number): LaneScore[] {
  const idx = new Map<number, Ticket[]>();
  for (const t of tickets) {
    if (t.createdAt > at || t.createdAt < at - 30 * DAY) continue;
    const k = gkey(t.lat, t.lon);
    (idx.get(k) ?? idx.set(k, []).get(k)!).push(t);
  }
  const out: LaneScore[] = [];
  for (const lane of lanes) {
    const [lon, lat] = lane.mid;
    const ci = Math.floor(lat / GRID);
    const cj = Math.floor(lon / GRID);
    const near: Ticket[] = [];
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++)
        for (const t of idx.get((ci + a) * 100000 + cj + b) ?? []) if (metres(lat, lon, t.lat, t.lon) <= 50) near.push(t);
    if (!near.length) continue;
    const open = near.some((t) => t.resolvedAt === undefined || t.resolvedAt > at);
    const last = Math.max(...near.map((t) => (t.resolvedAt !== undefined && t.resolvedAt <= at ? t.resolvedAt : t.createdAt)));
    const days = (at - last) / DAY;
    const tier: LaneTier = open ? "dirty" : days < 7 ? "watching" : days < 14 ? "week" : days < 21 ? "fortnight" : "three";
    out.push({ lane, tier, days: open ? 0 : days, reports: near });
  }
  return out;
}

/* ======================================================================
   What-if planner
   ====================================================================== */

const DUMPING: Category[] = ["garbage_dump", "overflowing_bin", "missed_collection"];
/** Planning assumption, shown on screen: a bin within 100 m prevents 40 % of dumping reports. */
export const BIN_EFFECT = 0.4;

export function planBin(p: { lat: number; lon: number }, bins: Bin[], density: Density | null, tickets: Ticket[], at: number) {
  const nearestBinM = Math.min(...bins.map((b) => metres(p.lat, p.lon, b.lat, b.lon)));
  let newHomes = 0;
  let homes = 0;
  if (density) {
    const cells = cellsWithin(density, p.lat, p.lon, 100);
    homes = sumCells(density, cells);
    const covered = (c: string) => {
      const [i, j] = c.split("_").map(Number);
      const lat = density.lat0 + (i + 0.5) * density.cell;
      const lon = density.lon0 + (j + 0.5) * density.cell;
      return bins.some((b) => metres(lat, lon, b.lat, b.lon) <= 100);
    };
    newHomes = sumCells(density, cells.filter((c) => !covered(c)));
  }
  const reports = tickets.filter(
    (t) => DUMPING.includes(t.cat) && t.createdAt <= at && t.createdAt > at - 30 * DAY && metres(p.lat, p.lon, t.lat, t.lon) <= 100,
  );
  return { homes, newHomes, reports: reports.length, drop: Math.round(reports.length * BIN_EFFECT * 10) / 10, nearestBinM };
}

/** The spot where a new bin would catch the most dumping reports that no bin covers today. */
export function suggestBin(bins: Bin[], tickets: Ticket[], at: number): { lat: number; lon: number } | null {
  const recent = tickets.filter(
    (t) =>
      DUMPING.includes(t.cat) &&
      t.createdAt <= at &&
      t.createdAt > at - 30 * DAY &&
      !bins.some((b) => metres(t.lat, t.lon, b.lat, b.lon) <= 100),
  );
  let best: { lat: number; lon: number; n: number } | null = null;
  for (const c of recent) {
    const n = recent.filter((t) => metres(c.lat, c.lon, t.lat, t.lon) <= 100).length;
    if (!best || n > best.n) best = { lat: c.lat, lon: c.lon, n };
  }
  return best ? { lat: best.lat, lon: best.lon } : null;
}

export function planShift(vanId: string, routes: Routes, density: Density | null, confirmed: number) {
  const lanes = routes.lanes.filter((l) => !l[5] && l[4] === vanId);
  const lengthM = lanes.reduce((s, l) => s + metres(l[1], l[0], l[3], l[2]), 0);
  let homes = 0;
  if (density) {
    const cells = new Set<string>();
    for (const l of lanes) for (const c of cellsWithin(density, (l[1] + l[3]) / 2, (l[0] + l[2]) / 2, 40)) cells.add(c);
    homes = sumCells(density, cells);
  }
  return { lanes, lengthM, homes, confirmed, minutes: (lengthM * 2.2) / VAN_SPEED_MS / 60 };
}

/* ======================================================================
   Next week's hotspots
   ----------------------------------------------------------------------
   Per ~110 m cell: recent reports weighted by category and recency (12-day decay),
   a repeat bonus where three or more reports came back, skipped van lanes,
   and drains weighted up after heavy rain.  likelihood = 1 − e^(−score / 2.2)
   A transparent heuristic, not a trained model.
   ====================================================================== */

const CAT_W: Record<Category, number> = {
  garbage_dump: 1,
  overflowing_bin: 0.8,
  missed_collection: 0.7,
  blocked_drain: 0.6,
  stagnant_water: 0.5,
  dead_animal: 0.3,
};

export type Hotspot = { lat: number; lon: number; likelihood: number; driver: string; reports: number };

export function forecast(tickets: Ticket[], skipped: Lane[], at: number, rainMm: number): Hotspot[] {
  type Acc = { score: number; n: number; water: number; skip: number; lat: number; lon: number };
  const cells = new Map<number, Acc>();
  const cell = (lat: number, lon: number) => {
    const k = gkey(lat, lon);
    let c = cells.get(k);
    if (!c) {
      c = { score: 0, n: 0, water: 0, skip: 0, lat: (Math.floor(lat / GRID) + 0.5) * GRID, lon: (Math.floor(lon / GRID) + 0.5) * GRID };
      cells.set(k, c);
    }
    return c;
  };
  const wet = rainMm >= 20 ? 1.6 : 1;
  for (const t of tickets) {
    if (t.createdAt > at || t.createdAt < at - 30 * DAY) continue;
    const w = CAT_W[t.cat] * Math.exp(-(at - t.createdAt) / DAY / 12) * (t.cat === "blocked_drain" || t.cat === "stagnant_water" ? wet : 1);
    const c = cell(t.lat, t.lon);
    c.score += w;
    c.n += 1;
    if (t.cat === "blocked_drain" || t.cat === "stagnant_water") c.water += w;
    // a little spill into the neighbours: dumping moves to the next empty corner
    for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) cell(t.lat + da * GRID, t.lon + db * GRID).score += w * 0.25;
  }
  for (const l of skipped) {
    const c = cell((l[1] + l[3]) / 2, (l[0] + l[2]) / 2);
    c.score += 0.6;
    c.skip += 1;
  }
  const out: Hotspot[] = [];
  for (const c of cells.values()) {
    const s = c.score * (c.n >= 3 ? Math.min(2, 1 + 0.15 * (c.n - 2)) : 1);
    const likelihood = 1 - Math.exp(-s / 2.2);
    if (likelihood < 0.3) continue;
    // name the strongest driver
    const driver =
      c.water > c.score * 0.45
        ? "drains, worse after rain"
        : c.skip >= 1 && c.skip * 0.6 >= c.score * 0.25
          ? "van skipped lanes here"
          : c.n >= 3
            ? "keeps coming back"
            : "recent dumping nearby";
    out.push({ lat: c.lat, lon: c.lon, likelihood, driver, reports: c.n });
  }
  return out.sort((a, b) => b.likelihood - a.likelihood);
}
