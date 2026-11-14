"use client";

import { setWorkerUrl } from "maplibre-gl";

if (typeof window !== "undefined")
  setWorkerUrl(new URL("/maplibre/maplibre-gl-worker.mjs", window.location.origin).href);

export * from "maplibre-gl";
