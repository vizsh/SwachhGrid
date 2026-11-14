"use client";

import { Truck } from "lucide-react";
import { type Ticket, isOpenAt, metres, HOUR, ZONES, type ZoneId } from "@/lib/domain";
import type { Lang } from "@/lib/i18n";
import { type Routes, nextVan, vanDistance } from "@/lib/vans";

const COPY: Record<
  Lang,
  { title: string; eta: (m: number) => string; here: string; none: string; open: (n: number) => string; cleared: (n: number) => string; demo: string }
> = {
  mr: {
    title: "तुमची घंटागाडी",
    eta: (m) => `सुमारे ${m} मिनिटांत येईल`,
    here: "आत्ता तुमच्या गल्लीत आहे",
    none: "या भागात आज गाडीची फेरी नाही",
    open: (n) => `३०० मीटरमध्ये ${n} उघड्या तक्रारी`,
    cleared: (n) => `आज ${n} साफ झाल्या`,
    demo: "डेमो: खऱ्या रस्त्यांवर अनुमानित फेरी",
  },
  hi: {
    title: "आपकी कचरा गाड़ी",
    eta: (m) => `लगभग ${m} मिनट में आएगी`,
    here: "अभी आपकी गली में है",
    none: "इस इलाके में आज गाड़ी का फेरा नहीं है",
    open: (n) => `300 मीटर में ${n} खुली शिकायतें`,
    cleared: (n) => `आज ${n} साफ़ हुईं`,
    demo: "डेमो: असली सड़कों पर अनुमानित फेरा",
  },
  en: {
    title: "Your collection van",
    eta: (m) => `arrives in about ${m} min`,
    here: "is in your lane right now",
    none: "No van round passes here today",
    open: (n) => `${n} open reports within 300 m`,
    cleared: (n) => `${n} cleared today`,
    demo: "Demo: simulated round on real roads",
  },
};

/** Resident-facing: when the ghanta gaadi reaches this spot, plus what is open nearby. */
export function VanEtaCard({
  routes,
  lat,
  lon,
  now,
  tickets,
  lang,
}: {
  routes: Routes | null;
  lat: number;
  lon: number;
  now: number;
  tickets: Ticket[];
  lang: Lang;
}) {
  const c = COPY[lang];
  const next = routes ? nextVan(routes, lat, lon, now, 160) : null;
  const near = tickets.filter((t) => metres(lat, lon, t.lat, t.lon) <= 300);
  const open = near.filter((t) => isOpenAt(t, now)).length;
  const cleared = near.filter((t) => t.resolvedAt !== undefined && now - t.resolvedAt < 24 * HOUR).length;
  const mins = next ? Math.max(0, Math.round(next.etaMin)) : 0;
  const loopMin = next ? next.van.lengthM / (12_000 / 60) : 1;
  const closeness = next ? Math.max(0.04, 1 - next.etaMin / loopMin) : 0;
  return (
    <section className="mt-4 overflow-hidden rounded-[6px] border-[3px] border-ink">
      <div className="flex items-center gap-3 bg-ink px-4 py-3 text-letter">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-chrome text-ink">
          <Truck size={24} strokeWidth={2.4} />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`${lang === "en" ? "sign text-[22px]" : "painted text-[20px]"} leading-tight`}>{c.title}</p>
          {next ? (
            <p className="text-[15px] font-semibold text-chrome">
              <span className="sign tabular text-[18px]">{next.van.id}</span> {mins <= 1 ? c.here : c.eta(mins)}
            </p>
          ) : (
            <p className="text-[14px] text-letter/70">{c.none}</p>
          )}
        </div>
      </div>
      {next && (
        <div className="bg-ink/90 px-4 pb-3">
          <div className="relative h-[10px] rounded-full bg-letter/15">
            <span
              className="absolute top-1/2 h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-ink bg-chrome transition-[left] duration-700 ease-out"
              style={{ left: `${closeness * 100}%` }}
            />
            <span className="absolute right-0 top-1/2 h-[14px] w-[14px] -translate-y-1/2 rounded-full bg-vermilion" />
          </div>
          <p className="mt-1.5 text-[11px] text-letter/55">{c.demo}</p>
        </div>
      )}
      <div className="grid grid-cols-2 divide-x-[3px] divide-ink text-center">
        <p className="px-2 py-2 text-[14px] font-bold">{c.open(open)}</p>
        <p className="px-2 py-2 text-[14px] font-bold">{c.cleared(cleared)}</p>
      </div>
    </section>
  );
}

/** Crew-facing: today's van rounds in this zone, moving live. */
export function ZoneRounds({ routes, zone, now }: { routes: Routes | null; zone: ZoneId; now: number }) {
  if (!routes) return null;
  const vans = routes.vans.map((v, index) => ({ v, index })).filter(({ v }) => v.zone === zone);
  return (
    <section className="mx-3 mt-3 rounded-[4px] bg-board-deep px-3.5 py-3" aria-label={`Van rounds in ${ZONES[zone].name}`}>
      <h2 className="sign mb-2 flex items-center gap-2 text-[20px] text-chrome">
        <Truck size={18} /> Today&apos;s van rounds
      </h2>
      <ul className="space-y-2.5">
        {vans.map(({ v, index }) => {
          const d = vanDistance(v, now, index);
          const skipped = routes.lanes.filter((l) => l[4] === v.id && !l[5]).length;
          return (
            <li key={v.id}>
              <div className="flex items-baseline justify-between text-[14px]">
                <span>
                  <span className="sign text-[18px] text-letter">{v.id}</span> <span className="text-letter/70">{v.name}</span>
                </span>
                <span className="text-[13px] font-semibold text-vermilion">{skipped} lanes skipped</span>
              </div>
              <div className="mt-1 h-[8px] overflow-hidden rounded-full bg-board">
                <div className="h-full rounded-full bg-chrome transition-[width] duration-700 ease-out" style={{ width: `${(d / v.lengthM) * 100}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
