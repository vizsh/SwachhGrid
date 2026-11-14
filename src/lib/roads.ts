"use client";

import { useEffect, useState } from "react";
import { type Ticket, type ZoneId, metres } from "./domain";

/**
 * A routable road network built in the browser from public/data/lanes.json.
 * Lane pieces were cut from OpenStreetMap ways and their coordinates are quantised to 1e-5°,
 * so pieces that meet at an OSM node share the exact same integer coordinate: that shared
 * coordinate becomes a graph node, and every consecutive pair of points becomes an edge.
 */
export type RoadGraph = {
  lon: Float64Array;
  lat: Float64Array;
  adj: number[][]; // neighbour node ids
  w: number[][]; // edge lengths in metres, parallel to adj
  grid: Map<number, number[]>; // ~220 m buckets for nearest-node lookups
  main: Uint8Array; // 1 for nodes in the largest connected network (98.6 % of nodes)
};

const BUCKET = 0.002;
const bkey = (lat: number, lon: number) => Math.floor(lat / BUCKET) * 100000 + Math.floor(lon / BUCKET);

let cache: Promise<RoadGraph> | null = null;

export function loadRoadGraph(): Promise<RoadGraph> {
  cache ??= (async () => {
    const d = (await fetch("/data/lanes.json").then((r) => r.json())) as { lon0: number; lat0: number; q: number; pieces: number[][] };
    const ids = new Map<number, number>();
    const lon: number[] = [];
    const lat: number[] = [];
    const adj: number[][] = [];
    const w: number[][] = [];
    const node = (x: number, y: number) => {
      const k = x * 100000 + y;
      let id = ids.get(k);
      if (id === undefined) {
        id = lon.length;
        ids.set(k, id);
        lon.push(d.lon0 + x * d.q);
        lat.push(d.lat0 + y * d.q);
        adj.push([]);
        w.push([]);
      }
      return id;
    };
    for (const p of d.pieces) {
      let prev = node(p[0], p[1]);
      for (let k = 2; k < p.length; k += 2) {
        const cur = node(p[k], p[k + 1]);
        if (cur === prev) continue;
        const m = metres(lat[prev], lon[prev], lat[cur], lon[cur]);
        adj[prev].push(cur);
        w[prev].push(m);
        adj[cur].push(prev);
        w[cur].push(m);
        prev = cur;
      }
    }
    // label connected components; the data box cuts some roads into small islands
    const comp = new Int32Array(lon.length).fill(-1);
    const sizes: number[] = [];
    for (let s0 = 0; s0 < lon.length; s0++) {
      if (comp[s0] >= 0) continue;
      const c = sizes.length;
      let size = 0;
      const stack = [s0];
      comp[s0] = c;
      while (stack.length) {
        const u = stack.pop() as number;
        size++;
        for (const v of adj[u])
          if (comp[v] < 0) {
            comp[v] = c;
            stack.push(v);
          }
      }
      sizes.push(size);
    }
    const big = sizes.indexOf(Math.max(...sizes));
    const main = new Uint8Array(lon.length);
    for (let i = 0; i < lon.length; i++) main[i] = comp[i] === big ? 1 : 0;
    const grid = new Map<number, number[]>();
    for (let i = 0; i < lon.length; i++) {
      const k = bkey(lat[i], lon[i]);
      (grid.get(k) ?? grid.set(k, []).get(k)!).push(i);
    }
    return { lon: Float64Array.from(lon), lat: Float64Array.from(lat), adj, w, grid, main };
  })();
  return cache;
}

