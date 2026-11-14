"use client";

import dynamic from "next/dynamic";

const Loading = () => (
  <div className="grid h-dvh place-items-center bg-night">
    <span className="sign text-[28px] text-chrome">Painting the map…</span>
  </div>
);

// The map and the browser-stored demo data only exist in the browser.
export const CommandCenterClient = dynamic(() => import("./CommandCenter"), { ssr: false, loading: Loading });
export const ReportFlowClient = dynamic(() => import("./ReportFlow"), { ssr: false, loading: Loading });
export const WorkerAppClient = dynamic(() => import("./WorkerApp"), { ssr: false, loading: Loading });
export const BinScanClient = dynamic(() => import("./BinPages").then((m) => m.BinScan), { ssr: false, loading: Loading });
export const BinStickersClient = dynamic(() => import("./BinPages").then((m) => m.BinStickers), { ssr: false, loading: Loading });

export const HeroMapClient = dynamic(() => import("./LandingLive").then((m) => m.HeroMap), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-chrome-deep" />,
});
export const TallyClient = dynamic(() => import("./LandingLive").then((m) => m.Tally), { ssr: false });
export const TopQueueClient = dynamic(() => import("./LandingLive").then((m) => m.TopQueue), {
  ssr: false,
  loading: () => <div className="h-[340px]" />,
});
export const StampClient = dynamic(() => import("./paint").then((m) => m.Stamp), { ssr: false });
