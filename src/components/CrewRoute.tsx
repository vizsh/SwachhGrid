"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Navigation, Route } from "lucide-react";
import { CATEGORIES, type Ticket, type ZoneId, fmtAge, ageHours, isOverdue } from "@/lib/domain";
import { type CrewRoute as Plan, MIN_PER_STOP, crewRoute, mapsLink, useRoadGraph } from "@/lib/roads";
import MiniMap from "./MiniMap";
import { CAT_PAINT } from "./paint";

const hm = (min: number) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, "0")} min`;
const clock = (start: number, min: number) =>
  new Date(start + min * 60_000).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

/** The crew's plan for the day: the top jobs in the shortest road order, on real lanes. */
export function TodaysRoute({
  zone,
  jobs,
  now,
  onOpen,
}: {
  zone: ZoneId;
  jobs: { t: Ticket; exposed: number; score: number }[];
  now: number;
  onOpen: (id: string) => void;
}) {
  const g = useRoadGraph();
  const [open, setOpen] = useState(true);
  const plan: Plan | null = useMemo(() => (g && jobs.length ? crewRoute(g, zone, jobs) : null), [g, zone, jobs]);
  // the shift starts at 7 am today (or now, if later)
  const start = useMemo(() => {
    const d = new Date(now);
    d.setHours(7, 0, 0, 0);
    return Math.max(d.getTime(), now);
  }, [now]);
  const route = useMemo(
    () => (plan ? { path: plan.path, stops: plan.stops.map((s) => ({ lon: s.t.lon, lat: s.t.lat })), base: plan.base } : undefined),
    [plan],
  );

  return (
    <section className="mx-3 mt-3 overflow-hidden rounded-[6px] bg-letter text-ink">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 pb-2 pt-3 text-left" aria-expanded={open}>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-board text-chrome">
          <Route size={22} strokeWidth={2.4} />
        </span>
        <span className="flex-1">
          <span className="sign block text-[28px] leading-none">Today&apos;s route</span>
          <span className="text-[14px] font-semibold text-ink/70">
            {plan
              ? `${plan.stops.length} stops · ${(plan.totalM / 1000).toFixed(1)} km · ${hm(plan.minutes)}`
              : g
                ? "No open jobs"
                : "Planning on real lanes…"}
          </span>
        </span>
        <ChevronDown size={22} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && plan && (
        <>
          <div className="relative mx-3 h-60 overflow-hidden rounded-[4px] border-[2.5px] border-ink">
            <MiniMap center={{ lat: plan.base.lat, lon: plan.base.lon }} tickets={[]} route={route} />
          </div>
          <div className="grid grid-cols-3 divide-x-2 divide-ink/15 px-1 py-3 text-center">
            <div>
              <div className="sign tabular text-[26px] leading-none">~{plan.people.toLocaleString("en-IN")}</div>
              <div className="text-[12px] font-semibold text-ink/65">people relieved</div>
            </div>
            <div>
              <div className="sign tabular text-[26px] leading-none">{plan.stops.filter((s) => isOverdue(s.t, now)).length}</div>
              <div className="text-[12px] font-semibold text-ink/65">late jobs cleared</div>
            </div>
            <div>
              <div className="sign tabular text-[26px] leading-none">{clock(start, plan.minutes)}</div>
              <div className="text-[12px] font-semibold text-ink/65">done by</div>
            </div>
          </div>
          <ol className="border-t-2 border-ink/15">
            <li className="flex items-center gap-3 px-4 py-2 text-[14px] font-semibold text-ink/70">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-board text-[12px] font-bold text-letter">B</span>
              {plan.base.name}, {clock(start, 0)}
            </li>
            {plan.stops.map((s, i) => (
              <li key={s.t.id}>
                <button
                  onClick={() => onOpen(s.t.id)}
                  className="grid w-full grid-cols-[1.75rem_1fr_auto] items-center gap-x-3 border-t border-dashed border-ink/15 px-4 py-2.5 text-left active:bg-ink/5"
                >
                  <span className="sign grid h-7 w-7 place-items-center rounded-full border-2 border-ink bg-chrome text-[17px]">{i + 1}</span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-ink/20" style={{ background: CAT_PAINT[s.t.cat] }} />
                      <span className="truncate text-[16px] font-bold">{CATEGORIES[s.t.cat].label}</span>
                    </span>
                    <span className="block truncate text-[13px] text-ink/65">
                      {s.t.locality} · {s.legM < 30 ? "same lane" : `${(s.legM / 1000).toFixed(1)} km`} · ~{s.exposed} people
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="sign tabular block text-[19px]">{clock(start, s.etaMin)}</span>
                    <span className={`block text-[12px] font-bold ${isOverdue(s.t, now) ? "text-vermilion-deep" : "text-ink/55"}`}>
                      {fmtAge(ageHours(s.t, now))} open
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <div className="space-y-2 p-3">
            <a href={mapsLink(plan)} target="_blank" rel="noreferrer" className="btn-paint w-full bg-ink text-chrome">
              <Navigation size={18} /> Start route in Google Maps
            </a>
            <p className="px-1 text-[12px] leading-snug text-ink/60">
              The top jobs by people affected and days open, in the shortest order along real OpenStreetMap lanes. {MIN_PER_STOP} min per stop at 12
              km/h.
            </p>
          </div>
        </>
      )}
    </section>
  );
}
