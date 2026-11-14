"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Download, Printer } from "lucide-react";
import { CATEGORIES, ZONES, ZONE_IDS, type ZoneId, fmtAge, ageHours } from "@/lib/domain";
import { BASELINE_DAYS, fmtBig, zoneStats } from "@/lib/impact";
import { useStore, useTickets } from "@/lib/store";
import { CAT_PAINT } from "./paint";

function cardPng(name: string, no: number, s: ReturnType<typeof zoneStats>): Promise<Blob | null> {
  const c = document.createElement("canvas");
  c.width = 1200;
  c.height = 630;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  g.fillStyle = "#14513A";
  g.fillRect(0, 0, 1200, 630);
  g.strokeStyle = "#F2B705";
  g.lineWidth = 10;
  g.strokeRect(28, 28, 1144, 574);
  g.fillStyle = "#F2B705";
  g.font = "600 40px 'Teko', sans-serif";
  g.fillText(`ZONE ${no} SCORECARD · LAST 30 DAYS`, 72, 104);
  g.font = "700 92px 'Yatra One', 'Mukta', serif";
  g.fillStyle = "#F4F1E8";
  g.fillText(name, 72, 200);
  const cells: [string, string, string][] = [
    [fmtBig(s.avoided30), "person-days of exposure avoided", "#F2B705"],
    [s.medianH === null ? "–" : fmtAge(s.medianH), "median time to clear", "#F4F1E8"],
    [s.onTimePct === null ? "–" : `${s.onTimePct}%`, "cleared within deadline", "#F4F1E8"],
    [String(s.late), "past deadline right now", "#FF8A80"],
  ];
  cells.forEach(([v, l, col], i) => {
    const x = 72 + (i % 2) * 540;
    const y = 300 + Math.floor(i / 2) * 140;
    g.fillStyle = col;
    g.font = "600 84px 'Teko', sans-serif";
    g.fillText(v, x, y);
    g.fillStyle = "#F4F1E8";
    g.font = "500 30px 'Mukta', sans-serif";
    g.fillText(l, x, y + 40);
  });
  g.fillStyle = "#F2B705";
  g.font = "500 26px 'Mukta', sans-serif";
  g.fillText("SwachhGrid · Nagpur · demo data · swachhgrid.vercel.app", 72, 580);
  return new Promise((r) => c.toBlob(r, "image/png"));
}

