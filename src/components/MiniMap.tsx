"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { type GeoJSONSource, Map as MlMap } from "@/lib/maplibre";
import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { CATEGORIES, type Ticket } from "@/lib/domain";
import { baseStyle } from "@/lib/mapStyle";

const Z = 17;
const TILE = 256;
function project(lon: number, lat: number) {
  const world = TILE * 2 ** Z;
  const s = Math.sin((lat * Math.PI) / 180);
  return { x: ((lon + 180) / 360) * world, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * world };
}

/**
 * Satellite map with a fixed centre pin: the user drags the map under the pin.
 * A fixed (non-interactive) map also draws plain image tiles underneath, so the crew always
 * sees roofs and lanes even before the WebGL map has loaded its imagery.
 */
export default function MiniMap({
  center,
  tickets,
  onCenter,
  interactive = true,
  route,
}: {
  center: { lat: number; lon: number };
  tickets: Ticket[];
  onCenter?: (c: { lat: number; lon: number }) => void;
  interactive?: boolean;
  /** a road route with numbered stops; the map fits to it and the centre pin is hidden */
  route?: { path: [number, number][]; stops: { lon: number; lat: number }[]; base: { lon: number; lat: number } };
}) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const cb = useRef(onCenter);
  useEffect(() => {
    cb.current = onCenter;
  });
  const applyRef = useRef<() => void>(() => {});
  const routeRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!el.current) return;
    const map = new MlMap({
      container: el.current,
      style: (() => {
        const st = baseStyle(false);
        // a fixed map lets the image-tile fallback show through until its own imagery arrives
        if (!interactive) {
          const bg = st.layers.find((l) => l.id === "bg");
          if (bg && bg.type === "background") bg.paint = { ...bg.paint, "background-opacity": 0 };
        }
        return st;
      })(),
      center: [center.lon, center.lat],
      zoom: interactive ? 17.2 : Z,
      interactive,
      attributionControl: { compact: true },
    });
    map.on("load", () => {
      // the pin sits on the centre; hide place labels so it never covers a locality name
      map.setLayoutProperty("places", "visibility", "none");
      map.addSource("tickets", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "tickets",
        type: "circle",
        source: "tickets",
        paint: {
          "circle-radius": 7,
          "circle-color": ["get", "color"],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });
      map.addSource("route", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "route-casing",
        type: "line",
        source: "route",
        filter: ["==", ["geometry-type"], "LineString"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#16130F", "line-width": 9 },
      });
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        filter: ["==", ["geometry-type"], "LineString"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#F2B705", "line-width": 5 },
      });
      map.addLayer({
        id: "route-stops",
        type: "circle",
        source: "route",
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-radius": 11,
          "circle-color": ["case", ["==", ["get", "n"], "B"], "#14513A", "#F2B705"],
          "circle-stroke-color": "#16130F",
          "circle-stroke-width": 2.5,
        },
      });
      map.addLayer({
        id: "route-numbers",
        type: "symbol",
        source: "route",
        filter: ["==", ["geometry-type"], "Point"],
        layout: { "text-field": ["get", "n"], "text-size": 13, "text-font": ["Noto Sans Bold"], "text-allow-overlap": true },
        paint: { "text-color": ["case", ["==", ["get", "n"], "B"], "#F4F1E8", "#16130F"] },
      });
      applyRef.current();
      routeRef.current();
    });
    map.on("moveend", () => {
      const c = map.getCenter();
      cb.current?.({ lat: c.lat, lon: c.lng });
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    if (Math.abs(c.lat - center.lat) > 1e-6 || Math.abs(c.lng - center.lon) > 1e-6)
      map.easeTo({ center: [center.lon, center.lat], duration: 500 });
  }, [center.lat, center.lon]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const src = map.getSource("tickets") as GeoJSONSource | undefined;
      src?.setData({
        type: "FeatureCollection",
        features: tickets.map((t) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [t.lon, t.lat] },
          properties: { color: `rgb(${CATEGORIES[t.cat].color.join(",")})` },
        })),
      });
    };
    applyRef.current = apply;
    if (map.getSource("tickets")) apply();
  }, [tickets]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !route) return;
    const apply = () => {
      const src = map.getSource("route") as GeoJSONSource | undefined;
      src?.setData({
        type: "FeatureCollection",
        features: [
          { type: "Feature", geometry: { type: "LineString", coordinates: route.path }, properties: {} },
          { type: "Feature", geometry: { type: "Point", coordinates: [route.base.lon, route.base.lat] }, properties: { n: "B" } },
          ...route.stops.map((st, i) => ({
            type: "Feature" as const,
            geometry: { type: "Point" as const, coordinates: [st.lon, st.lat] },
            properties: { n: String(i + 1) },
          })),
        ],
      });
      if (route.path.length > 1) {
        const lons = route.path.map((q) => q[0]);
        const lats = route.path.map((q) => q[1]);
        map.fitBounds(
          [
            [Math.min(...lons), Math.min(...lats)],
            [Math.max(...lons), Math.max(...lats)],
          ],
          { padding: 28, duration: 0 },
        );
      }
    };
    routeRef.current = apply;
    if (map.getSource("route")) apply();
  }, [route]);

  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (interactive || !box.current) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, [interactive]);
  const tiles = useMemo(() => {
    if (interactive || !size.w) return [];
    const c = project(center.lon, center.lat);
    const ox = c.x - size.w / 2;
    const oy = c.y - size.h / 2;
    const out: { x: number; y: number; left: number; top: number }[] = [];
    for (let tx = Math.floor(ox / TILE); tx <= Math.floor((ox + size.w) / TILE); tx++)
      for (let ty = Math.floor(oy / TILE); ty <= Math.floor((oy + size.h) / TILE); ty++)
        out.push({ x: tx, y: ty, left: tx * TILE - ox, top: ty * TILE - oy });
    return out;
  }, [interactive, size.w, size.h, center.lon, center.lat]);

  return (
    <div ref={box} className="absolute inset-0 overflow-hidden bg-board-deep">
      {tiles.map((t) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${t.x}-${t.y}`}
          src={`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${Z}/${t.y}/${t.x}`}
          alt=""
          width={TILE}
          height={TILE}
          className="absolute max-w-none select-none"
          style={{ left: t.left, top: t.top }}
          draggable={false}
        />
      ))}
      <div className="absolute inset-0">
        <div ref={el} className="h-full w-full" />
      </div>
      {!route && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full drop-shadow-[0_3px_4px_rgba(0,0,0,0.6)]">
          <MapPin size={42} className="fill-red-500 text-white" strokeWidth={1.5} />
        </div>
      )}
    </div>
  );
}