export function useRoadGraph(enabled = true): RoadGraph | null {
  const [g, setG] = useState<RoadGraph | null>(null);
  useEffect(() => {
    if (!enabled || g) return;
    let alive = true;
    loadRoadGraph()
      .then((v) => alive && setG(v))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [enabled, g]);
  return g;
}

export function nearestNode(g: RoadGraph, lat: number, lon: number): number {
  let best = -1;
  let bd = Infinity;
  for (let r = 1; r <= 4 && best < 0; r++) {
    const ci = Math.floor(lat / BUCKET);
    const cj = Math.floor(lon / BUCKET);
    for (let a = -r; a <= r; a++)
      for (let b = -r; b <= r; b++)
        for (const i of g.grid.get((ci + a) * 100000 + cj + b) ?? []) {
          if (!g.main[i]) continue;
          const dm = metres(lat, lon, g.lat[i], g.lon[i]);
          if (dm < bd) {
            bd = dm;
            best = i;
          }
        }
  }
  return best;
}

/** Dijkstra from one node until every target is settled (or the queue empties). */
function shortest(g: RoadGraph, src: number, targets: Set<number>) {
  const n = g.lon.length;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  dist[src] = 0;
  // binary heap of [dist, node]
  const hd: number[] = [0];
  const hn: number[] = [src];
  const push = (dv: number, v: number) => {
    let i = hd.length;
    hd.push(dv);
    hn.push(v);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (hd[p] <= hd[i]) break;
      [hd[p], hd[i]] = [hd[i], hd[p]];
      [hn[p], hn[i]] = [hn[i], hn[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = [hd[0], hn[0]];
    const ld = hd.pop() as number;
    const ln = hn.pop() as number;
    if (hd.length) {
      hd[0] = ld;
      hn[0] = ln;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < hd.length && hd[l] < hd[m]) m = l;
        if (r < hd.length && hd[r] < hd[m]) m = r;
        if (m === i) break;
        [hd[m], hd[i]] = [hd[i], hd[m]];
        [hn[m], hn[i]] = [hn[i], hn[m]];
        i = m;
      }
    }
    return top;
  };
  let left = targets.size;
  const done = new Uint8Array(n);
  while (hd.length && left > 0) {
    const [du, u] = pop();
    if (done[u]) continue;
    done[u] = 1;
    if (targets.has(u)) left--;
    const au = g.adj[u];
    const wu = g.w[u];
    for (let k = 0; k < au.length; k++) {
      const v = au[k];
      const nd = du + wu[k];
      if (nd < dist[v]) {
        dist[v] = nd;
        prev[v] = u;
        push(nd, v);
      }
    }
  }
  return { dist, prev };
}

function pathTo(g: RoadGraph, prev: Int32Array, src: number, dst: number): [number, number][] {
  const out: [number, number][] = [];
  for (let v = dst; v !== -1; v = prev[v]) {
    out.push([g.lon[v], g.lat[v]]);
    if (v === src) break;
  }
  return out.reverse();
}

/* ======================================================================
   Crew route of the day
   ----------------------------------------------------------------------
   Which jobs: from the zone's crew base, repeatedly take the open job with the
   most priority per metre of road, score / (road distance + 400 m).
   In what order: the shortest road order through those jobs (nearest neighbour,
   then 2-opt on a road-distance matrix), so the crew never doubles back.
   ====================================================================== */

/** Approximate crew bases (zone offices). */
export const CREW_BASE: Record<ZoneId, { lat: number; lon: number; name: string }> = {
  gandhibagh: { lat: 21.1503, lon: 79.1031, name: "Gandhibagh zone office" },
  lakadganj: { lat: 21.1536, lon: 79.1228, name: "Lakadganj zone office" },
  ashinagar: { lat: 21.1765, lon: 79.1186, name: "Ashi Nagar zone office" },
};

export const CREW_SPEED_KMH = 12;
export const MIN_PER_STOP = 20;

export type RouteStop = { t: Ticket; exposed: number; legM: number; cumM: number; etaMin: number };
export type CrewRoute = {
  zone: ZoneId;
  base: { lat: number; lon: number; name: string };
  stops: RouteStop[];
  path: [number, number][];
  cum: number[]; // metres along path, for animation
  totalM: number;
  minutes: number;
  people: number;
};

export function crewRoute(
  g: RoadGraph,
  zone: ZoneId,
  jobs: { t: Ticket; exposed: number; score: number }[],
  maxStops = 8,
): CrewRoute {
  const base = CREW_BASE[zone];
  const baseNode = nearestNode(g, base.lat, base.lon);
  const pool = jobs.slice(0, 20).map((j) => ({ ...j, node: nearestNode(g, j.t.lat, j.t.lon) }));

  // 1. choose which jobs: greedy priority per metre of road from where the crew would be
  const chosen: typeof pool = [];
  let cur = baseNode;
  while (chosen.length < maxStops && pool.length) {
    const { dist } = shortest(g, cur, new Set(pool.map((p) => p.node)));
    let bi = 0;
    let bv = -Infinity;
    pool.forEach((p, i) => {
      const dm = Number.isFinite(dist[p.node]) ? dist[p.node] : 5000;
      const v = p.score / (dm + 400);
      if (v > bv) {
        bv = v;
        bi = i;
      }
    });
    const pick = pool.splice(bi, 1)[0];
    chosen.push(pick);
    cur = pick.node;
  }

  // 2. order them: road-distance matrix, nearest-neighbour start, then 2-opt so the crew never doubles back
  const nodes = [baseNode, ...chosen.map((c) => c.node)];
  const runs = nodes.map((n) => shortest(g, n, new Set(nodes)));
  const D = (a: number, b: number) => {
    const v = runs[a].dist[nodes[b]];
    return Number.isFinite(v) ? v : 1e7;
  };
  const order = [0];
  const rest = new Set(chosen.map((_, i) => i + 1));
  while (rest.size) {
    const last = order[order.length - 1];
    let nb = -1;
    for (const r of rest) if (nb < 0 || D(last, r) < D(last, nb)) nb = r;
    order.push(nb);
    rest.delete(nb);
  }
  const len = (o: number[]) => o.slice(1).reduce((s0, v, i) => s0 + D(o[i], v), 0);
  for (let improved = true; improved; ) {
    improved = false;
    for (let i = 1; i < order.length - 1; i++)
      for (let k = i + 1; k < order.length; k++) {
        const next = [...order.slice(0, i), ...order.slice(i, k + 1).reverse(), ...order.slice(k + 1)];
        if (len(next) + 1 < len(order)) {
          order.splice(0, order.length, ...next);
          improved = true;
        }
      }
  }

  // 3. stitch the road path
  const stops: RouteStop[] = [];
  const path: [number, number][] = [[base.lon, base.lat]];
  let cumM = 0;
  let minutes = 0;
  for (let i = 1; i < order.length; i++) {
    const a = order[i - 1];
    const b = order[i];
    const job = chosen[b - 1];
    const legM = D(a, b) < 1e7 ? D(a, b) : metres(g.lat[nodes[a]], g.lon[nodes[a]], job.t.lat, job.t.lon) * 1.6;
    if (D(a, b) < 1e7) path.push(...pathTo(g, runs[a].prev, nodes[a], nodes[b]));
    path.push([job.t.lon, job.t.lat]);
    cumM += legM;
    minutes += (legM / 1000 / CREW_SPEED_KMH) * 60;
    stops.push({ t: job.t, exposed: job.exposed, legM, cumM, etaMin: minutes });
    minutes += MIN_PER_STOP;
  }
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + metres(path[i - 1][1], path[i - 1][0], path[i][1], path[i][0]));
  return { zone, base, stops, path, cum, totalM: cumM, minutes, people: stops.reduce((s0, x) => s0 + x.exposed, 0) };
}

/** Google Maps directions with the stops as waypoints (it accepts up to 9). */
export function mapsLink(r: CrewRoute): string {
  if (!r.stops.length) return "";
  const last = r.stops[r.stops.length - 1].t;
  const way = r.stops
    .slice(0, -1)
    .slice(0, 8)
    .map((s) => `${s.t.lat.toFixed(5)},${s.t.lon.toFixed(5)}`)
    .join("|");
  return `https://www.google.com/maps/dir/?api=1&origin=${r.base.lat},${r.base.lon}&destination=${last.lat.toFixed(5)},${last.lon.toFixed(5)}&travelmode=driving${way ? `&waypoints=${encodeURIComponent(way)}` : ""}`;
}
