"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { type GeoJSONSource, Map as MlMap } from "@/lib/maplibre";
import { useEffect, useRef } from "react";
import { MapPin } from "lucide-react";
import { CATEGORIES, type Ticket } from "@/lib/domain";
import { baseStyle } from "@/lib/mapStyle";

/** Satellite map with a fixed centre pin: the user drags the map under the pin. */
export default function MiniMap({
  center,
  tickets,
  onCenter,
  interactive = true,
}: {
  center: { lat: number; lon: number };
  tickets: Ticket[];
  onCenter?: (c: { lat: number; lon: number }) => void;
  interactive?: boolean;
}) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const cb = useRef(onCenter);
  useEffect(() => {
    cb.current = onCenter;
  });
  const applyRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!el.current) return;
    const map = new MlMap({
      container: el.current,
      style: baseStyle(false),
      center: [center.lon, center.lat],
      zoom: 17.2,
      interactive,
      attributionControl: { compact: true },
    });
    map.on("load", () => {
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
      applyRef.current();
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

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0">
        <div ref={el} className="h-full w-full" />
      </div>
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full drop-shadow-[0_3px_4px_rgba(0,0,0,0.6)]">
        <MapPin size={42} className="fill-red-500 text-white" strokeWidth={1.5} />
      </div>
    </div>
  );
}
