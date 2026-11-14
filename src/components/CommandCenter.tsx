"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { Map as MlMap, NavigationControl } from "@/lib/maplibre";
import type { MapMouseEvent } from "maplibre-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { AmbientLight, DirectionalLight, LightingEffect, _SunLight as SunLight } from "@deck.gl/core";
import { BitmapLayer, ColumnLayer, PathLayer, ScatterplotLayer, SolidPolygonLayer, TextLayer } from "@deck.gl/layers";
import { HexagonLayer } from "@deck.gl/aggregation-layers";
import { TripsLayer } from "@deck.gl/geo-layers";
import { ClipExtension, PathStyleExtension, type PathStyleExtensionProps } from "@deck.gl/extensions";
import type { Layer } from "@deck.gl/core";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ClipboardList, CloudRain, Crosshair, Film, Pause, Play, RotateCcw, Square, X } from "lucide-react";
import { type Flood, depthAt, floodModel, useTerrain } from "@/lib/flood";
import { daylight } from "@/lib/sun";
import {
  type BinState,
  type Hotspot,
  type LaneScore,
  type LaneTier,
  TIER,
  binStates,
  forecast,
  laneScores,
  nearestVan,
  planBin,
  planShift,
  suggestBin,
  useBins,
  useLanes,
} from "@/lib/city";
import { BinPanel, ForecastPanel, LanePanel, LaneSummary, type PlanMode, PlannerPanel } from "./CityPanels";
import { type Building, useBuildingTiles } from "@/lib/buildings";
import {
  CATEGORIES,
  DAY,
  HOUR,
  PEOPLE_PER_BUILDING,
  PILOT_CENTER,
  type Ticket,
  ZONES,
  ZONE_IDS,
  type ZoneId,
  ageHours,
  fmtAge,
  isOpenAt,
  isOverdue,
  metres,
  peopleExposed,
  priority,
} from "@/lib/domain";
import { DATA_ATTRIBUTION, baseStyle } from "@/lib/mapStyle";
import { type FeedEvent, useStore, useTickets } from "@/lib/store";
import { useLiveSimulation } from "@/lib/simulate";
import { type Lane, type Van, positionAt, skippedLaneNear, useClock, useRoutes, vanDistance } from "@/lib/vans";
import { ActivityFeed, AlertPanel, Timeline, VanPanel } from "./CommandPanels";
import { CustodyLine, Stamp } from "./paint";

const WINDOW_H = 720; // the scrubber covers the last 30 days
const RISK_CELL = 0.001;

type RiskIndex = Map<number, { lat: number; lon: number; days: number }[]>;
const cellKey = (lat: number, lon: number) => Math.floor(lat / RISK_CELL) * 100000 + Math.floor(lon / RISK_CELL);

function buildRiskIndex(open: Ticket[], at: number): RiskIndex {
  const idx: RiskIndex = new Map();
  for (const t of open) {
    const k = cellKey(t.lat, t.lon);
    const list = idx.get(k) ?? [];
    list.push({ lat: t.lat, lon: t.lon, days: ageHours(t, at) / 24 });
    idx.set(k, list);
  }
  return idx;
}

const lighting = new LightingEffect({
  ambient: new AmbientLight({ color: [255, 255, 255], intensity: 0.95 }),
  sun: new DirectionalLight({ color: [255, 240, 214], intensity: 1.15, direction: [-1.5, -2.5, -4] }),
});

const CHROME: [number, number, number] = [242, 183, 5];
const VERMILION: [number, number, number] = [215, 55, 43];

