"use client";

import { useEffect, useState } from "react";

/**
 * Monsoon simulator. A transparent, explainable waterlogging model, not a hydraulic one:
 *
 *   lowness  = how far a ~27 m cell sits below the mean of its ~450 m surroundings (from SRTM, see export_terrain.py)
 *   boost    = up to +1.4 m of effective lowness within 150 m of an open blocked drain or stagnant-water report,
 *              because a choked drain cannot carry water away
 *   level(R) = 3.3 m - 2.3 m × (R / 150)^0.8, the lowness a cell needs before rain R (mm) pools there
 *   depth    = lowness + boost - level(R), water where depth > 0
 *
 * So light rain fills only the deepest hollows, heavy rain spreads along the low corridors,
 * and every blocked drain puts water into the lanes around it.
 */

export type Terrain = {
  bounds: [number, number, number, number];
  cols: number;
  rows: number;
  cell: number;
  low: Float32Array;
};

let cache: Promise<Terrain> | null = null;

export function loadTerrain(): Promise<Terrain> {
  cache ??= (async () => {
    const meta = await fetch("/data/terrain.json").then((r) => r.json());
    const img = new Image();
    img.src = "/data/terrain.png";
    await img.decode();
    const c = document.createElement("canvas");
    c.width = meta.cols;
    c.height = meta.rows;
    const ctx = c.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, meta.cols, meta.rows).data;
    const low = new Float32Array(meta.cols * meta.rows);
    for (let i = 0; i < low.length; i++) low[i] = px[i * 4] * meta.unit;
    return { bounds: meta.bounds, cols: meta.cols, rows: meta.rows, cell: meta.cell, low };
  })();
  return cache;
}

export function useTerrain(enabled: boolean): Terrain | null {
  const [t, setT] = useState<Terrain | null>(null);
  useEffect(() => {
    if (!enabled || t) return;
    let alive = true;
    loadTerrain()
      .then((v) => alive && setT(v))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [enabled, t]);
  return t;
}

export function pondLevel(rainMm: number): number {
  if (rainMm <= 0) return Infinity;
  return 3.3 - 2.3 * Math.pow(Math.min(rainMm, 150) / 150, 0.8);
}

export type Flood = {
  depth: Float32Array; // metres of water per cell (0 when dry)
  image: HTMLCanvasElement;
  wetShare: number;
  rainMm: number;
};

export function floodModel(t: Terrain, rainMm: number, drains: { lat: number; lon: number }[]): Flood {
  const { cols, rows, cell, bounds } = t;
  const [lon0, , , lat1] = bounds;
  const boost = new Float32Array(cols * rows);
  const k = Math.min(1, rainMm / 20);
  const r = 6; // 6 cells ≈ 160 m
  if (k > 0)
    for (const d of drains) {
      const c0 = Math.floor((d.lon - lon0) / cell);
      const r0 = Math.floor((lat1 - d.lat) / cell);
      for (let dr = -r; dr <= r; dr++)
        for (let dc = -r; dc <= r; dc++) {
          const rr = r0 + dr;
          const cc = c0 + dc;
          if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
          const dist = Math.hypot(dr, dc) * 27;
          if (dist > 150) continue;
          const v = 1.4 * (1 - dist / 150) * k;
          const i = rr * cols + cc;
          if (v > boost[i]) boost[i] = v;
        }
    }
  const level = pondLevel(rainMm);
  const depth = new Float32Array(cols * rows);
  const image = document.createElement("canvas");
  image.width = cols;
  image.height = rows;
  const ctx = image.getContext("2d") as CanvasRenderingContext2D;
  const out = ctx.createImageData(cols, rows);
  let wet = 0;
  for (let i = 0; i < depth.length; i++) {
    const d = t.low[i] + boost[i] - level;
    if (d <= 0) continue;
    depth[i] = d;
    wet++;
    const s = Math.min(1, d / 1.2); // shallow → deep
    out.data[i * 4] = 150 - 120 * s;
    out.data[i * 4 + 1] = 200 - 105 * s;
    out.data[i * 4 + 2] = 240 - 60 * s;
    out.data[i * 4 + 3] = Math.round(255 * Math.min(0.88, 0.42 + 0.5 * s));
  }
  ctx.putImageData(out, 0, 0);
  return { depth, image, wetShare: wet / depth.length, rainMm };
}

export function depthAt(t: Terrain, f: Flood, lat: number, lon: number): number {
  const [lon0, , , lat1] = t.bounds;
  const c = Math.floor((lon - lon0) / t.cell);
  const r = Math.floor((lat1 - lat) / t.cell);
  if (r < 0 || c < 0 || r >= t.rows || c >= t.cols) return 0;
  return f.depth[r * t.cols + c];
}
