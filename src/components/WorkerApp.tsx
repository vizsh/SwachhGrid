"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Camera, MapPinOff, Navigation, ShieldCheck } from "lucide-react";
import { CATEGORIES, type Ticket, ZONES, ZONE_IDS, type ZoneId, ageHours, fmtAge, isOverdue, metres, peopleExposed, priority } from "@/lib/domain";
import { fileToSmallDataUrl, getPosition } from "@/lib/photo";
import { useStore, useTickets } from "@/lib/store";
import MiniMap from "./MiniMap";
import { ZoneRounds } from "./VanCards";
import { TodaysRoute } from "./CrewRoute";
import { useClock, useRoutes } from "@/lib/vans";
import { CAT_PAINT, CustodyLine, Stamp } from "./paint";

const GEOFENCE_M = 50;

export default function WorkerApp() {
  const load = useStore((s) => s.load);
  const density = useStore((s) => s.density);
  const patch = useStore((s) => s.patch);
  const tickets = useTickets();
  const [zone, setZone] = useState<ZoneId>("gandhibagh");
  const [openId, setOpenId] = useState<string | null>(() => new URLSearchParams(window.location.search).get("id"));
  const [now] = useState(() => Date.now());
  const routes = useRoutes();
  const tick = useClock(0.5);

  useEffect(() => void load(), [load]);

  const current = tickets.find((t) => t.id === openId) ?? null;

  const jobs = useMemo(
    () =>
      tickets
        .filter((t) => t.zone === zone && t.status !== "resolved")
        .map((t) => {
          const exposed = peopleExposed(density, t);
          return { t, exposed, score: priority(t, exposed, now) };
        })
        .sort((a, b) => b.score - a.score),
    [tickets, zone, density, now],
  );
  const late = jobs.filter(({ t }) => isOverdue(t, now)).length;

  return (
    <div className="grain mx-auto flex min-h-dvh w-full max-w-md flex-col bg-board text-letter">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b-[3px] border-chrome bg-board px-4 py-3">
        {current ? (
          <button
            onClick={() => setOpenId(null)}
            aria-label="Back to jobs"
            className="grid h-11 w-11 place-items-center rounded-full bg-chrome text-ink"
          >
            <ArrowLeft size={22} strokeWidth={2.5} />
          </button>
        ) : (
          <Link href="/" className="painted text-[22px] text-chrome">
            SwachhGrid
          </Link>
        )}
        <span className="sign text-[24px]">{current ? current.id : "Crew duty board"}</span>
      </header>

      {current ? (
        <Job key={current.id} t={current} exposed={peopleExposed(density, current)} now={now} onPatch={(p) => patch(current.id, p)} />
      ) : (
        <main className="flex-1 pb-6">
          <div className="grid grid-cols-3 gap-1 px-3 pt-3" role="tablist" aria-label="Zone">
            {ZONE_IDS.map((z) => (
              <button
                key={z}
                role="tab"
                aria-selected={zone === z}
                onClick={() => setZone(z)}
                className={`sign rounded-[3px] pb-1.5 pt-2.5 text-[20px] ${zone === z ? "bg-chrome text-ink" : "bg-board-deep text-letter/75"}`}
              >
                {ZONES[z].name}
              </button>
            ))}
          </div>
          <ZoneRounds routes={routes} zone={zone} now={tick} />
          {density && <TodaysRoute zone={zone} jobs={jobs} now={now} onOpen={setOpenId} />}
          <div className="flex items-end justify-between px-4 pb-2 pt-5">
            <div>
              <div className="sign tabular text-[56px] leading-none text-chrome">{jobs.length}</div>
              <div className="text-[14px] font-semibold text-letter/75">open jobs, most people affected first</div>
            </div>
            <div className="text-right">
              <div className="sign tabular text-[40px] leading-none text-vermilion">{late}</div>
              <div className="text-[14px] font-semibold text-letter/75">past deadline</div>
            </div>
          </div>
          <ol className="border-t-2 border-letter/25">
            {jobs.slice(0, 40).map(({ t, exposed }, i) => {
              const over = isOverdue(t, now);
              return (
                <li key={t.id}>
                  <button
                    onClick={() => setOpenId(t.id)}
                    className="grid w-full grid-cols-[2.2rem_1fr_auto] items-center gap-x-3 border-b-2 border-dashed border-letter/15 px-4 py-3.5 text-left active:bg-board-deep"
                  >
                    <span className="sign tabular text-[30px] text-letter/40">{i + 1}</span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="h-3 w-3 shrink-0 rounded-full ring-2 ring-board-deep" style={{ background: CAT_PAINT[t.cat] }} />
                        <span className="truncate text-[18px] font-bold">{CATEGORIES[t.cat].label}</span>
                      </span>
                      <span className="block truncate text-[15px] text-letter/70">
                        {t.locality} · ~{exposed.toLocaleString("en-IN")} people nearby
                      </span>
                    </span>
                    <span className={`sign tabular text-right text-[24px] ${over ? "text-vermilion" : "text-letter/75"}`}>
                      {fmtAge(ageHours(t, now))}
                      {over && <span className="block text-[16px]">late</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          {jobs.length === 0 && <p className="painted px-4 pt-12 text-center text-[26px]">No open jobs in this zone.</p>}
        </main>
      )}
    </div>
  );
}

function Job({ t, exposed, now, onPatch }: { t: Ticket; exposed: number; now: number; onPatch: (p: Partial<Ticket>) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [after, setAfter] = useState<string | undefined>();
  const [check, setCheck] = useState<"idle" | "checking" | "ok" | "far" | "nogps">("idle");
  const [distance, setDistance] = useState<number | null>(null);
  const [simulate, setSimulate] = useState(false);
  const [justClosed, setJustClosed] = useState(false);
  const here = useMemo(() => [t], [t]);
  const resolved = t.status === "resolved";
  const over = isOverdue(t, now);

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setAfter(await fileToSmallDataUrl(f));
    setCheck("checking");
    const p = await getPosition();
    if (!p) return setCheck("nogps");
    const d = metres(p.lat, p.lon, t.lat, t.lon);
    setDistance(d);
    setCheck(d <= GEOFENCE_M ? "ok" : "far");
  }

  const canClose = !!after && (check === "ok" || simulate);
  const away = distance === null ? "" : distance > 2000 ? `${Math.round(distance / 1000)} km` : `${Math.round(distance)} m`;

  return (
    <main className="flex flex-1 flex-col">
      <div className="relative h-52 border-b-[3px] border-chrome">
        <MiniMap center={{ lat: t.lat, lon: t.lon }} tickets={here} interactive={false} />
      </div>
      <div className="flex flex-1 flex-col gap-5 p-4">
        <div>
          <h1 className="sign flex items-center gap-3 text-[44px] text-letter">
            <span aria-hidden className="h-4 w-4 shrink-0 rounded-full ring-2 ring-board-deep" style={{ background: CAT_PAINT[t.cat] }} />
            {CATEGORIES[t.cat].label}
          </h1>
          <p className="text-[16px] text-letter/80">
            {t.locality} · {ZONES[t.zone].name}, Zone {ZONES[t.zone].no}
          </p>
        </div>

        <dl className="grid grid-cols-2 divide-x-2 divide-letter/20 rounded-[4px] bg-board-deep">
          <div className="px-3 py-2.5">
            <dd className="sign tabular text-[30px] text-chrome">~{exposed.toLocaleString("en-IN")}</dd>
            <dt className="text-[13px] font-semibold text-letter/70">people within 100 m</dt>
          </div>
          <div className="px-3 py-2.5">
            <dd className={`sign tabular text-[30px] ${over && !resolved ? "text-vermilion" : "text-letter"}`}>
              {fmtAge(resolved && t.resolvedAt ? (t.resolvedAt - t.createdAt) / 3600_000 : ageHours(t, now))}
            </dd>
            <dt className="text-[13px] font-semibold text-letter/70">{resolved ? "to clear" : over ? "open, past deadline" : "open"}</dt>
          </div>
        </dl>

        {t.photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.photo} alt="Reported problem" className="aspect-[4/3] w-full rounded-[4px] object-cover" />
        )}
        {t.reopened && <p className="rounded-[4px] bg-vermilion px-3 py-2.5 text-[15px] font-bold">The resident reopened this: not cleaned last time.</p>}

        {resolved ? (
          <div className="relative rounded-[6px] bg-letter p-5 text-ink">
            <CustodyLine t={t} tone="light" />
            <div className="-mt-6 flex justify-end pr-1">
              <Stamp strike={justClosed} size="lg" />
            </div>
            {t.photo && t.afterPhoto && (
              <div className="mt-4 grid grid-cols-2 gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.photo} alt="Before" className="aspect-[4/3] w-full rounded-[3px] object-cover" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.afterPhoto} alt="After" className="aspect-[4/3] w-full rounded-[3px] object-cover" />
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${t.lat},${t.lon}`}
                target="_blank"
                rel="noreferrer"
                className="btn-paint border-[2.5px] border-letter text-letter"
              >
                <Navigation size={18} /> Navigate
              </a>
              <button
                onClick={() => onPatch({ status: "in_progress" })}
                disabled={t.status === "in_progress"}
                className="btn-paint bg-chrome text-ink disabled:bg-board-deep disabled:text-letter/70 disabled:opacity-100"
              >
                {t.status === "in_progress" ? "Work started" : "Start work"}
              </button>
            </div>

            <section className="rounded-[6px] bg-letter p-4 text-ink">
              <h2 className="sign flex items-center gap-2 text-[30px]">
                <ShieldCheck size={26} strokeWidth={2.4} className="text-board" /> Proof of clean
              </h2>
              <p className="mb-3 mt-1 text-[15px] font-medium leading-snug">
                Take the after-photo at the spot. The job closes only within {GEOFENCE_M} m of where it was reported.
              </p>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onPhoto} className="hidden" />
              <button
                onClick={() => fileRef.current?.click()}
                className="relative grid aspect-[4/3] w-full place-items-center overflow-hidden rounded-[4px] border-[3px] border-dashed border-ink/50"
              >
                {after ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={after} alt="" className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <span className="flex flex-col items-center gap-2">
                    <span className="grid h-16 w-16 place-items-center rounded-full bg-board text-letter">
                      <Camera size={32} strokeWidth={2.2} />
                    </span>
                    <span className="sign text-[24px]">Take after-photo</span>
                  </span>
                )}
              </button>

              {check === "checking" && <p className="mt-3 text-[15px] font-semibold">Checking your location…</p>}
              {check === "ok" && <p className="mt-3 text-[15px] font-bold text-board">On the spot: {away} from the report.</p>}
              {(check === "far" || check === "nogps") && (
                <div className="mt-3 rounded-[4px] bg-chrome p-3 text-[15px]">
                  <p className="flex items-start gap-2 font-bold">
                    <MapPinOff size={18} className="mt-0.5 shrink-0" />
                    {check === "far" ? `You are ${away} away. This job cannot be closed from here.` : "Location unavailable. This job cannot be closed without it."}
                  </p>
                  <label className="mt-2 flex items-center gap-2 font-semibold">
                    <input type="checkbox" checked={simulate} onChange={(e) => setSimulate(e.target.checked)} className="h-5 w-5 accent-ink" />
                    Demo only: pretend I am on the spot
                  </label>
                </div>
              )}

              <button
                disabled={!canClose}
                onClick={() => {
                  setJustClosed(true);
                  onPatch({ status: "resolved", resolvedAt: Date.now(), afterPhoto: after, reopened: false });
                }}
                className="btn-paint mt-4 w-full bg-board py-[0.85em] text-[1.6rem] text-letter disabled:bg-ink/15 disabled:text-ink/50 disabled:opacity-100"
              >
                Close job
              </button>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