export default function CommandCenter() {
  const load = useStore((s) => s.load);
  const density = useStore((s) => s.density);
  const patch = useStore((s) => s.patch);
  const resetDemo = useStore((s) => s.resetDemo);
  const tickets = useTickets();
  const tiles = useBuildingTiles();

  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);

  const [now] = useState(() => Date.now());
  const [offsetH, setOffsetH] = useState(WINDOW_H); // WINDOW_H = live
  const [playing, setPlaying] = useState(false);
  const [zone, setZone] = useState<ZoneId | "all">("all");
  // ?id=NGP-1011 opens the command centre focused on one report (deep link from the crew app or a demo script).
  const [selectedId, setSelectedId] = useState<string | null>(() => new URLSearchParams(window.location.search).get("id"));
  const deepLinked = useRef(false);
  const [show, setShow] = useState({ exposure: true, columns: false, resolved: false, vans: true, lanes: false, bins: true, forecast: false });
  const [binId, setBinId] = useState<string | null>(() => new URLSearchParams(window.location.search).get("bin"));
  const binFlown = useRef(false);
  const [laneId, setLaneId] = useState<number | null>(null);
  const [plan, setPlan] = useState<{ mode: PlanMode; bin: { lat: number; lon: number } | null; van: string } | null>(null);
  const [rainMm, setRainMm] = useState<number | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [vanId, setVanId] = useState<string | null>(null);
  const [alertZone, setAlertZone] = useState<ZoneId | null>(null);
  const [alertSent, setAlertSent] = useState<Record<string, { at: number; points: [number, number][] }>>({});
  const [monsoon, setMonsoon] = useState(false);
  const [simRain, setSimRain] = useState(80);
  const [sunOn, setSunOn] = useState(false);
  const [split, setSplit] = useState<{ daysAgo: number; lon: number } | null>(null);
  const [tour, setTour] = useState<{ step: number; total: number; caption: string; sub: string } | null>(null);
  const tourToken = useRef(0);
  const follow = useRef<{ index: number; start: number; bearing: number } | null>(null);
  const terrain = useTerrain(monsoon);
  const lanes = useLanes(show.lanes);
  const bins = useBins();
  const binScans = useStore((s) => s.binScans);
  const binClock = useClock(1);
  const feed = useStore((s) => s.feed);
  const routes = useRoutes();
  const clock = useClock(0.2); // live "now", refreshed every 5 s

  useLiveSimulation(simulating);

  const live = offsetH >= WINDOW_H;
  const at = live ? Math.max(clock, ...tickets.map((t) => t.createdAt)) : now - (WINDOW_H - offsetH) * HOUR;

  useEffect(() => void load(), [load]);

  useEffect(() => {
    fetch(
      "https://api.open-meteo.com/v1/forecast?latitude=21.15&longitude=79.1&daily=precipitation_sum&past_days=3&forecast_days=1&timezone=Asia%2FKolkata",
    )
      .then((r) => r.json())
      .then((d) => {
        const v: number[] = d?.daily?.precipitation_sum ?? [];
        if (v.length) setRainMm(Math.round(v.slice(0, 3).reduce((a, b) => a + (b ?? 0), 0) * 10) / 10);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setOffsetH((h) => {
        if (h >= WINDOW_H) {
          setPlaying(false);
          return WINDOW_H;
        }
        return Math.min(WINDOW_H, h + 6);
      });
    }, 140);
    return () => clearInterval(id);
  }, [playing]);

  /* ---------- derived data ---------- */
  const scoped = useMemo(() => (zone === "all" ? tickets : tickets.filter((t) => t.zone === zone)), [tickets, zone]);
  const open = useMemo(() => scoped.filter((t) => isOpenAt(t, at)), [scoped, at]);
  const queue = useMemo(
    () =>
      open
        .map((t) => {
          const exposed = peopleExposed(density, t);
          return { t, exposed, score: priority(t, exposed, at) };
        })
        .sort((a, b) => b.score - a.score),
    [open, density, at],
  );
  const selected = tickets.find((t) => t.id === selectedId) ?? null;

  const kpi = useMemo(() => {
    const overdue = open.filter((t) => isOverdue(t, at)).length;
    let exposed = 0;
    if (density) {
      const cells = new Set<string>();
      for (const t of open) {
        const ci = Math.floor((t.lat - density.lat0) / density.cell);
        const cj = Math.floor((t.lon - density.lon0) / density.cell);
        for (let a = -3; a <= 3; a++)
          for (let b = -3; b <= 3; b++) {
            const clat = density.lat0 + (ci + a + 0.5) * density.cell;
            const clon = density.lon0 + (cj + b + 0.5) * density.cell;
            if (metres(t.lat, t.lon, clat, clon) <= 100) cells.add(`${ci + a}_${cj + b}`);
          }
      }
      let buildings = 0;
      for (const c of cells) buildings += density.counts[c] ?? 0;
      exposed = Math.round(buildings * PEOPLE_PER_BUILDING);
    }
    const done = scoped
      .filter((t) => t.resolvedAt !== undefined && t.resolvedAt <= at && t.resolvedAt > at - 30 * DAY)
      .map((t) => ((t.resolvedAt as number) - t.createdAt) / HOUR)
      .sort((a, b) => a - b);
    const median = done.length ? done[Math.floor(done.length / 2)] : null;
    const week = scoped.filter((t) => t.resolvedAt !== undefined && t.resolvedAt <= at && t.resolvedAt > at - 7 * DAY).length;
    return { open: open.length, overdue, exposed, median, week };
  }, [open, scoped, density, at]);

  /* ---------- monsoon simulator ---------- */
  const drains = useMemo(
    () => tickets.filter((t) => isOpenAt(t, at) && (t.cat === "blocked_drain" || t.cat === "stagnant_water")),
    [tickets, at],
  );
  const flood: Flood | null = useMemo(
    () => (monsoon && terrain ? floodModel(terrain, simRain, drains) : null),
    [monsoon, terrain, simRain, drains],
  );
  const overflow = useMemo(
    () => (flood && terrain ? drains.filter((t) => depthAt(terrain, flood, t.lat, t.lon) > 0.05) : []),
    [flood, terrain, drains],
  );
  const overflowIds = useMemo(() => new Set(overflow.map((t) => t.id)), [overflow]);
  const homesInWater = useMemo(() => {
    if (!flood || !terrain || !density) return 0;
    let n = 0;
    for (const [k, count] of Object.entries(density.counts)) {
      const [i, j] = k.split("_").map(Number);
      const lat = density.lat0 + (i + 0.5) * density.cell;
      const lon = density.lon0 + (j + 0.5) * density.cell;
      if (depthAt(terrain, flood, lat, lon) > 0.1) n += count;
    }
    return n;
  }, [flood, terrain, density]);
  const effRain = monsoon ? simRain : rainMm ?? 0;
  const isWaterRisk = (t: Ticket) =>
    (t.cat === "stagnant_water" || t.cat === "blocked_drain") && (ageHours(t, at) > 72 || overflowIds.has(t.id));

  /** One identical instrument per zone: load, lateness and breeding risk. */
  const meters = useMemo(() => {
    const wet = effRain >= 5;
    const rows = ZONE_IDS.map((z) => {
      const zOpen = tickets.filter((t) => t.zone === z && isOpenAt(t, at));
      const late = zOpen.filter((t) => isOverdue(t, at)).length;
      const water = zOpen.filter(isWaterRisk).length;
      const level = water >= 6 || (water >= 3 && wet) ? "High" : water >= 2 ? "Watch" : "Low";
      return { z, open: zOpen.length, late, water, level };
    });
    const max = Math.max(8, ...rows.map((r) => r.open));
    return rows.map((r) => ({ ...r, fill: r.open / max, lateShare: r.open ? r.late / r.open : 0 }));
    // isWaterRisk depends only on at and overflowIds
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets, at, effRain, overflowIds]);

  /* ---------- clean lanes, smart bins, planner, forecast ---------- */
  const scores: LaneScore[] = useMemo(() => (show.lanes && lanes ? laneScores(lanes, tickets, at) : []), [show.lanes, lanes, tickets, at]);
  const tierCounts = useMemo(() => {
    const c = { dirty: 0, watching: 0, week: 0, fortnight: 0, three: 0 } as Record<LaneTier, number>;
    for (const sc of scores) c[sc.tier]++;
    return c;
  }, [scores]);
  const laneScore = laneId === null ? null : (scores.find((x) => x.lane.i === laneId) ?? null);
  const binsNow: BinState[] = useMemo(
    () => (bins && routes ? binStates(bins, routes, density, binScans, binClock) : []),
    [bins, routes, density, binScans, binClock],
  );
  const activeBin = binsNow.find((b) => b.bin.id === binId) ?? null;
  useEffect(() => {
    if (binFlown.current || !activeBin || !mapRef.current) return;
    binFlown.current = true;
    const map = mapRef.current;
    const fly = () => map.flyTo({ center: [activeBin.bin.lon, activeBin.bin.lat], zoom: 16.4, pitch: 60, bearing: -20, duration: 1600 });
    if (map.loaded()) fly();
    else map.once("load", fly);
  }, [activeBin]);
  const fullBins = useMemo(
    () => (routes ? binsNow.filter((b) => b.fill >= 0.9).map((b) => ({ b, v: nearestVan(routes, b.bin.lat, b.bin.lon, binClock) })) : []),
    [binsNow, routes, binClock],
  );
  const binPlan = useMemo(
    () => (plan?.mode === "bin" && plan.bin && bins ? planBin(plan.bin, bins, density, tickets, at) : null),
    [plan, bins, density, tickets, at],
  );
  const shiftPlan = useMemo(() => {
    if (plan?.mode !== "shift" || !routes) return null;
    const confirmed = tickets.filter(
      (t) => t.cat === "missed_collection" && isOpenAt(t, at) && skippedLaneNear(routes, t.lat, t.lon)?.[4] === plan.van,
    ).length;
    return planShift(plan.van, routes, density, confirmed);
  }, [plan, routes, density, tickets, at]);
  const hotspots: Hotspot[] = useMemo(
    () => (show.forecast ? forecast(scoped, routes ? routes.lanes.filter((l) => !l[5]) : [], at, effRain) : []),
    [show.forecast, scoped, routes, at, effRain],
  );

  /* ---------- then and now ---------- */
  const thenAt = split ? at - split.daysAgo * DAY : at;
  const openThen = useMemo(() => (split ? scoped.filter((t) => isOpenAt(t, thenAt)) : []), [split, scoped, thenAt]);

  /* ---------- map ---------- */
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = new MlMap({
      container: mapEl.current,
      style: baseStyle(true),
      center: PILOT_CENTER,
      zoom: 13.5,
      pitch: 54,
      bearing: -18,
      maxPitch: 72,
      attributionControl: { compact: true, customAttribution: DATA_ATTRIBUTION },
    });
    map.addControl(new NavigationControl({ visualizePitch: true }), "bottom-right");
    const overlay = new MapboxOverlay({ interleaved: false, layers: [], effects: [lighting] });
    map.addControl(overlay);
    mapRef.current = map;
    overlayRef.current = overlay;
    return () => {
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
  }, []);

  const riskIndex = useMemo(() => buildRiskIndex(open, at), [open, at]);
  const riskThen = useMemo(() => buildRiskIndex(openThen, thenAt), [openThen, thenAt]);
  const staticLayers = useRef<Layer[]>([]);
  const animRef = useRef({ tickets, feed, alertSent, routes, showVans: show.vans, live, flood, terrain, overflow, binsNow, fullBins, showBins: show.bins });
  useEffect(() => {
    animRef.current = { tickets, feed, alertSent, routes, showVans: show.vans, live, flood, terrain, overflow, binsNow, fullBins, showBins: show.bins };
  });

  const shiftKey = plan?.mode === "shift" ? plan.van : null;
  useEffect(() => {
    if (!shiftKey || !routes) return;
    const ls = routes.lanes.filter((l) => !l[5] && l[4] === shiftKey);
    if (!ls.length) return;
    const lons = ls.flatMap((l) => [l[0], l[2]]);
    const lats = ls.flatMap((l) => [l[1], l[3]]);
    mapRef.current?.fitBounds(
      [
        [Math.min(...lons) - 0.002, Math.min(...lats) - 0.002],
        [Math.max(...lons) + 0.002, Math.max(...lats) + 0.002],
      ],
      { pitch: 50, duration: 1400, padding: { left: 380, right: 400, top: 90, bottom: 140 } },
    );
  }, [shiftKey, routes]);

  /* Planner: click to place the proposed bin, drag it to move it. */
  const planRef = useRef(plan);
  useEffect(() => {
    planRef.current = plan;
  });
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let dragging = false;
    const near = (e: { point: { x: number; y: number } }) => {
      const p = planRef.current;
      if (p?.mode !== "bin" || !p.bin) return false;
      const q = map.project([p.bin.lon, p.bin.lat]);
      return Math.hypot(q.x - e.point.x, q.y - e.point.y) < 30;
    };
    const place = (e: { lngLat: { lng: number; lat: number } }) =>
      setPlan((p) => (p?.mode === "bin" ? { ...p, bin: { lat: e.lngLat.lat, lon: e.lngLat.lng } } : p));
    const down = (e: MapMouseEvent) => {
      if (!near(e)) return;
      dragging = true;
      map.dragPan.disable();
      map.getCanvas().style.cursor = "grabbing";
    };
    const move = (e: MapMouseEvent) => {
      if (dragging) place(e);
      else map.getCanvas().style.cursor = near(e) ? "grab" : planRef.current?.mode === "bin" ? "crosshair" : "";
    };
    const up = () => {
      if (!dragging) return;
      dragging = false;
      map.dragPan.enable();
      map.getCanvas().style.cursor = "";
    };
    const click = (e: MapMouseEvent) => {
      if (planRef.current?.mode === "bin" && !near(e)) place(e);
    };
    map.on("mousedown", down);
    map.on("mousemove", move);
    map.on("mouseup", up);
    map.on("click", click);
    return () => {
      map.off("mousedown", down);
      map.off("mousemove", move);
      map.off("mouseup", up);
      map.off("click", click);
    };
  }, []);

  /* ---------- sunlight: real sun angle for Nagpur at the scrubber's time ---------- */
  const sunTs = Math.round(at / 600_000) * 600_000;
  const dayK = sunOn ? daylight(sunTs, PILOT_CENTER[1], PILOT_CENTER[0]) : 1;
  useEffect(() => {
    const overlay = overlayRef.current;
    const map = mapRef.current;
    if (!overlay) return;
    const setSat = (v: number) => {
      if (map?.getLayer("sat")) map.setPaintProperty("sat", "raster-brightness-max", v);
    };
    if (!sunOn) {
      overlay.setProps({ effects: [lighting] });
      setSat(0.72);
      return;
    }
    // Walls are lit from the real sun direction. deck.gl's cast shadows are experimental and drew
    // artifacts over 1.35 lakh roofs, so they stay off.
    const effect = new LightingEffect({
      ambient: new AmbientLight({
        color: [Math.round(150 + 105 * dayK), Math.round(170 + 85 * dayK), 255],
        intensity: 0.5 + 0.35 * dayK,
      }),
      sun: new SunLight({ timestamp: sunTs, color: [255, 228, 190], intensity: 2.2 * dayK }),
    });
    overlay.setProps({ effects: [effect] });
    setSat(0.22 + 0.53 * dayK);
  }, [sunOn, sunTs, dayK]);

  useEffect(() => {
    if (deepLinked.current || !selected || !mapRef.current) return;
    deepLinked.current = true;
    const map = mapRef.current;
    const fly = () =>
      map.flyTo({ center: [selected.lon, selected.lat], zoom: 17.4, pitch: 62, bearing: -24, duration: 1800, essential: true });
    if (map.loaded()) fly();
    else map.once("load", fly);
  }, [selected]);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    const buildingColor = (idx: RiskIndex) => (b: Building): [number, number, number, number] => {
      const base: [number, number, number, number] = b.small ? [184, 174, 152, 255] : [128, 132, 146, 255];
      if (!show.exposure) return base;
      const ci = Math.floor(b.lat / RISK_CELL);
      const cj = Math.floor(b.lon / RISK_CELL);
      let heat = 0;
      let days = 0;
      for (let a = -1; a <= 1; a++)
        for (let c = -1; c <= 1; c++) {
          const list = idx.get((ci + a) * 100000 + cj + c);
          if (!list) continue;
          for (const t of list) {
            const d = metres(b.lat, b.lon, t.lat, t.lon);
            if (d > 100) continue;
            const w = 1 - d / 130;
            if (w > heat) {
              heat = w;
              days = t.days;
            }
          }
        }
      if (heat === 0) return base;
      const k = Math.min(1, days / 3); // chrome on day 0, vermilion from day 3
      const hot = CHROME.map((c, i) => c + (VERMILION[i] - c) * k);
      return [
        base[0] + (hot[0] - base[0]) * heat,
        base[1] + (hot[1] - base[1]) * heat,
        base[2] + (hot[2] - base[2]) * heat,
        255,
      ];
    };

    // Then-and-now: the same city twice, clipped either side of a meridian the officer drags.
    const clip = new ClipExtension();
    const right = split ? { extensions: [clip], clipBounds: [split.lon, -90, 180, 90] as [number, number, number, number] } : {};
    const left = split ? { extensions: [clip], clipBounds: [-180, -90, split.lon, 90] as [number, number, number, number] } : {};
    const buildingsFor = (prefix: string, idx: RiskIndex, extra: object) =>
      tiles.map(
        (tile) =>
          new SolidPolygonLayer<Building>({
            id: `${prefix}-${tile.key}`,
            data: tile.data,
            getPolygon: (b) => b.ring,
            positionFormat: "XY",
            extruded: true,
            getElevation: (b) => b.h,
            getFillColor: buildingColor(idx),
            material: { ambient: 0.6, diffuse: 0.65, shininess: 6, specularColor: [30, 30, 30] },
            updateTriggers: { getFillColor: [idx, show.exposure] },
            ...extra,
          }),
      );
    const dots = (id: string, data: Ticket[], when: number, extra: object) =>
      new ScatterplotLayer<Ticket>({
        id,
        data,
        getPosition: (t) => [t.lon, t.lat, 16],
        getRadius: (t) => 7 + t.sev * 2,
        radiusMinPixels: 5,
        radiusMaxPixels: 17,
        stroked: true,
        getFillColor: (t) => [...CATEGORIES[t.cat].color, 255] as [number, number, number, number],
        getLineColor: (t) => (isOverdue(t, when) ? [215, 55, 43, 255] : [22, 19, 15, 255]),
        getLineWidth: (t) => (t.id === selectedId ? 4 : isOverdue(t, when) ? 2.5 : 1.5),
        lineWidthUnits: "pixels",
        parameters: { depthCompare: "always" },
        pickable: true,
        onClick: (i) => i.object && focus(i.object),
        updateTriggers: { getLineColor: [when], getLineWidth: [when, selectedId] },
        ...extra,
      });
    const night = sunOn ? 1 - dayK : 0;

    const layers: (Layer | false | null)[] = [
      ...buildingsFor("b", riskIndex, right),
      ...(split ? buildingsFor("then", riskThen, left) : []),
      night > 0.3 &&
        new ScatterplotLayer<Ticket>({
          id: "night-glow",
          data: open,
          getPosition: (t) => [t.lon, t.lat, 2],
          getRadius: 90,
          getFillColor: [242, 183, 5, Math.round(95 * night)],
          stroked: false,
          parameters: { depthCompare: "always" },
          updateTriggers: { getFillColor: [night] },
        }),
      show.columns &&
        new HexagonLayer<Ticket>({
          id: "columns",
          data: scoped.filter((t) => t.createdAt <= at && t.createdAt > at - 30 * DAY),
          getPosition: (t) => [t.lon, t.lat],
          radius: 70,
          extruded: true,
          elevationScale: 3,
          coverage: 0.8,
          opacity: 0.85,
          colorRange: [
            [250, 214, 102],
            [242, 183, 5],
            [232, 140, 30],
            [226, 96, 36],
            [215, 55, 43],
            [168, 36, 27],
          ],
          pickable: true,
        }),
      show.resolved &&
        new ScatterplotLayer<Ticket>({
          id: "resolved",
          data: scoped.filter((t) => t.resolvedAt !== undefined && t.resolvedAt <= at),
          getPosition: (t) => [t.lon, t.lat, 16],
          getRadius: 5,
          radiusMinPixels: 3,
          getFillColor: [43, 163, 120, 200],
          getLineColor: [22, 19, 15, 255],
          stroked: true,
          lineWidthMinPixels: 1,
          parameters: { depthCompare: "always" },
          pickable: true,
          onClick: (i) => i.object && focus(i.object),
        }),
      selected &&
        new ScatterplotLayer<Ticket>({
          id: "radius",
          data: [selected],
          getPosition: (t) => [t.lon, t.lat, 1],
          getRadius: 100,
          stroked: true,
          filled: true,
          getFillColor: [242, 183, 5, 28],
          getLineColor: [242, 183, 5, 255],
          lineWidthMinPixels: 2.5,
          parameters: { depthCompare: "always" },
        }),
      show.lanes &&
        new PathLayer<LaneScore>({
          id: "ribbons",
          data: scores,
          getPath: (x) => x.lane.path.map(([lon, lat]) => [lon, lat, 2] as [number, number, number]),
          getColor: (x) => [...TIER[x.tier].color, 235] as [number, number, number, number],
          getWidth: (x) => (x.lane.i === laneId ? 14 : 8),
          widthMinPixels: 3,
          capRounded: true,
          jointRounded: true,
          pickable: true,
          onClick: (i) => {
            if (!i.object) return;
            setSelectedId(null);
            setVanId(null);
            setAlertZone(null);
            setBinId(null);
            setLaneId(i.object.lane.i);
          },
          updateTriggers: { getWidth: [laneId] },
        }),
      show.forecast &&
        new ColumnLayer<Hotspot>({
          id: "forecast",
          data: hotspots,
          getPosition: (h) => [h.lon, h.lat],
          diskResolution: 4,
          angle: 45,
          radius: 42,
          extruded: true,
          getElevation: (h) => h.likelihood * 320,
          getFillColor: (h) => {
            const k = Math.min(1, Math.max(0, (h.likelihood - 0.3) / 0.6));
            return [242 + (215 - 242) * k, 183 + (55 - 183) * k, 5 + (43 - 5) * k, 225];
          },
          material: { ambient: 0.7, diffuse: 0.6 },
          pickable: true,
          onClick: (i) => i.object && mapRef.current?.flyTo({ center: [i.object.lon, i.object.lat], zoom: 16.5, pitch: 60, duration: 1500 }),
          transitions: { getElevation: { duration: 1400, enter: () => [0] } },
        }),
      plan?.mode === "bin" &&
        bins &&
        new ScatterplotLayer({
          id: "bin-reach",
          data: bins,
          getPosition: (b: { lon: number; lat: number }) => [b.lon, b.lat, 1],
          getRadius: 100,
          filled: true,
          stroked: true,
          getFillColor: [244, 241, 232, 28],
          getLineColor: [244, 241, 232, 170],
          lineWidthMinPixels: 1.5,
          parameters: { depthCompare: "always" },
        }),
      plan?.mode === "bin" &&
        plan.bin &&
        new ScatterplotLayer({
          id: "plan-bin-reach",
          data: [plan.bin],
          getPosition: (b: { lon: number; lat: number }) => [b.lon, b.lat, 1],
          getRadius: 100,
          filled: true,
          stroked: true,
          getFillColor: [242, 183, 5, 60],
          getLineColor: [242, 183, 5, 255],
          lineWidthMinPixels: 3,
          parameters: { depthCompare: "always" },
        }),
      plan?.mode === "bin" &&
        plan.bin &&
        new ColumnLayer({
          id: "plan-bin",
          data: [plan.bin],
          getPosition: (b: { lon: number; lat: number }) => [b.lon, b.lat],
          radius: 9,
          diskResolution: 20,
          extruded: true,
          getElevation: 30,
          getFillColor: [242, 183, 5, 255],
          getLineColor: [22, 19, 15, 255],
          material: { ambient: 0.8, diffuse: 0.5 },
        }),
      plan?.mode === "shift" &&
        shiftPlan &&
        new PathLayer<Lane>({
          id: "shift-lanes",
          data: shiftPlan.lanes,
          getPath: (l) => [
            [l[0], l[1], 4],
            [l[2], l[3], 4],
          ],
          getColor: [126, 211, 168, 255],
          getWidth: 12,
          widthMinPixels: 5,
          capRounded: true,
          parameters: { depthCompare: "always" },
        }),
      dots("open", open, at, split ? { ...right, clipByInstance: true } : {}),
      split &&
        dots("open-then", openThen, thenAt, {
          ...left,
          clipByInstance: true,
          // reports open then and cleared since get a green ring: the progress the split is meant to show
          getLineColor: (t: Ticket) => (t.resolvedAt !== undefined && t.resolvedAt <= at ? [43, 163, 120, 255] : [22, 19, 15, 255]),
          getLineWidth: (t: Ticket) => (t.resolvedAt !== undefined && t.resolvedAt <= at ? 4 : 1.5),
          updateTriggers: { getLineColor: [at], getLineWidth: [at] },
        }),
    ].filter(Boolean);

    if (show.vans && routes) {
      layers.splice(
        tiles.length,
        0,
        new PathLayer<Lane>({
          id: "lanes-driven",
          data: routes.lanes.filter((l) => l[5]),
          getPath: (l) => [
            [l[0], l[1], 3],
            [l[2], l[3], 3],
          ],
          getColor: [244, 241, 232, 120],
          getWidth: 3,
          widthMinPixels: 1.5,
          capRounded: true,
          parameters: { depthCompare: "always" },
        }),
        new PathLayer<Lane, PathStyleExtensionProps<Lane>>({
          id: "lanes-skipped",
          data: routes.lanes.filter((l) => !l[5]),
          getPath: (l) => [
            [l[0], l[1], 3],
            [l[2], l[3], 3],
          ],
          getColor: [215, 55, 43, 255],
          getWidth: 6,
          widthMinPixels: 3,
          getDashArray: [3, 2],
          dashJustified: true,
          extensions: [new PathStyleExtension({ dash: true })],
          parameters: { depthCompare: "always" },
          pickable: true,
        }),
      );
    }
    staticLayers.current = layers.filter((l): l is Layer => Boolean(l));
    // focus is stable enough for click handlers; re-binding on every render is unnecessary.
  }, [tiles, riskIndex, open, scoped, show, selectedId, selected, at, routes, split, riskThen, openThen, thenAt, sunOn, dayK, scores, laneId, hotspots, plan, bins, shiftPlan]);

  /* Moving things: vans, their trails, report ripples, clean-up pulses and alert waves. ~30 fps. */
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      const overlay = overlayRef.current;
      if (!overlay || ts - last < 33) return;
      last = ts;
      const t = Date.now();
      const a = animRef.current;
      const dyn: Layer[] = [];
      if (a.flood && a.terrain) {
        dyn.push(
          new BitmapLayer({
            id: "flood",
            image: a.flood.image,
            bounds: a.terrain.bounds,
            opacity: 0.8 + 0.12 * Math.sin(t / 650),
          }) as unknown as Layer,
        );
        type Drip = { lon: number; lat: number; k: number };
        const drips: Drip[] = a.overflow.flatMap((d, i) =>
          [0, 0.5].map((delay) => ({ lon: d.lon, lat: d.lat, k: (t / 2200 + i * 0.137 + delay) % 1 })),
        );
        dyn.push(
          new ScatterplotLayer<Drip>({
            id: "overflow",
            data: drips,
            getPosition: (r) => [r.lon, r.lat, 3],
            getRadius: (r) => 8 + r.k * 70,
            stroked: true,
            filled: false,
            getLineColor: (r) => [126, 186, 255, Math.round(255 * (1 - r.k))],
            lineWidthMinPixels: 2.5,
            parameters: { depthCompare: "always" },
          }) as unknown as Layer,
        );
      }
      if (a.showBins && a.binsNow.length) {
        const pulse = 0.5 + 0.5 * Math.sin(t / 260);
        dyn.push(
          new ColumnLayer<BinState>({
            id: "bins",
            data: a.binsNow,
            getPosition: (b) => [b.bin.lon, b.bin.lat],
            radius: 16,
            radiusUnits: "meters",
            diskResolution: 16,
            extruded: true,
            getElevation: (b) => 10 + Math.min(1.3, b.fill) * 70,
            getFillColor: (b) =>
              b.fill >= 1
                ? [215, 55, 43, 160 + 95 * pulse]
                : b.fill >= 0.9
                  ? [217, 154, 0, 255]
                  : b.fill >= 0.6
                    ? [242, 183, 5, 255]
                    : [126, 211, 168, 255],
            material: { ambient: 0.75, diffuse: 0.55 },
            pickable: true,
            onClick: (i) => {
              if (!i.object) return;
              setSelectedId(null);
              setVanId(null);
              setAlertZone(null);
              setLaneId(null);
              setBinId(i.object.bin.id);
              mapRef.current?.flyTo({ center: [i.object.bin.lon, i.object.bin.lat], zoom: 16.6, pitch: 60, duration: 1500 });
            },
          }) as unknown as Layer,
        );
        dyn.push(
          new ScatterplotLayer<BinState>({
            id: "bin-dots",
            data: a.binsNow,
            getPosition: (b) => [b.bin.lon, b.bin.lat, 2],
            getRadius: 10,
            radiusMinPixels: 4.5,
            radiusMaxPixels: 9,
            stroked: true,
            lineWidthMinPixels: 1.5,
            getLineColor: [22, 19, 15, 255],
            getFillColor: (b) => (b.fill >= 1 ? [215, 55, 43, 255] : b.fill >= 0.9 ? [217, 154, 0, 255] : b.fill >= 0.6 ? [242, 183, 5, 255] : [126, 211, 168, 255]),
            parameters: { depthCompare: "always" },
            pickable: true,
            onClick: (i) => {
              if (!i.object) return;
              setSelectedId(null);
              setVanId(null);
              setAlertZone(null);
              setLaneId(null);
              setBinId(i.object.bin.id);
              mapRef.current?.flyTo({ center: [i.object.bin.lon, i.object.bin.lat], zoom: 16.6, pitch: 60, duration: 1500 });
            },
          }) as unknown as Layer,
        );
        type Nudge = { from: [number, number]; to: [number, number] };
        const nudges: Nudge[] = a.fullBins.map((f) => ({ from: [f.v.lon, f.v.lat], to: [f.b.bin.lon, f.b.bin.lat] }));
        dyn.push(
          new PathLayer<Nudge, PathStyleExtensionProps<Nudge>>({
            id: "nudges",
            data: nudges,
            getPath: (n) => [
              [...n.from, 10],
              [...n.to, 10],
            ],
            getColor: [215, 55, 43, 230],
            getWidth: 5,
            widthMinPixels: 2.5,
            getDashArray: [4, 3],
            dashJustified: false,
            getOffset: 0,
            extensions: [new PathStyleExtension({ dash: true })],
            parameters: { depthCompare: "always" },
          }) as unknown as Layer,
        );
      }
      if (follow.current && a.routes) {
        const f = follow.current;
        const v = a.routes.vans[f.index];
        const head = positionAt(v, vanDistance(v, t, f.index));
        mapRef.current?.jumpTo({ center: [head.lon, head.lat], bearing: f.bearing + (t - f.start) / 260 });
      }
      if (a.showVans && a.routes) {
        const vans = a.routes.vans;
        vans.forEach((v, i) => {
          dyn.push(
            new TripsLayer<Van>({
              id: `trail-${v.id}`,
              data: [v],
              getPath: (x) => x.path,
              getTimestamps: (x) => x.cum,
              currentTime: vanDistance(v, t, i),
              trailLength: 700,
              getColor: [242, 183, 5],
              widthMinPixels: 5,
              capRounded: true,
              jointRounded: true,
              fadeTrail: true,
              parameters: { depthCompare: "always" },
            }) as unknown as Layer,
          );
        });
        const heads = vans.map((v, i) => ({ v, ...positionAt(v, vanDistance(v, t, i)) }));
        dyn.push(
          new ScatterplotLayer<(typeof heads)[number]>({
            id: "van-heads",
            data: heads,
            getPosition: (h) => [h.lon, h.lat, 12],
            getRadius: 16,
            radiusMinPixels: 8,
            radiusMaxPixels: 16,
            getFillColor: [242, 183, 5, 255],
            getLineColor: [22, 19, 15, 255],
            stroked: true,
            lineWidthMinPixels: 2.5,
            parameters: { depthCompare: "always" },
            pickable: true,
            onClick: (i) => {
              if (!i.object) return;
              setSelectedId(null);
              setAlertZone(null);
              setVanId(i.object.v.id);
            },
          }) as unknown as Layer,
          new TextLayer<(typeof heads)[number]>({
            id: "van-labels",
            data: heads,
            getPosition: (h) => [h.lon, h.lat, 14],
            getText: (h) => h.v.id,
            getSize: 13,
            getColor: [22, 19, 15, 255],
            background: true,
            getBackgroundColor: [242, 183, 5, 255],
            backgroundPadding: [5, 2],
            getPixelOffset: [0, -22],
            fontFamily: "Teko, Mukta, sans-serif",
            fontWeight: 600,
            parameters: { depthCompare: "always" },
          }) as unknown as Layer,
        );
      }
      if (a.live) {
        // a new report drops in: two expanding chrome rings for 6 s; a clean-up sends a green pulse
        const fresh = a.tickets.filter((x) => t - x.createdAt < 6000 && t >= x.createdAt);
        const cleared = a.feed.filter((e) => e.kind === "cleared" && t - e.at < 4000 && e.lat !== undefined);
        type Ring = { lon: number; lat: number; k: number; color: [number, number, number]; reach: number };
        const rings: Ring[] = [
          ...fresh.flatMap((x) =>
            [0, 0.35].map((delay): Ring => ({ lon: x.lon, lat: x.lat, k: (t - x.createdAt) / 6000 - delay, color: [242, 183, 5], reach: 140 })),
          ),
          ...cleared.map((e): Ring => ({ lon: e.lon as number, lat: e.lat as number, k: (t - e.at) / 4000, color: [126, 211, 168], reach: 140 })),
          ...Object.values(a.alertSent).flatMap((al) =>
            t - al.at < 9000
              ? al.points.flatMap(([lon, lat]) =>
                  [0, 0.33, 0.66].map((delay): Ring => ({ lon, lat, k: (((t - al.at) / 3000) % 1) - delay, color: [242, 183, 5], reach: 300 })),
                )
              : [],
          ),
        ].filter((r) => r.k > 0 && r.k < 1);
        dyn.push(
          new ScatterplotLayer<Ring>({
            id: "ripples",
            data: rings,
            getPosition: (r) => [r.lon, r.lat, 4],
            getRadius: (r) => 10 + r.k * r.reach,
            stroked: true,
            filled: false,
            getLineColor: (r) => [...r.color, Math.round(255 * (1 - r.k))] as [number, number, number, number],
            lineWidthMinPixels: 2.5,
            parameters: { depthCompare: "always" },
          }) as unknown as Layer,
        );
      }
      overlay.setProps({
        layers: [...staticLayers.current, ...dyn],
        getTooltip: ({ object, layer }: { object?: unknown; layer?: { id: string } | null }) => {
          if (!object || !layer) return null;
          if (layer.id === "columns") {
            const o = object as { count?: number; points?: unknown[] };
            return { text: `${o.count ?? o.points?.length ?? ""} reports here in 30 days` };
          }
          if (layer.id === "van-heads") {
            const h = object as { v: Van };
            return { text: `Collection van ${h.v.id} · ${h.v.name}` };
          }
          if (layer.id === "lanes-skipped") {
            const l = object as Lane;
            return { text: `Lane skipped by van ${l[4]} today` };
          }
          if (layer.id === "bins" || layer.id === "bin-dots") {
            const b = object as BinState;
            return { text: `Bin ${b.bin.id} · ${Math.round(Math.min(1, b.fill) * 100)}% full` };
          }
          if (layer.id === "ribbons") {
            const x = object as LaneScore;
            return { text: x.tier === "dirty" ? "Lane with an open complaint" : `Lane clean for ${Math.floor(x.days)} days` };
          }
          if (layer.id === "forecast") {
            const h = object as Hotspot;
            return { text: `${Math.round(h.likelihood * 100)}% likely next week · ${h.driver}` };
          }
          if (layer.id === "open-then") {
            const tk = object as Ticket;
            return { text: `Then: ${CATEGORIES[tk.cat].label} · ${tk.locality}` };
          }
          const tk = object as Ticket;
          return { text: `${CATEGORIES[tk.cat].label} · ${tk.locality}` };
        },
      });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  function focus(t: Ticket) {
    setVanId(null);
    setAlertZone(null);
    setSelectedId(t.id);
    mapRef.current?.flyTo({
      center: [t.lon, t.lat],
      zoom: 17.4,
      pitch: 62,
      bearing: ((t.lon * 1e4) % 80) - 40,
      duration: 1800,
      essential: true,
    });
  }
  function pickFeed(e: FeedEvent) {
    const t = tickets.find((x) => x.id === e.ticketId);
    if (t) focus(t);
    else if (e.lat !== undefined && e.lon !== undefined)
      mapRef.current?.flyTo({ center: [e.lon, e.lat], zoom: 15.5, pitch: 55, duration: 1600 });
  }
  function openAlert(z: ZoneId) {
    setSelectedId(null);
    setVanId(null);
    setAlertZone(z);
  }
  function overview() {
    setSelectedId(null);
    setVanId(null);
    setAlertZone(null);
    mapRef.current?.flyTo({ center: PILOT_CENTER, zoom: 13.5, pitch: 54, bearing: -18, duration: 1400 });
  }

  function toggleSplit() {
    if (split) return setSplit(null);
    const map = mapRef.current;
    setSplit({ daysAgo: 14, lon: map ? map.getCenter().lng : PILOT_CENTER[0] });
    map?.easeTo({ bearing: 0, pitch: Math.min(map.getPitch(), 48), duration: 900 });
  }

  /* ---------- cinematic tour: a scripted 90-second flight for the projector ---------- */
  function endTour() {
    tourToken.current++;
    follow.current = null;
    setTour(null);
    setMonsoon(false);
    setAlertZone(null);
    setSelectedId(null);
    setVanId(null);
    overview();
  }

  async function runTour() {
    const map = mapRef.current;
    if (!map || !routes) return;
    const token = ++tourToken.current;
    const alive = () => {
      if (tourToken.current !== token) throw new Error("stopped");
    };
    const sleep = async (ms: number) => {
      await new Promise((r) => setTimeout(r, ms));
      alive();
    };
    const fly = async (opts: Parameters<MlMap["flyTo"]>[0]) => {
      await new Promise<void>((r) => {
        map.once("moveend", () => r());
        map.flyTo({ ...opts, essential: true });
      });
      alive();
    };
    const total = 8;
    const say = (step: number, caption: string, sub: string) => setTour({ step, total, caption, sub });
    try {
      setSplit(null);
      setMonsoon(false);
      setPlaying(false);
      setOffsetH(WINDOW_H);
      setSelectedId(null);
      setVanId(null);
      setAlertZone(null);
      setShow((s) => ({ ...s, exposure: true, vans: true, columns: false, resolved: false }));

      say(1, "1,35,721 real roofs. Three NMC zones.", "Gandhibagh, Lakadganj and Ashi Nagar, built from satellite-mapped building footprints.");
      await fly({ center: PILOT_CENTER, zoom: 13.3, pitch: 50, bearing: -32, duration: 2500 });
      map.easeTo({ bearing: 8, duration: 6000, easing: (x) => x });
      await sleep(6000);

      say(2, "Homes beside open waste glow.", "Mominpura, Gandhibagh zone. Yellow is fresh; red has waited three days or more.");
      await fly({ center: [79.0985, 21.1575], zoom: 16.4, pitch: 62, bearing: -20, duration: 4000 });
      map.easeTo({ bearing: 22, duration: 6000, easing: (x) => x });
      await sleep(6000);

      const gi = Math.max(0, routes.vans.findIndex((v) => v.id === "GB-1"));
      const gv = routes.vans[gi];
      const head = positionAt(gv, vanDistance(gv, Date.now() + 2500, gi));
      say(3, "Ghanta gaadi GB-1 on its round.", "Real OpenStreetMap roads. The GPS is simulated until the vendor's feed is connected.");
      await fly({ center: [head.lon, head.lat], zoom: 17, pitch: 64, duration: 2500 });
      follow.current = { index: gi, start: Date.now(), bearing: map.getBearing() };
      await sleep(9000);
      follow.current = null;

      const confirmed = tickets
        .filter((t) => t.cat === "missed_collection" && isOpenAt(t, Date.now()))
        .map((t) => ({ t, lane: skippedLaneNear(routes, t.lat, t.lon) }))
        .find((x) => x.lane);
      if (confirmed?.lane) {
        say(4, "“The truck did not come.” The route agrees.", `Van ${confirmed.lane[4]} skipped this lane today, so the complaint is confirmed without a site visit.`);
        focus(confirmed.t);
        await sleep(7000);
        say(5, "Each van lists the complaints its route confirms.", "Round progress, lanes driven and lanes skipped, for every ghanta gaadi.");
        setSelectedId(null);
        setVanId(confirmed.lane[4]);
        await sleep(5500);
        setVanId(null);
      }

      const cleared = tickets
        .filter((t) => t.status === "resolved" && t.resolvedAt !== undefined && t.resolvedAt > Date.now() - 5 * DAY)
        .sort((a, b) => peopleExposed(density, b) - peopleExposed(density, a))[0];
      if (cleared) {
        setShow((s) => ({ ...s, resolved: true }));
        say(6, "Cleared, with proof from the spot.", "A job closes only when the after-photo is taken within 50 m. The resident can reopen it.");
        focus(cleared);
        await sleep(6500);
      }

      setSelectedId(null);
      setShow((s) => ({ ...s, resolved: false }));
      say(7, "Now add the monsoon.", "Rain pools in the low lanes first, and every blocked drain overflows into the homes around it.");
      await fly({ center: [79.148, 21.158], zoom: 14.4, pitch: 55, bearing: -12, duration: 3000 });
      setSimRain(0);
      setMonsoon(true);
      for (let r = 10; r <= 120; r += 10) {
        await sleep(420);
        setSimRain(r);
      }
      await sleep(3500);

      say(8, "One tap warns the households around the water.", "In Marathi, by SMS, WhatsApp and the van's loudspeaker, before the mosquitoes breed.");
      openAlert("ashinagar");
      await sleep(7500);
      endTour();
    } catch {
      // stopped by the presenter
    }
  }

  const buildingCount = tiles.reduce((n, t) => n + t.data.length, 0);
  const activeVan = routes && vanId ? (() => {
    const index = routes.vans.findIndex((v) => v.id === vanId);
    return index >= 0 ? { van: routes.vans[index], index } : null;
  })() : null;
  const alertTargets = alertZone
    ? tickets.filter((t) => t.zone === alertZone && isOpenAt(t, at) && isWaterRisk(t))
    : [];
  const alertHouseholds = (() => {
    if (!density || !alertTargets.length) return 0;
    const cells = new Set<string>();
    for (const t of alertTargets) {
      const ci = Math.floor((t.lat - density.lat0) / density.cell);
      const cj = Math.floor((t.lon - density.lon0) / density.cell);
      for (let a = -7; a <= 7; a++)
        for (let b = -7; b <= 7; b++) {
          const clat = density.lat0 + (ci + a + 0.5) * density.cell;
          const clon = density.lon0 + (cj + b + 0.5) * density.cell;
          if (metres(t.lat, t.lon, clat, clon) <= 300) cells.add(`${ci + a}_${cj + b}`);
        }
    }
    let n = 0;
    for (const c of cells) n += density.counts[c] ?? 0;
    return n;
  })();
  const feedNow = useClock(1);
  const atLabel = new Date(at).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric" });

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-night-deep text-letter">
      <div className="absolute inset-0">
        <div ref={mapEl} className="h-full w-full" />
      </div>

      {split && mapRef.current && (
        <SplitDivider
          map={mapRef.current}
          lon={split.lon}
          onLon={(lon) => setSplit((s) => (s ? { ...s, lon } : s))}
          thenLabel={`${split.daysAgo} days ago · ${openThen.length} open, ${openThen.filter((t) => t.resolvedAt !== undefined && t.resolvedAt <= at).length} cleared since`}
          nowLabel={`${live ? "Now" : atLabel} · ${open.length} open`}
        />
      )}

      {tour && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[150px] z-20 flex justify-center px-4">
          <div key={tour.step} className="tour-card max-w-[760px] rounded-[4px] bg-ink/90 px-6 pb-4 pt-3 shadow-[0_18px_40px_rgb(0_0_0/0.55)]">
            <div className="flex items-center gap-3">
              <span className="sign rounded-[3px] bg-chrome px-2 pb-0 pt-1 text-[16px] text-ink">
                {tour.step} / {tour.total}
              </span>
              <span className="flex flex-1 gap-1" aria-hidden>
                {Array.from({ length: tour.total }, (_, i) => (
                  <span key={i} className={`h-[4px] flex-1 rounded-full ${i < tour.step ? "bg-chrome" : "bg-letter/20"}`} />
                ))}
              </span>
            </div>
            <p className="painted mt-2 text-[30px] leading-tight text-chrome">{tour.caption}</p>
            <p className="mt-1 text-[16px] leading-snug text-letter/85">{tour.sub}</p>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col">
        {/* ---------- top board: wordmark + one continuous tally ---------- */}
        <header className="pointer-events-auto grain flex flex-wrap items-stretch border-b-[3px] border-chrome bg-night">
          <div className="flex items-center gap-4 px-5 py-3">
            <Link href="/" className="painted text-[24px] text-chrome">
              SwachhGrid
            </Link>
            <span className="sign text-[22px] text-letter/80 max-xl:hidden">Command centre</span>
            <span
              className={`sign rounded-[3px] px-2.5 pb-0.5 pt-1.5 text-[18px] ${live ? "bg-board text-letter" : "bg-chrome text-ink"}`}
              aria-live="polite"
            >
              {live ? "● Live" : atLabel}
            </span>
          </div>
          <dl className="flex flex-1 flex-wrap items-stretch divide-x-2 divide-night-line border-l-2 border-night-line">
            <Tally label="open reports" value={kpi.open} />
            <Tally label="past deadline" value={kpi.overdue} tone={kpi.overdue ? "text-vermilion" : undefined} />
            <Tally label="people beside open waste (est.)" value={kpi.exposed.toLocaleString("en-IN")} tone="text-chrome" />
            <Tally label="median time to clear" value={kpi.median === null ? "–" : fmtAge(kpi.median)} />
            <Tally label="cleared in 7 days" value={kpi.week} />
          </dl>
          <nav className="flex items-center gap-4 px-5 text-[14px] font-bold max-lg:hidden">
            <button
              onClick={() => (tour ? endTour() : runTour())}
              className={`sign flex items-center gap-2 rounded-[3px] px-3 pb-0.5 pt-1.5 text-[18px] ${tour ? "bg-vermilion text-letter" : "bg-chrome text-ink hover:bg-chrome-deep"}`}
            >
              {tour ? <Square size={14} fill="currentColor" /> : <Film size={16} />}
              {tour ? "Stop tour" : "Play tour"}
            </button>
            <Link href="/report" className="hover:text-chrome max-[1560px]:hidden">
              Resident app
            </Link>
            <Link href="/worker" className="hover:text-chrome max-[1560px]:hidden">
              Crew app
            </Link>
          </nav>
        </header>

        <div className="flex min-h-0 flex-1 items-stretch gap-3 p-3">
          {/* ---------- queue board ---------- */}
          <aside className="pointer-events-auto grain flex w-[350px] shrink-0 flex-col rounded-[6px] bg-night shadow-[0_14px_36px_rgb(0_0_0/0.5)] max-md:hidden">
            <div className="flex gap-1 p-2" role="tablist" aria-label="Zone">
              {(["all", ...ZONE_IDS] as const).map((z) => (
                <button
                  key={z}
                  role="tab"
                  aria-selected={zone === z}
                  onClick={() => setZone(z)}
                  className={`sign flex-1 rounded-[3px] pb-1 pt-2 text-[17px] transition-colors ${
                    zone === z ? "bg-chrome text-ink" : "text-letter/70 hover:bg-night-line hover:text-letter"
                  }`}
                >
                  {z === "all" ? "All" : ZONES[z].name}
                </button>
              ))}
            </div>
            <div className="flex items-baseline justify-between border-y-2 border-night-line px-4 pb-1.5 pt-2.5">
              <h2 className="sign text-[22px] text-chrome">Priority queue</h2>
              <span className="text-[12px] font-semibold text-letter/60">people × days open</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {queue.slice(0, 80).map(({ t, exposed }, i) => {
                const over = isOverdue(t, at);
                const fresh = t.source === "user" && Date.now() - t.createdAt < 120_000;
                return (
                  <button
                    key={t.id}
                    onClick={() => focus(t)}
                    className={`grid w-full grid-cols-[1.9rem_1fr_auto] items-baseline gap-x-2 border-b border-dashed border-night-line px-4 py-2.5 text-left transition-colors hover:bg-night-line/70 ${
                      t.id === selectedId ? "bg-night-line" : ""
                    } ${fresh ? "arrive" : ""}`}
                  >
                    <span className="sign tabular text-[22px] text-letter/45">{i + 1}</span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: `rgb(${CATEGORIES[t.cat].color.join(",")})` }} />
                        <span className="truncate text-[15px] font-bold">{CATEGORIES[t.cat].label}</span>
                      </span>
                      <span className="block truncate text-[13px] text-letter/60">
                        {t.locality} · {ZONES[t.zone].name}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="sign tabular block text-[20px] text-chrome">~{exposed.toLocaleString("en-IN")}</span>
                      <span className={`sign tabular block text-[16px] ${over ? "text-vermilion" : "text-letter/60"}`}>
                        {fmtAge(ageHours(t, at))}
                        {over ? " late" : ""}
                      </span>
                    </span>
                  </button>
                );
              })}
              {queue.length === 0 && <p className="p-6 text-center text-[14px] text-letter/60">No open reports at this moment.</p>}
            </div>

            {/* zone meters: one identical instrument per zone */}
            <div className="border-t-2 border-night-line px-4 pb-4 pt-3">
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="sign text-[20px] text-chrome">Zones</h2>
                <span className="flex items-center gap-1 text-[12px] font-semibold text-letter/60">
                  <CloudRain size={13} />{" "}
                  {monsoon ? <span className="text-[#7EAADE]">{simRain} mm rain, simulated</span> : rainMm === null ? "rain unavailable" : `${rainMm} mm rain, last 72 h`}
                </span>
              </div>
              <ul className="space-y-2">
                {meters.map((m) => (
                  <li key={m.z} className="grid grid-cols-[6.2rem_1fr_auto] items-center gap-x-3">
                    <span className="truncate text-[13px] font-bold">{ZONES[m.z].name}</span>
                    <span className="flex h-[10px] overflow-hidden rounded-[2px] bg-night-line" aria-hidden>
                      <span className="h-full bg-chrome" style={{ width: `${m.fill * (1 - m.lateShare) * 100}%` }} />
                      <span className="h-full bg-vermilion" style={{ width: `${m.fill * m.lateShare * 100}%` }} />
                    </span>
                    <span className="sign tabular text-[16px]">
                      {m.open} <span className="text-vermilion">/ {m.late}</span>
                    </span>
                    <span className="col-start-2 col-end-4 flex items-center justify-between gap-2 text-[12px] text-letter/60">
                      <span>
                        Breeding risk{" "}
                        <span className={`font-bold ${m.level === "High" ? "text-vermilion" : m.level === "Watch" ? "text-chrome" : "text-letter"}`}>
                          {m.level}
                        </span>{" "}
                        · {m.water} water
                      </span>
                      {m.level !== "Low" && (
                        <button
                          onClick={() => openAlert(m.z)}
                          className={`sign rounded-[3px] px-2 pb-0 pt-1 text-[14px] ${alertSent[m.z] ? "bg-night-line text-letter/70" : "bg-chrome text-ink hover:bg-chrome-deep"} ${m.level === "High" && !alertSent[m.z] ? "alert-pulse" : ""}`}
                        >
                          {alertSent[m.z] ? "Alert sent" : "Alert"}
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-letter/50">Bar: open reports, red share past deadline.</p>
            </div>
          </aside>

          <div className="ml-auto flex min-h-0 w-[360px] max-w-[calc(100vw-24px)] flex-col items-stretch gap-3">
            {/* ---------- layer switches ---------- */}
            <div className="pointer-events-auto grain grid grid-cols-2 gap-x-1 rounded-[6px] bg-night p-1.5 shadow-[0_14px_36px_rgb(0_0_0/0.5)]">
              <Switch on={show.exposure} onClick={() => setShow((s) => ({ ...s, exposure: !s.exposure }))}>
                Homes near waste
              </Switch>
              <Switch on={show.vans} onClick={() => setShow((s) => ({ ...s, vans: !s.vans }))}>
                Vans
              </Switch>
              <Switch on={show.columns} onClick={() => setShow((s) => ({ ...s, columns: !s.columns }))}>
                Chronic spots
              </Switch>
              <Switch on={show.resolved} onClick={() => setShow((s) => ({ ...s, resolved: !s.resolved }))}>
                Cleared
              </Switch>
              <Switch on={show.bins} onClick={() => setShow((s) => ({ ...s, bins: !s.bins }))}>
                Smart bins
              </Switch>
              <Switch
                on={show.lanes}
                onClick={() => {
                  setLaneId(null);
                  setShow((s) => ({ ...s, lanes: !s.lanes }));
                }}
              >
                Clean lanes
              </Switch>
              <Switch on={show.forecast} onClick={() => setShow((s) => ({ ...s, forecast: !s.forecast }))}>
                Forecast
              </Switch>
              <Switch on={monsoon} onClick={() => setMonsoon((m) => !m)}>
                Monsoon
              </Switch>
              <Switch on={sunOn} onClick={() => setSunOn((s) => !s)}>
                Sun and night
              </Switch>
              <Switch on={!!split} onClick={toggleSplit}>
                Then and now
              </Switch>
              {monsoon && (
                <div className="col-span-2 mx-1.5 mb-1.5 rounded-[4px] bg-night-deep px-3 pb-3 pt-2">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[12px] font-semibold text-letter/60">Rain in one day</span>
                    <span className="sign tabular text-[22px] text-[#7EAADE]">{simRain} mm</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={150}
                    step={5}
                    value={simRain}
                    onChange={(e) => setSimRain(Number(e.target.value))}
                    className="scrub rain w-full"
                    aria-label="Simulated rainfall in millimetres"
                  />
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div>
                      <div className="sign tabular text-[22px] text-letter">{terrain ? `~${(Math.round((homesInWater * PEOPLE_PER_BUILDING) / 100) * 100).toLocaleString("en-IN")}` : "…"}</div>
                      <div className="text-[11px] leading-tight text-letter/60">people in waterlogged lanes (est.)</div>
                    </div>
                    <div>
                      <div className="sign tabular text-[22px] text-[#7EAADE]">{overflow.length}</div>
                      <div className="text-[11px] leading-tight text-letter/60">open drain and water reports now flooding</div>
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] leading-snug text-letter/50">
                    Simulation, not a forecast: SRTM terrain lowness plus open blocked-drain reports.
                  </p>
                </div>
              )}
              {sunOn && (
                <p className="col-span-2 mx-3 mb-1.5 text-[12px] text-letter/60">
                  Real sun angle at {new Date(sunTs).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}. Scrub or replay to
                  see day and night.
                </p>
              )}
              {split && (
                <div className="col-span-2 mx-3 mb-1.5 flex items-center gap-1 text-[12px] text-letter/60">
                  Then:
                  {[7, 14, 21, 28].map((d) => (
                    <button
                      key={d}
                      onClick={() => setSplit((s) => (s ? { ...s, daysAgo: d } : s))}
                      className={`sign rounded-[3px] px-2 pb-0 pt-1 text-[15px] ${split.daysAgo === d ? "bg-chrome text-ink" : "bg-night-line text-letter/80"}`}
                    >
                      {d}
                    </button>
                  ))}
                  <span>days ago</span>
                </div>
              )}
              <button
                onClick={() => {
                  setSelectedId(null);
                  setVanId(null);
                  setAlertZone(null);
                  setBinId(null);
                  if (plan) return setPlan(null);
                  const spot = bins ? suggestBin(bins, tickets, at) : null;
                  setPlan({ mode: "bin", bin: spot, van: "GB-1" });
                  if (spot) mapRef.current?.flyTo({ center: [spot.lon, spot.lat], zoom: 16, pitch: 55, duration: 1600 });
                }}
                className={`sign mt-1 flex items-center justify-center gap-2 rounded-[3px] px-3 pb-0.5 pt-1.5 text-[17px] ${plan ? "bg-vermilion text-letter" : "bg-chrome text-ink hover:bg-chrome-deep"}`}
              >
                <ClipboardList size={15} /> {plan ? "Close planner" : "What-if planner"}
              </button>
              <button onClick={overview} className="mt-1 flex items-center justify-center gap-2 rounded-[3px] px-3 py-1.5 text-[13px] font-bold text-letter/80 hover:bg-night-line">
                <Crosshair size={15} /> Whole pilot area
              </button>
            </div>

            {/* ---------- report detail ---------- */}
            <aside className="pointer-events-auto grain flex min-h-0 flex-1 flex-col overflow-y-auto rounded-[6px] bg-night shadow-[0_14px_36px_rgb(0_0_0/0.5)]">
              {selected ? (
                <ReportDetail
                  t={selected}
                  at={at}
                  exposed={peopleExposed(density, selected)}
                  onClose={() => setSelectedId(null)}
                  onPatch={(p) => patch(selected.id, p)}
                  routeCheck={routes && selected.cat === "missed_collection" ? skippedLaneNear(routes, selected.lat, selected.lon) : undefined}
                  onVan={(id) => {
                    setSelectedId(null);
                    setVanId(id);
                  }}
                />
              ) : alertZone ? (
                <AlertPanel
                  zone={alertZone}
                  level={meters.find((m) => m.z === alertZone)?.level ?? "Watch"}
                  waterReports={alertTargets}
                  households={alertHouseholds}
                  sentAt={alertSent[alertZone]?.at ?? null}
                  onClose={() => setAlertZone(null)}
                  onSend={() => {
                    const points = alertTargets.map((t) => [t.lon, t.lat] as [number, number]);
                    setAlertSent((m) => ({ ...m, [alertZone]: { at: Date.now(), points } }));
                    useStore.getState().log({
                      kind: "alert",
                      text: `Breeding alert sent to ~${alertHouseholds.toLocaleString("en-IN")} households in ${ZONES[alertZone].name}`,
                      zone: alertZone,
                      lat: points[0]?.[1],
                      lon: points[0]?.[0],
                    });
                    if (points.length) {
                      const lons = points.map((p) => p[0]);
                      const lats = points.map((p) => p[1]);
                      mapRef.current?.fitBounds(
                        [
                          [Math.min(...lons) - 0.004, Math.min(...lats) - 0.004],
                          [Math.max(...lons) + 0.004, Math.max(...lats) + 0.004],
                        ],
                        { pitch: 50, duration: 1500, padding: { left: 380, right: 400, top: 80, bottom: 120 } },
                      );
                    }
                  }}
                />
              ) : activeVan && routes ? (
                <VanPanel
                  van={activeVan.van}
                  index={activeVan.index}
                  routes={routes}
                  tickets={tickets}
                  now={clock}
                  onClose={() => setVanId(null)}
                  onPick={focus}
                />
              ) : activeBin ? (
                <BinPanel
                  state={activeBin}
                  nudge={fullBins.find((f) => f.b.bin.id === activeBin.bin.id)?.v ?? null}
                  onScan={() => useStore.getState().scanBin(activeBin.bin)}
                  onClose={() => setBinId(null)}
                />
              ) : laneScore ? (
                <LanePanel score={laneScore} onClose={() => setLaneId(null)} />
              ) : plan ? (
                <PlannerPanel
                  mode={plan.mode}
                  setMode={(m) => setPlan((p) => (p ? { ...p, mode: m } : p))}
                  bin={plan.bin}
                  binResult={binPlan}
                  vanId={plan.van}
                  setVanId={(id) => setPlan((p) => (p ? { ...p, van: id } : p))}
                  routes={routes}
                  shift={shiftPlan}
                  onClose={() => setPlan(null)}
                />
              ) : show.forecast ? (
                <ForecastPanel
                  spots={hotspots}
                  onPick={(h: Hotspot) => mapRef.current?.flyTo({ center: [h.lon, h.lat], zoom: 16.3, pitch: 60, duration: 1500 })}
                  onClose={() => setShow((s) => ({ ...s, forecast: false }))}
                />
              ) : show.lanes ? (
                <LaneSummary counts={tierCounts} onClose={() => setShow((s) => ({ ...s, lanes: false }))} />
              ) : (
                <ActivityFeed feed={feed} now={feedNow} simulating={simulating} onSimulate={() => setSimulating((x) => !x)} onPick={pickFeed} />
              )}
            </aside>
          </div>
        </div>

        {/* ---------- time scrubber ---------- */}
        <footer className="pointer-events-auto grain flex items-center gap-4 border-t-[3px] border-chrome bg-night px-4 py-3">
          <button
            onClick={() => {
              if (!playing && offsetH >= WINDOW_H) setOffsetH(0);
              setPlaying((p) => !p);
            }}
            className="sign flex shrink-0 items-center gap-2 rounded-[4px] bg-chrome px-4 pb-1.5 pt-2.5 text-[20px] text-ink hover:bg-chrome-deep"
            aria-label={playing ? "Pause replay" : "Replay the last 30 days"}
          >
            {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
            <span className="max-sm:hidden">{playing ? "Pause" : "Replay 30 days"}</span>
          </button>
          <div className="min-w-0 flex-1">
            <Timeline
              tickets={scoped}
              now={now}
              windowH={WINDOW_H}
              offsetH={offsetH}
              onPick={(h) => {
                setPlaying(false);
                setOffsetH(h);
              }}
            />
            <input
              type="range"
              min={0}
              max={WINDOW_H}
              step={2}
              value={offsetH}
              onChange={(e) => {
                setPlaying(false);
                setOffsetH(Number(e.target.value));
              }}
              className="scrub w-full"
              aria-label="Time"
              aria-valuetext={live ? "Now" : atLabel}
            />
            <div className="mt-1 flex justify-between text-[12px] font-semibold text-letter/55">
              <span>30 days ago</span>
              <span className="sign text-[17px] text-letter">{live ? "Now" : atLabel}</span>
              <span>Now</span>
            </div>
          </div>
          <div className="shrink-0 text-right text-[12px] leading-snug text-letter/60 max-md:hidden">
            <div>
              <span className="sign tabular text-[17px] text-letter">{buildingCount.toLocaleString("en-IN")}</span> real buildings
            </div>
            <button onClick={resetDemo} className="inline-flex items-center gap-1 hover:text-letter">
              <RotateCcw size={11} /> Reset demo
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

/** The draggable then|now divider. It follows the chosen meridian as the camera moves, so it stays true in 3D. */
function SplitDivider({
  map,
  lon,
  onLon,
  thenLabel,
  nowLabel,
}: {
  map: MlMap;
  lon: number;
  onLon: (lon: number) => void;
  thenLabel: string;
  nowLabel: string;
}) {
  const [, setTick] = useState(0);
  const dragging = useRef(false);
  useEffect(() => {
    const redraw = () => setTick((n) => n + 1);
    map.on("move", redraw);
    return () => {
      map.off("move", redraw);
    };
  }, [map]);
  const c = map.getContainer();
  const w = c.clientWidth;
  const h = c.clientHeight;
  const topLat = map.unproject([w / 2, h * 0.12]).lat;
  const botLat = map.unproject([w / 2, h - 10]).lat;
  const a = map.project([lon, topLat]);
  const b = map.project([lon, botLat]);
  const midY = h * 0.5;
  const mid = { x: b.y !== a.y ? a.x + ((b.x - a.x) * (midY - a.y)) / (b.y - a.y) : a.x, y: midY };
  const move = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const r = c.getBoundingClientRect();
    onLon(map.unproject([e.clientX - r.left, e.clientY - r.top]).lng);
  };
  return (
    <div className="pointer-events-none absolute inset-0 z-[5]">
      <svg className="absolute inset-0 h-full w-full" aria-hidden>
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#16130F" strokeWidth={7} />
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#F2B705" strokeWidth={3.5} />
      </svg>
      <div className="sign absolute rounded-[3px] bg-ink/85 px-3 pb-0.5 pt-1.5 text-[18px] text-letter" style={{ left: a.x - 12, top: a.y + 8, transform: "translateX(-100%)" }}>
        Then · {thenLabel}
      </div>
      <div className="sign absolute rounded-[3px] bg-chrome px-3 pb-0.5 pt-1.5 text-[18px] text-ink" style={{ left: a.x + 12, top: a.y + 8 }}>
        {nowLabel}
      </div>
      <button
        aria-label="Drag to compare then and now"
        className="sign pointer-events-auto absolute flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center rounded-full border-[3px] border-ink bg-chrome text-[22px] text-ink shadow-[0_8px_20px_rgb(0_0_0/0.5)]"
        style={{ left: mid.x, top: mid.y }}
        onPointerDown={(e) => {
          dragging.current = true;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={move}
        onPointerUp={() => (dragging.current = false)}
      >
        ⇆
      </button>
    </div>
  );
}

function Tally({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="flex min-w-[118px] flex-col justify-center px-5 py-2">
      <dd className={`sign tabular text-[34px] font-semibold ${tone ?? "text-letter"}`}>{value}</dd>
      <dt className="text-[12px] font-semibold leading-tight text-letter/65">{label}</dt>
    </div>
  );
}

function Switch({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className="flex items-center justify-between gap-2 rounded-[3px] px-2.5 py-1.5 text-left text-[13px] font-bold leading-tight hover:bg-night-line"
    >
      {children}
      <span className={`relative h-[18px] w-[32px] rounded-full transition-colors ${on ? "bg-chrome" : "bg-night-line"}`}>
        <span
          className={`absolute top-[3px] h-[12px] w-[12px] rounded-full transition-[left] duration-200 ${on ? "left-[17px] bg-ink" : "left-[3px] bg-letter/60"}`}
        />
      </span>
    </button>
  );
}

function ReportDetail({
  t,
  at,
  exposed,
  onClose,
  onPatch,
  routeCheck,
  onVan,
}: {
  t: Ticket;
  at: number;
  exposed: number;
  onClose: () => void;
  onPatch: (p: Partial<Ticket>) => void;
  routeCheck?: Lane | null;
  onVan: (id: string) => void;
}) {
  const cat = CATEGORIES[t.cat];
  const resolved = t.status === "resolved";
  const age = resolved && t.resolvedAt ? (t.resolvedAt - t.createdAt) / HOUR : ageHours(t, at);
  const pct = Math.min(100, (age / cat.slaH) * 100);
  const late = age > cat.slaH;
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="sign flex items-center gap-2.5 text-[32px] leading-none text-letter">
            <span aria-hidden className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: `rgb(${cat.color.join(",")})` }} />
            {cat.label}
          </h2>
          <p className="mt-1 text-[14px] text-letter/70">
            {t.locality} · {ZONES[t.zone].name}, Zone {ZONES[t.zone].no} · <span className="sign tabular text-[16px] text-chrome">{t.id}</span>
          </p>
        </div>
        <button onClick={onClose} className="rounded-[3px] p-1.5 text-letter/70 hover:bg-night-line hover:text-letter" aria-label="Close report">
          <X size={18} />
        </button>
      </div>

      {routeCheck !== undefined && (
        <div className={`rounded-[4px] px-3 py-2.5 text-[14px] ${routeCheck ? "bg-vermilion text-letter" : "bg-night-deep text-letter/80"}`}>
          {routeCheck ? (
            <>
              <strong>Confirmed by route data.</strong> Van{" "}
              <button onClick={() => onVan(routeCheck[4])} className="sign text-[17px] underline underline-offset-2">
                {routeCheck[4]}
              </button>{" "}
              skipped this lane on today&apos;s round.
            </>
          ) : (
            <>Route check: this lane is on a van&apos;s round today. Ask the crew to confirm the pickup.</>
          )}
        </div>
      )}
      {t.photo ? (
        <div className={`relative grid gap-1.5 ${t.afterPhoto ? "grid-cols-2" : ""}`}>
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={t.photo} alt="Reported problem" className="aspect-[4/3] w-full rounded-[3px] object-cover" />
            {t.afterPhoto && <figcaption className="sign mt-1 text-center text-[16px] text-letter/70">Before</figcaption>}
          </figure>
          {t.afterPhoto && (
            <figure>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t.afterPhoto} alt="After cleaning" className="aspect-[4/3] w-full rounded-[3px] object-cover" />
              <figcaption className="sign mt-1 text-center text-[16px] text-letter/70">After</figcaption>
            </figure>
          )}
        </div>
      ) : (
        <p className="rounded-[3px] border-2 border-dashed border-night-line px-3 py-3 text-[13px] text-letter/60">
          Seeded demo report, so there is no photo. Reports filed from the resident app show their photo here.
        </p>
      )}

      <dl className="grid grid-cols-3 divide-x-2 divide-night-line rounded-[3px] bg-night-deep text-center">
        <Fact value={`~${exposed.toLocaleString("en-IN")}`} label="people ≤100 m" tone="text-chrome" />
        <Fact value={fmtAge(age)} label={resolved ? "to clear" : "open for"} tone={late ? "text-vermilion" : "text-letter"} />
        <Fact value={`+${t.meToo}`} label="neighbours agree" tone="text-letter" />
      </dl>

      <div>
        <div className="mb-1 flex justify-between text-[13px] font-semibold text-letter/70">
          <span>Deadline {cat.slaH} h</span>
          <span className={late ? "text-vermilion" : ""}>{late ? `${fmtAge(age - cat.slaH)} late` : `${fmtAge(cat.slaH - age)} left`}</span>
        </div>
        <div className="h-[8px] overflow-hidden rounded-[2px] bg-night-line">
          <div className={`h-full ${late ? "bg-vermilion" : "bg-chrome"}`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="relative">
        <CustodyLine t={t} />
        {resolved && (
          <div className="absolute bottom-0 right-1">
            <Stamp strike size="sm" />
          </div>
        )}
      </div>

      {t.reopened && <p className="text-[14px] font-bold text-vermilion">Reopened by the resident: reported as not cleaned.</p>}
      {t.escalated && (
        <p className="flex items-center gap-1.5 text-[14px] font-bold text-vermilion">
          <AlertTriangle size={15} /> Escalated to the Zonal Officer.
        </p>
      )}

      {!resolved && (
        <div className="flex flex-wrap gap-2">
          {t.status === "open" && (
            <button className="btn-paint bg-chrome text-[18px] text-ink hover:bg-chrome-deep" onClick={() => onPatch({ status: "assigned" })}>
              Assign to {ZONES[t.zone].name} crew
            </button>
          )}
          {late && !t.escalated && (
            <button className="btn-paint bg-vermilion text-[18px] text-letter hover:bg-vermilion-deep" onClick={() => onPatch({ escalated: true })}>
              Escalate
            </button>
          )}
          <Link className="btn-paint border-2 border-letter/60 text-[18px] text-letter hover:bg-night-line" href={`/worker?id=${t.id}`}>
            Open in crew app
          </Link>
        </div>
      )}
      <p className="text-[12px] leading-snug text-letter/55">
        Routed to the {ZONES[t.zone].supervisor}. Only the crew app can close a report, with an on-site photo.
      </p>
    </div>
  );
}

function Fact({ value, label, tone }: { value: string; label: string; tone: string }) {
  return (
    <div className="px-1.5 py-2.5">
      <dd className={`sign tabular text-[24px] ${tone}`}>{value}</dd>
      <dt className="text-[11px] font-semibold leading-tight text-letter/60">{label}</dt>
    </div>
  );
}
