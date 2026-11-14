import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SwachhGrid · Nagpur sanitation",
    short_name: "SwachhGrid",
    description: "Report garbage, blocked drains and missed collection in Marathi, Hindi or English. Works without network.",
    start_url: "/report",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F2B705",
    theme_color: "#14513A",
    lang: "mr",
    categories: ["utilities", "government"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Report a problem", short_name: "Report", url: "/report" },
      { name: "Crew duty board", short_name: "Crew", url: "/worker" },
    ],
  };
}
