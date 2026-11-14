"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Printer } from "lucide-react";
import { ZONES, localityFor, zoneFor } from "@/lib/domain";
import { type BinState, binStates, nearestVan, useBins } from "@/lib/city";
import { qrPath } from "@/lib/qr";
import { useStore, useTickets } from "@/lib/store";
import { useClock, useRoutes } from "@/lib/vans";
import { VanEtaCard } from "./VanCards";
import { Stamp } from "./paint";

export const SITE = "https://swachhgrid.vercel.app";
export const binUrl = (id: string) => `${SITE}/bin?id=${id}`;

export function QrSvg({ text, className }: { text: string; className?: string }) {
  const { d, size } = useMemo(() => qrPath(text), [text]);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className={className} shapeRendering="crispEdges" role="img" aria-label={`QR code for ${text}`}>
      <rect width={size} height={size} fill="#fff" />
      <path d={d} fill="#16130F" />
    </svg>
  );
}

export function FillBar({ fill, tall = false }: { fill: number; tall?: boolean }) {
  const pct = Math.min(100, Math.round(fill * 100));
  const tone = fill >= 1 ? "bg-vermilion" : fill >= 0.9 ? "bg-chrome-deep" : fill >= 0.6 ? "bg-chrome" : "bg-leaf";
  return (
    <div className={`relative overflow-hidden rounded-[3px] bg-ink/15 ${tall ? "h-5" : "h-3"}`}>
      <div className={`h-full ${tone} transition-[width] duration-700`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export const fillLabel = (s: BinState) =>
  s.fill >= 1 ? "Overflowing" : s.fill >= 0.9 ? "Full" : s.fill >= 0.6 ? "Filling up" : "Has room";

/* ---------------- /bin?id=G101 : what a resident sees after scanning the sticker ---------------- */

export function BinScan() {
  const load = useStore((s) => s.load);
  const density = useStore((s) => s.density);
  const scans = useStore((s) => s.binScans);
  const scanBin = useStore((s) => s.scanBin);
  const tickets = useTickets();
  const bins = useBins();
  const routes = useRoutes();
  const now = useClock(1);
  const [id] = useState(() => new URLSearchParams(window.location.search).get("id") ?? "G101");
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => void load(), [load]);

  const bin = bins?.find((b) => b.id === id) ?? null;
  const state = bin && routes ? binStates([bin], routes, density, scans, now)[0] : null;
  const zone = bin ? zoneFor(bin.lat, bin.lon) : null;

  return (
    <main className="min-h-dvh bg-chrome text-ink">
      <div className="mx-auto flex max-w-[480px] flex-col gap-4 p-4">
        <header className="flex items-center justify-between">
          <Link href="/" className="painted text-[24px]">
            SwachhGrid
          </Link>
          <span className="sign rounded-[3px] bg-ink px-2.5 pb-0.5 pt-1.5 text-[18px] text-chrome">Bin {id}</span>
        </header>

        {!bin ? (
          <p className="rounded-[4px] bg-ink p-5 text-[17px] text-letter">{bins ? "This sticker is not in the registry." : "Loading the bin…"}</p>
        ) : (
          <>
            <section className="rounded-[4px] bg-ink p-5 text-letter">
              <p className="sign text-[18px] text-chrome">सार्वजनिक कचराकुंडी · Community bin</p>
              <h1 className="painted mt-1 text-[34px] leading-tight">{localityFor(bin.lat, bin.lon)}</h1>
              <p className="text-[15px] text-letter/70">
                {zone ? `${ZONES[zone].name}, Zone ${ZONES[zone].no}` : ""} · emptied by van {bin.van}
              </p>
              {state && (
                <div className="mt-4">
                  <div className="mb-1.5 flex items-baseline justify-between">
                    <span className="text-[14px] font-semibold text-letter/70">How full, right now</span>
                    <span className="sign text-[24px] text-chrome">{fillLabel(state)}</span>
                  </div>
                  <FillBar fill={state.fill} tall />
                  <p className="mt-2 text-[14px] text-letter/70">
                    Emptied {Math.round(state.sinceMin)} min ago · van back in about {Math.round(state.nextMin)} min
                    {state.scans ? ` · ${state.scans} neighbour${state.scans > 1 ? "s" : ""} said full` : ""}
                  </p>
                </div>
              )}
            </section>

            {done ? (
              <section className="relative overflow-hidden rounded-[4px] bg-letter p-5 pb-20">
                <p className="painted text-[28px] leading-tight">धन्यवाद! Thank you.</p>
                <p className="mt-2 text-[16px]">
                  Your scan went to the {zone ? ZONES[zone].name : ""} zone as report <b>{done}</b>, and the nearest van has been nudged towards this
                  bin.
                </p>
                <div className="absolute bottom-2 right-3">
                  <Stamp top="NOTED" bottom="नोंद · QR scan" size="sm" strike />
                </div>
              </section>
            ) : (
              <button
                onClick={() => setDone(scanBin(bin).id)}
                className="painted flex w-full flex-col items-center gap-1 rounded-[4px] bg-vermilion px-5 py-6 text-letter shadow-[0_8px_0_#A8241B] active:translate-y-[4px] active:shadow-[0_4px_0_#A8241B]"
              >
                <span className="text-[34px] leading-none">हो, भरलेली आहे</span>
                <span className="text-[18px]">Yes, this bin is full</span>
              </button>
            )}

            {routes && state && (() => {
              const v = nearestVan(routes, bin.lat, bin.lon, now);
              return (
                <p className="text-[14px] font-semibold">
                  Nearest van now: {v.id}, {Math.round(v.distM)} m away (about {Math.max(1, Math.round(v.etaMin))} min).
                </p>
              );
            })()}

            <VanEtaCard routes={routes} lat={bin.lat} lon={bin.lon} now={now} tickets={tickets} lang="mr" />
            <p className="text-[12px] text-ink/70">Demo: bin fill and van positions are simulated on real roads. One scan files one report.</p>
          </>
        )}
      </div>
    </main>
  );
}

/* ---------------- /bins : the printable sticker sheet ---------------- */

export function BinStickers() {
  const bins = useBins();
  return (
    <main className="min-h-dvh bg-letter text-ink print:bg-white">
      <div className="mx-auto max-w-[1100px] p-6 print:p-0">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-3 print:hidden">
          <div>
            <Link href="/command" className="flex items-center gap-1 text-[14px] font-bold">
              <ArrowLeft size={14} /> Command centre
            </Link>
            <h1 className="painted mt-1 text-[36px]">Bin stickers</h1>
            <p className="max-w-[640px] text-[15px] text-ink/75">
              One sticker per community bin in the pilot. A resident scans it with any phone camera and says the bin is full in one tap. Print on
              weatherproof vinyl, 9 × 12 cm.
            </p>
          </div>
          <button onClick={() => window.print()} className="sign flex items-center gap-2 rounded-[3px] bg-ink px-4 pb-1 pt-2 text-[20px] text-chrome">
            <Printer size={18} /> Print sheet
          </button>
        </header>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-3 print:gap-2">
          {(bins ?? []).map((b) => (
            <article key={b.id} className="flex break-inside-avoid flex-col items-center rounded-[6px] border-[3px] border-ink bg-chrome p-3 text-center">
              <p className="painted text-[22px] leading-tight">भरलेली आहे?</p>
              <p className="sign text-[16px] leading-none">Full? Scan it.</p>
              <QrSvg text={binUrl(b.id)} className="my-2 w-full max-w-[150px]" />
              <p className="sign text-[20px] leading-none">Bin {b.id}</p>
              <p className="text-[12px] font-semibold leading-tight">{localityFor(b.lat, b.lon)}</p>
              <p className="mt-1 flex items-center gap-1 text-[11px] font-bold">
                <Check size={11} /> SwachhGrid
              </p>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
