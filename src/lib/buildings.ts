"use client";

import { useEffect, useState } from "react";
import { BUILDING_TILES } from "./domain";

export interface Building {
  ring: number[]; // flat [lon, lat, lon, lat, ...]
  lon: number;
  lat: number;
  h: number; // estimated height in metres (footprints carry no height)
  small: boolean;
}
export interface BuildingTile {
  key: string;
  data: Building[];
}

function estimateHeight(area: number, lon: number, lat: number): number {
  const jitter = (Math.abs(Math.sin(lon * 91813.7 + lat * 37119.3)) * 1000) % 1;
  if (area < 45) return 2.6 + jitter * 1.2;
  if (area < 120) return 5.2 + jitter * 2;
  if (area < 400) return 8.5 + jitter * 3;
  return 11 + jitter * 5;
}

/** Loads the pre-exported real building footprints, tile by tile. */
export function useBuildingTiles(): BuildingTile[] {
  const [tiles, setTiles] = useState<BuildingTile[]>([]);
  useEffect(() => {
    let alive = true;
    for (const [x, y] of BUILDING_TILES) {
      fetch(`/data/tiles/14/${x}/${y}.json`)
        .then((r) => (r.ok ? (r.json() as Promise<[number, number[]][]>) : []))
        .then((rows) => {
          if (!alive || rows.length === 0) return;
          const data = rows.map(([area, ring]) => ({
            ring,
            lon: ring[0],
            lat: ring[1],
            h: estimateHeight(area, ring[0], ring[1]),
            small: area < 45,
          }));
          setTiles((t) => [...t, { key: `${x}-${y}`, data }]);
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, []);
  return tiles;
}
