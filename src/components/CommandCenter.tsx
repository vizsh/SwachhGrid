"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { Map as MlMap, NavigationControl } from "@/lib/maplibre";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { AmbientLight, DirectionalLight, LightingEffect } from "@deck.gl/core";
import { ScatterplotLayer, SolidPolygonLayer } from "@deck.gl/layers";
import { HexagonLayer } from "@deck.gl/aggregation-layers";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CloudRain, Crosshair, Pause, Play, RotateCcw, X } from "lucide-react";
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
import { useStore, useTickets } from "@/lib/store";
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
  const [show, setShow] = useState({ exposure: true, columns: false, resolved: false });
  const [rainMm, setRainMm] = useState<number | null>(null);

  const live = offsetH >= WINDOW_H;
  const at = live ? Math.max(now, ...tickets.map((t) => t.createdAt)) : now - (WINDOW_H - offsetH) * HOUR;

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

  /** One identical instrument per zone: load, lateness and breeding risk. */
  const meters = useMemo(() => {
    const wet = (rainMm ?? 0) >= 5;
    const rows = ZONE_IDS.map((z) => {
      const zOpen = tickets.filter((t) => t.zone === z && isOpenAt(t, at));
      const late = zOpen.filter((t) => isOverdue(t, at)).length;
      const water = zOpen.filter((t) => (t.cat === "stagnant_water" || t.cat === "blocked_drain") && ageHours(t, at) > 72).length;
      const level = water >= 6 || (water >= 3 && wet) ? "High" : water >= 2 ? "Watch" : "Low";
      return { z, open: zOpen.length, late, water, level };
    });
    const max = Math.max(8, ...rows.map((r) => r.open));
    return rows.map((r) => ({ ...r, fill: r.open / max, lateShare: r.open ? r.late / r.open : 0 }));
  }, [tickets, at, rainMm]);

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

    const buildingColor = (b: Building): [number, number, number, number] => {
      const base: [number, number, number, number] = b.small ? [184, 174, 152, 255] : [128, 132, 146, 255];
      if (!show.exposure) return base;
      const ci = Math.floor(b.lat / RISK_CELL);
      const cj = Math.floor(b.lon / RISK_CELL);
      let heat = 0;
      let days = 0;
      for (let a = -1; a <= 1; a++)
        for (let c = -1; c <= 1; c++) {
          const list = riskIndex.get((ci + a) * 100000 + cj + c);
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

    const layers = [
      ...tiles.map(
        (tile) =>
          new SolidPolygonLayer<Building>({
            id: `b-${tile.key}`,
            data: tile.data,
            getPolygon: (b) => b.ring,
            positionFormat: "XY",
            extruded: true,
            getElevation: (b) => b.h,
            getFillColor: buildingColor,
            material: { ambient: 0.6, diffuse: 0.65, shininess: 6, specularColor: [30, 30, 30] },
            updateTriggers: { getFillColor: [riskIndex, show.exposure] },
          }),
      ),
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
      new ScatterplotLayer<Ticket>({
        id: "open",
        data: open,
        getPosition: (t) => [t.lon, t.lat, 16],
        getRadius: (t) => 7 + t.sev * 2,
        radiusMinPixels: 5,
        radiusMaxPixels: 17,
        stroked: true,
        getFillColor: (t) => [...CATEGORIES[t.cat].color, 255] as [number, number, number, number],
        getLineColor: (t) => (isOverdue(t, at) ? [244, 241, 232, 255] : [22, 19, 15, 255]),
        getLineWidth: (t) => (t.id === selectedId ? 4 : isOverdue(t, at) ? 2.5 : 1.5),
        lineWidthUnits: "pixels",
        parameters: { depthCompare: "always" },
        pickable: true,
        onClick: (i) => i.object && focus(i.object),
        updateTriggers: { getLineColor: [at], getLineWidth: [at, selectedId] },
      }),
    ].filter(Boolean);

    overlay.setProps({
      layers,
      getTooltip: ({ object, layer }: { object?: unknown; layer?: { id: string } | null }) => {
        if (!object || !layer) return null;
        if (layer.id === "columns") {
          const o = object as { count?: number; points?: unknown[] };
          return { text: `${o.count ?? o.points?.length ?? ""} reports here in 30 days` };
        }
        const t = object as Ticket;
        return { text: `${CATEGORIES[t.cat].label} · ${t.locality}` };
      },
    });
    // focus is stable enough for click handlers; re-binding on every render is unnecessary.
  }, [tiles, riskIndex, open, scoped, show, selectedId, selected, at]);

  function focus(t: Ticket) {
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
  function overview() {
    setSelectedId(null);
    mapRef.current?.flyTo({ center: PILOT_CENTER, zoom: 13.5, pitch: 54, bearing: -18, duration: 1400 });
  }

  const buildingCount = tiles.reduce((n, t) => n + t.data.length, 0);
  const atLabel = new Date(at).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric" });

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-night-deep text-letter">
      <div className="absolute inset-0">
        <div ref={mapEl} className="h-full w-full" />
      </div>

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
            <Link href="/report" className="hover:text-chrome">
              Resident app
            </Link>
            <Link href="/worker" className="hover:text-chrome">
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
                  <CloudRain size={13} /> {rainMm === null ? "rain unavailable" : `${rainMm} mm rain, last 72 h`}
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
                    <span className="col-start-2 col-end-4 text-[12px] text-letter/60">
                      Breeding risk{" "}
                      <span className={`font-bold ${m.level === "High" ? "text-vermilion" : m.level === "Watch" ? "text-chrome" : "text-letter"}`}>
                        {m.level}
                      </span>{" "}
                      · {m.water} old water reports
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-letter/50">Bar: open reports, red share past deadline.</p>
            </div>
          </aside>

          <div className="ml-auto flex min-h-0 flex-col items-end gap-3">
            {/* ---------- layer switches ---------- */}
            <div className="pointer-events-auto grain flex flex-col rounded-[6px] bg-night p-1.5 shadow-[0_14px_36px_rgb(0_0_0/0.5)]">
              <Switch on={show.exposure} onClick={() => setShow((s) => ({ ...s, exposure: !s.exposure }))}>
                Homes beside waste
              </Switch>
              <Switch on={show.columns} onClick={() => setShow((s) => ({ ...s, columns: !s.columns }))}>
                Chronic spots
              </Switch>
              <Switch on={show.resolved} onClick={() => setShow((s) => ({ ...s, resolved: !s.resolved }))}>
                Cleared reports
              </Switch>
              <button onClick={overview} className="flex items-center gap-2 rounded-[3px] px-3 py-2 text-[14px] font-bold text-letter/80 hover:bg-night-line">
                <Crosshair size={16} /> Whole pilot area
              </button>
            </div>

            {/* ---------- report detail ---------- */}
            {selected && (
              <aside className="pointer-events-auto grain flex min-h-0 w-[360px] max-w-[calc(100vw-24px)] flex-col overflow-y-auto rounded-[6px] bg-night shadow-[0_14px_36px_rgb(0_0_0/0.5)]">
                <ReportDetail
                  t={selected}
                  at={at}
                  exposed={peopleExposed(density, selected)}
                  onClose={() => setSelectedId(null)}
                  onPatch={(p) => patch(selected.id, p)}
                />
              </aside>
            )}
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
      className="flex items-center justify-between gap-4 rounded-[3px] px-3 py-2 text-[14px] font-bold hover:bg-night-line"
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
}: {
  t: Ticket;
  at: number;
  exposed: number;
  onClose: () => void;
  onPatch: (p: Partial<Ticket>) => void;
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
          <span className="sign rounded-[3px] px-2 pb-0.5 pt-1 text-[16px] text-ink" style={{ background: `rgb(${cat.color.join(",")})` }}>
            {t.id}
          </span>
          <h2 className="sign mt-2 text-[34px] text-letter">{cat.label}</h2>
          <p className="text-[14px] text-letter/70">
            {t.locality} · {ZONES[t.zone].name} zone (Zone {ZONES[t.zone].no})
          </p>
        </div>
        <button onClick={onClose} className="rounded-[3px] p-1.5 text-letter/70 hover:bg-night-line hover:text-letter" aria-label="Close report">
          <X size={18} />
        </button>
      </div>

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
        <Fact value={`~${exposed.toLocaleString("en-IN")}`} label="people within 100 m" tone="text-chrome" />
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