/** Public, printable, shareable: how one zone is doing, in numbers anyone can check. */
export default function WardScorecard({ zone }: { zone: ZoneId }) {
  const load = useStore((s) => s.load);
  const density = useStore((s) => s.density);
  const tickets = useTickets();
  const [now] = useState(() => Date.now());
  useEffect(() => void load(), [load]);
  const s = useMemo(() => zoneStats(zone, tickets, density, now), [zone, tickets, density, now]);
  const z = ZONES[zone];
  const max = Math.max(4, ...s.daily.map((d) => Math.max(d.reported, d.cleared)));

  async function share() {
    const blob = await cardPng(z.name, z.no, s);
    if (!blob) return;
    const file = new File([blob], `swachhgrid-zone-${z.no}.png`, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) return void navigator.share({ files: [file], title: `${z.name} scorecard` }).catch(() => {});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    a.click();
  }

  return (
    <main className="min-h-dvh bg-letter text-ink">
      <header className="bg-board text-letter">
        <div className="mx-auto flex max-w-[1080px] flex-wrap items-end justify-between gap-4 px-5 pb-6 pt-5">
          <div>
            <Link href="/" className="painted text-[22px] text-chrome">
              SwachhGrid
            </Link>
            <p className="sign mt-4 text-[22px] text-chrome">Zone {z.no} · public scorecard · last 30 days</p>
            <h1 className="painted text-[56px] leading-none">{z.name}</h1>
          </div>
          <nav className="flex gap-1.5" aria-label="Zones">
            {ZONE_IDS.map((id) => (
              <Link
                key={id}
                href={`/ward/${id}`}
                className={`sign rounded-[3px] px-3 pb-0.5 pt-1.5 text-[18px] ${id === zone ? "bg-chrome text-ink" : "bg-board-deep text-letter/80 hover:text-letter"}`}
              >
                {ZONES[id].name}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-[1080px] space-y-6 px-5 py-6">
        <section className="grid gap-3 sm:grid-cols-[1.4fr_1fr]">
          <div className="rounded-[6px] bg-chrome p-5">
            <p className="sign text-[20px]">Person-days of exposure avoided</p>
            <p className="sign tabular text-[84px] leading-none">{fmtBig(s.avoided30)}</p>
            <p className="mt-1 text-[15px] font-semibold">
              {fmtBig(s.avoided7)} in the last 7 days. For every report cleared: the people within 100 m × the days saved against a{" "}
              {BASELINE_DAYS}-day baseline.
            </p>
          </div>
          <div className="rounded-[6px] bg-ink p-5 text-letter">
            <p className="sign text-[20px] text-chrome">Still waiting right now</p>
            <p className="sign tabular text-[56px] leading-none">~{fmtBig(s.peopleNow)}</p>
            <p className="text-[15px] text-letter/75">
              people live within 100 m of the {s.open} open reports. Together they have lived beside them for {fmtBig(s.exposedNow)} person-days.
            </p>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              [s.medianH === null ? "–" : fmtAge(s.medianH), "median time to clear"],
              [s.onTimePct === null ? "–" : `${s.onTimePct}%`, "cleared within deadline"],
              [String(s.late), "past deadline now"],
              [String(s.reopened), "reopened by residents"],
            ] as const
          ).map(([v, l], i) => (
            <div key={l} className="rounded-[6px] border-[3px] border-ink p-4">
              <div className={`sign tabular text-[44px] leading-none ${i === 2 && s.late ? "text-vermilion" : ""}`}>{v}</div>
              <div className="text-[14px] font-semibold text-ink/70">{l}</div>
            </div>
          ))}
        </section>

        <section className="rounded-[6px] bg-white p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="sign text-[28px]">Every day for 30 days</h2>
            <p className="flex items-center gap-4 text-[13px] font-semibold">
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-[2px] bg-chrome" /> reported
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-[2px] bg-board" /> cleared
              </span>
            </p>
          </div>
          <div className="mt-3 flex h-40 items-end gap-[3px]" role="img" aria-label="Reports and clean-ups per day for 30 days">
            {s.daily.map((d, i) => (
              <div key={i} className="flex h-full flex-1 items-end gap-[1px]">
                <div className="flex-1 rounded-t-[2px] bg-chrome" style={{ height: `${(d.reported / max) * 100}%` }} title={`${d.reported} reported`} />
                <div className="flex-1 rounded-t-[2px] bg-board" style={{ height: `${(d.cleared / max) * 100}%` }} title={`${d.cleared} cleared`} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[12px] font-semibold text-ink/55">
            <span>30 days ago</span>
            <span>today</span>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-[6px] bg-white p-5">
            <h2 className="sign text-[28px]">What is open</h2>
            <ul className="mt-2 space-y-2">
              {s.catMix.map((c) => (
                <li key={c.cat} className="grid grid-cols-[10.5rem_1fr_2rem] items-center gap-3 text-[15px] font-semibold">
                  <span className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full ring-1 ring-ink/30" style={{ background: CAT_PAINT[c.cat] }} />
                    {CATEGORIES[c.cat].label}
                  </span>
                  <span className="h-3 overflow-hidden rounded-[2px] bg-ink/10">
                    <span className="block h-full bg-ink" style={{ width: `${(c.open / Math.max(1, s.open)) * 100}%` }} />
                  </span>
                  <span className="sign tabular text-right text-[20px]">{c.open}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-[6px] bg-white p-5">
            <h2 className="sign text-[28px]">Most urgent</h2>
            <ol className="mt-2">
              {s.worst.map(({ t, exposed }, i) => (
                <li key={t.id} className="grid grid-cols-[1.5rem_1fr_auto] items-baseline gap-2 border-b border-dashed border-ink/15 py-1.5 text-[15px]">
                  <span className="sign text-[20px] text-ink/45">{i + 1}</span>
                  <span>
                    <b>{CATEGORIES[t.cat].label}</b> · {t.locality}
                    <span className="block text-[13px] text-ink/60">~{exposed} people nearby</span>
                  </span>
                  <span className="sign tabular text-[20px] text-vermilion">{fmtAge(ageHours(t, now))}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="flex flex-wrap items-center gap-3 print:hidden">
          <button onClick={share} className="btn-paint bg-ink text-chrome">
            <Download size={18} /> Share as image
          </button>
          <button onClick={() => window.print()} className="btn-paint border-[2.5px] border-ink">
            <Printer size={18} /> Print for the zonal review
          </button>
          <Link href="/report" className="btn-paint bg-chrome">
            Report a problem <ArrowRight size={18} />
          </Link>
        </section>
        <p className="text-[13px] text-ink/60">
          Demo data: seeded reports beside real buildings, plus any reports filed in this browser. People nearby are buildings within 100 m × 4.5
          (an estimate). The {BASELINE_DAYS}-day baseline is a planning assumption until NMC&apos;s own clearing times are connected.
        </p>
      </div>
    </main>
  );
}
