"use client";

import { useEffect, useState } from "react";
import { metres, type ZoneId } from "./domain";

/**
 * Collection vans ("ghanta gaadi"). Routes follow real OpenStreetMap roads; the vans and their
 * schedules are simulated because no live van GPS is public.
 *
 * One shared clock drives every screen, so a van seen on the command centre is in the same place
 * on the resident's phone. The demo runs at TIME_LAPSE × real speed.
 */
export const VAN_SPEED_MS = 12_000 / 3600; // 12 km/h in metres per second
export const TIME_LAPSE = 20;

export interface Van {
  id: string;
  zone: ZoneId;
  name: string;
  lengthM: number;
  path: [number, number][];
  cum: number[];
}
/** [lon1, lat1, lon2, lat2, vanId, covered(1) | skipped(0)] */
export type Lane = [number, number, number, number, string, 0 | 1];
export interface Routes {
  vans: Van[];
  lanes: Lane[];
}

let cache: Promise<Routes> | null = null;
export function loadRoutes(): Promise<Routes> {
  cache ??= fetch("/data/routes.json").then((r) => r.json() as Promise<Routes>);
  return cache;
}

export function useRoutes(): Routes | null {
  const [routes, setRoutes] = useState<Routes | null>(null);
  useEffect(() => {
    let alive = true;
    loadRoutes().then((r) => alive && setRoutes(r));
    return () => {
      alive = false;
    };
  }, []);
  return routes;
}

/** Distance the van has driven along its loop at wall-clock time `t` (ms). Vans start staggered. */
export function vanDistance(v: Van, t: number, index = 0): number {
  const travelled = (t / 1000) * VAN_SPEED_MS * TIME_LAPSE + index * 1700;
  return ((travelled % v.lengthM) + v.lengthM) % v.lengthM;
}

function segmentAt(v: Van, d: number): number {
  let lo = 0;
  let hi = v.cum.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (v.cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function positionAt(v: Van, d: number): { lon: number; lat: number; heading: number } {
  const i = segmentAt(v, d);
  const a = v.path[i];
  const b = v.path[Math.min(i + 1, v.path.length - 1)];
  const span = v.cum[i + 1] - v.cum[i] || 1;
  const k = Math.min(1, Math.max(0, (d - v.cum[i]) / span));
  const heading = (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI;
  return { lon: a[0] + (b[0] - a[0]) * k, lat: a[1] + (b[1] - a[1]) * k, heading };
}

/** The path driven so far, as a trail behind the van (for the landing hero and mini maps). */
export function trailBehind(v: Van, d: number, lengthM: number): [number, number][] {
  const out: [number, number][] = [];
  const start = Math.max(0, d - lengthM);
  const i0 = segmentAt(v, start);
  const i1 = segmentAt(v, d);
  const p0 = positionAt(v, start);
  out.push([p0.lon, p0.lat]);
  for (let i = i0 + 1; i <= i1; i++) out.push(v.path[i]);
  const p1 = positionAt(v, d);
  out.push([p1.lon, p1.lat]);
  return out;
}

/**
 * When will a van next pass near (lat, lon)? Returns the soonest van whose route comes within
 * `withinM`, with the remaining distance along its loop and the ETA in real minutes.
 */
export function nextVan(
  routes: Routes,
  lat: number,
  lon: number,
  t: number,
  withinM = 120,
): { van: Van; index: number; etaMin: number; distM: number; progress: number } | null {
  let best: { van: Van; index: number; etaMin: number; distM: number; progress: number } | null = null;
  routes.vans.forEach((v, index) => {
    const d = vanDistance(v, t, index);
    let nearestAhead = Infinity;
    v.path.forEach((p, i) => {
      if (metres(lat, lon, p[1], p[0]) > withinM) return;
      const ahead = (v.cum[i] - d + v.lengthM) % v.lengthM;
      if (ahead < nearestAhead) nearestAhead = ahead;
    });
    if (nearestAhead === Infinity) return;
    const etaMin = nearestAhead / VAN_SPEED_MS / 60;
    if (!best || etaMin < best.etaMin) best = { van: v, index, etaMin, distM: nearestAhead, progress: d / v.lengthM };
  });
  return best;
}

/** Is there a skipped lane on a van's beat within `withinM` of this point? */
export function skippedLaneNear(routes: Routes, lat: number, lon: number, withinM = 60): Lane | null {
  for (const l of routes.lanes) {
    if (l[5]) continue;
    const mlon = (l[0] + l[2]) / 2;
    const mlat = (l[1] + l[3]) / 2;
    if (metres(lat, lon, mlat, mlon) <= withinM) return l;
  }
  return null;
}

/** A ticking wall clock for animated components; `fps` caps React re-renders. */
export function useClock(fps = 4): number {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setT(Date.now()), 1000 / fps);
    return () => clearInterval(id);
  }, [fps]);
  return t;
}
