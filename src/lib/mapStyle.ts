import type { StyleSpecification } from "maplibre-gl";

export const DATA_ATTRIBUTION =
  "Buildings © Overture Maps Foundation (Google Open Buildings, Microsoft, OpenStreetMap)";

/** Real satellite imagery with real OpenStreetMap roads, drains and place names on top. */
export function baseStyle(dark: boolean): StyleSpecification {
  const ink = dark ? "#e2e8f0" : "#ffffff";
  const halo = dark ? "#0a0e13" : "#1f2937";
  return {
    version: 8,
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: {
      sat: {
        type: "raster",
        tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
        maxzoom: 19,
        attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
      },
      omt: {
        type: "vector",
        url: "https://tiles.openfreemap.org/planet",
        attribution: "© OpenStreetMap contributors · OpenFreeMap",
      },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": dark ? "#121830" : "#2b3a2f" } },
      {
        id: "sat",
        type: "raster",
        source: "sat",
        paint: {
          "raster-brightness-max": dark ? 0.72 : 0.95,
          "raster-saturation": dark ? -0.3 : -0.05,
          "raster-contrast": dark ? 0.12 : 0,
        },
      },
      {
        id: "waterway",
        type: "line",
        source: "omt",
        "source-layer": "waterway",
        paint: {
          "line-color": "#38bdf8",
          "line-opacity": 0.85,
          "line-width": ["interpolate", ["linear"], ["zoom"], 11, 1.2, 17, 6],
        },
      },
      {
        id: "roads-minor",
        type: "line",
        source: "omt",
        "source-layer": "transportation",
        minzoom: 14,
        filter: ["in", ["get", "class"], ["literal", ["minor", "service", "path", "track"]]],
        paint: {
          "line-color": ink,
          "line-opacity": dark ? 0.2 : 0.35,
          "line-width": ["interpolate", ["linear"], ["zoom"], 14, 0.6, 18, 3],
        },
      },
      {
        id: "roads-major",
        type: "line",
        source: "omt",
        "source-layer": "transportation",
        filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk", "primary", "secondary", "tertiary"]]],
        paint: {
          "line-color": ink,
          "line-opacity": dark ? 0.38 : 0.55,
          "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.8, 18, 7],
        },
      },
      {
        id: "road-names",
        type: "symbol",
        source: "omt",
        "source-layer": "transportation_name",
        minzoom: 15,
        layout: {
          "symbol-placement": "line",
          "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]],
          "text-font": ["Noto Sans Regular"],
          "text-size": 11,
        },
        paint: { "text-color": ink, "text-halo-color": halo, "text-halo-width": 1.4 },
      },
      {
        id: "places",
        type: "symbol",
        source: "omt",
        "source-layer": "place",
        minzoom: 11,
        filter: ["in", ["get", "class"], ["literal", ["suburb", "neighbourhood", "quarter", "village"]]],
        layout: {
          "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]],
          "text-font": ["Noto Sans Bold"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 12, 11, 16, 14],
          "text-letter-spacing": 0.06,
          "text-transform": "uppercase",
        },
        paint: { "text-color": ink, "text-halo-color": halo, "text-halo-width": 1.6, "text-opacity": 0.9 },
      },
    ],
  };
}
