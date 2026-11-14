"use client";

import Link from "next/link";
import { useState } from "react";
import { Download, MapPin, MousePointerClick, Share2, Truck, X } from "lucide-react";
import { type Ticket, ZONES, localityFor, zoneFor } from "@/lib/domain";
import type { CrewRoute } from "@/lib/roads";
import { BIN_EFFECT, type BinState, type Hotspot, type LaneScore, type LaneTier, TIER } from "@/lib/city";
import type { Routes } from "@/lib/vans";
import { FillBar, QrSvg, binUrl, fillLabel } from "./BinPages";

function Head({ title, sub, onClose }: { title: string; sub?: string; onClose?: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b-2 border-night-line px-4 pb-2 pt-3">
      <div>
        <h2 className="sign text-[24px] leading-none text-chrome">{title}</h2>
        {sub && <p className="mt-1 text-[13px] text-letter/65">{sub}</p>}
      </div>
      {onClose && (
        <button onClick={onClose} aria-label="Close" className="rounded-[3px] p-1 text-letter/70 hover:bg-night-line hover:text-letter">
          <X size={18} />
        </button>
      )}
    </div>
  );
}

function Num({ v, l, tone = "text-letter" }: { v: string; l: string; tone?: string }) {
  return (
    <div className="rounded-[4px] bg-night-deep px-3 py-2">
      <div className={`sign tabular text-[24px] leading-none ${tone}`}>{v}</div>
      <div className="mt-1 text-[11px] leading-tight text-letter/60">{l}</div>
    </div>
  );
}

const rgb = (c: [number, number, number]) => `rgb(${c.join(",")})`;

/* ---------------- Smart bin ---------------- */

export function BinPanel({
  state,
  nudge,
  onScan,
  onClose,
}: {
  state: BinState;
  nudge: { id: string; distM: number; etaMin: number } | null;
  onScan: () => void;
  onClose: () => void;
}) {
  const b = state.bin;
  const z = zoneFor(b.lat, b.lon);
  return (
    <div className="flex flex-col">
      <Head title={`Bin ${b.id}`} sub={`${localityFor(b.lat, b.lon)} · ${ZONES[z].name} zone · van ${b.van}`} onClose={onClose} />
      <div className="space-y-3 p-4">
        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-[13px] font-semibold text-letter/65">Fill, live</span>
            <span className={`sign text-[22px] ${state.fill >= 0.9 ? "text-vermilion" : "text-chrome"}`}>
              {Math.round(Math.min(1, state.fill) * 100)}% · {fillLabel(state)}
            </span>
          </div>
          <FillBar fill={state.fill} tall />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Num v={`${Math.round(state.sinceMin)} min`} l="since the van emptied it" />
          <Num v={`${Math.round(state.nextMin)} min`} l="until the van is back" />
          <Num v={`${state.homes}`} l="homes within 100 m" />
        </div>
        {state.fill >= 0.9 && nudge && (
          <div className="flex gap-2 rounded-[4px] bg-vermilion px-3 py-2.5 text-[14px]">
            <Truck size={18} className="mt-0.5 shrink-0" />
            <span>
              <b>Nudge sent to van {nudge.id}:</b> {Math.round(nudge.distM)} m away, about {Math.max(1, Math.round(nudge.etaMin))} min. The dashed line on
              the map is its detour.
            </span>
          </div>
        )}
        <div className="flex items-center gap-3 rounded-[4px] bg-letter p-3 text-ink">
          <QrSvg text={binUrl(b.id)} className="w-[92px] shrink-0" />
          <div className="text-[13px] leading-snug">
            <p className="sign text-[18px]">Sticker on the bin</p>
            Residents scan it and say “full” in one tap. {state.scans ? `${state.scans} scan${state.scans > 1 ? "s" : ""} since emptied.` : ""}
            <div className="mt-2 flex flex-wrap gap-2">
              <button onClick={onScan} className="sign rounded-[3px] bg-ink px-2.5 pb-0 pt-1 text-[15px] text-chrome">
                Simulate a scan
              </button>
              <Link href={`/bin?id=${b.id}`} target="_blank" className="sign rounded-[3px] border-2 border-ink px-2 pb-0 pt-0.5 text-[15px]">
                Open scan page
              </Link>
            </div>
          </div>
        </div>
        <p className="text-[11px] leading-snug text-letter/50">
          Model: fill rises with minutes since the van passed × homes nearby; one resident scan marks it full and nudges the nearest van. Simulated; with real sensors or scan data
          the same view shows the real bin.{" "}
          <Link href="/bins" className="underline">
            All stickers
          </Link>
        </p>
      </div>
    </div>
  );
}

/* ---------------- Clean-lane ribbons ---------------- */

export function LaneSummary({ counts, onClose }: { counts: Record<LaneTier, number>; onClose: () => void }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <div className="flex flex-col">
      <Head title="Clean lanes" sub={`${total.toLocaleString("en-IN")} lane pieces with a complaint in the last 30 days`} onClose={onClose} />
      <ul className="space-y-1.5 p-4">
        {(Object.keys(TIER) as LaneTier[]).map((k) => (
          <li key={k} className="flex items-center gap-3">
            <span className="h-[6px] w-10 rounded-full" style={{ background: rgb(TIER[k].color) }} />
            <span className="flex-1 text-[14px] font-semibold">{TIER[k].label}</span>
            <span className="sign tabular text-[20px]">{counts[k]}</span>
          </li>
        ))}
      </ul>
      <p className="flex items-center gap-2 px-4 pb-4 text-[13px] text-letter/65">
        <MousePointerClick size={15} /> Click a lane to see its streak and make a share card for the mohalla&apos;s WhatsApp group.
      </p>
    </div>
  );
}

function shareCard(locality: string, days: number, tier: LaneTier): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 1080;
  c.height = 1080;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  g.fillStyle = "#F2B705";
  g.fillRect(0, 0, 1080, 1080);
  g.strokeStyle = "#16130F";
  g.lineWidth = 14;
  g.strokeRect(40, 40, 1000, 1000);
  g.lineWidth = 4;
  g.strokeRect(64, 64, 952, 952);
  g.fillStyle = "#16130F";
  g.textAlign = "center";
  g.font = "700 64px 'Yatra One', 'Mukta', serif";
  g.fillText("आमची गल्ली स्वच्छ", 540, 230);
  g.font = "600 50px 'Teko', 'Mukta', sans-serif";
  g.fillText("OUR LANE, CLEAN", 540, 300);
  g.fillStyle = rgb(TIER[tier].color);
  g.fillRect(140, 360, 800, 330);
  g.fillStyle = "#16130F";
  g.font = "700 250px 'Teko', sans-serif";
  g.fillText(String(Math.floor(days)), 540, 620);
  g.font = "600 52px 'Teko', sans-serif";
  g.fillText("DAYS WITHOUT A COMPLAINT", 540, 770);
  g.font = "700 60px 'Mukta', sans-serif";
  g.fillText(locality, 540, 860);
  g.font = "500 34px 'Mukta', sans-serif";
  g.fillText("SwachhGrid · Nagpur · swachhgrid.vercel.app", 540, 960);
  return c;
}

export function LanePanel({ score, onClose }: { score: LaneScore; onClose: () => void }) {
  const [lon, lat] = score.lane.mid;
  const locality = localityFor(lat, lon);
  const z = zoneFor(lat, lon);
  const [note, setNote] = useState<string | null>(null);
  const clean = score.tier !== "dirty";
  const share = async () => {
    const canvas = shareCard(locality, score.days, score.tier);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/png"));
    if (!blob) return;
    const file = new File([blob], `clean-lane-${locality.replace(/\W+/g, "-")}.png`, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: "Our lane, clean" }).catch(() => {});
      setNote("Shared.");
    } else {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = file.name;
      a.click();
      setNote("Card downloaded. Post it to the mohalla's WhatsApp group.");
    }
  };
  return (
    <div className="flex flex-col">
      <Head title="Lane streak" sub={`${locality} · ${ZONES[z].name} zone`} onClose={onClose} />
      <div className="space-y-3 p-4">
        <div className="rounded-[4px] p-4 text-ink" style={{ background: rgb(TIER[score.tier].color) }}>
          <div className="sign text-[18px]">{TIER[score.tier].label}</div>
          <div className="sign tabular text-[56px] leading-none">{clean ? `${Math.floor(score.days)} days` : "Open now"}</div>
          <div className="text-[13px] font-semibold">{clean ? "since the last complaint here was filed or cleared" : "a complaint within 50 m is still open"}</div>
        </div>
        <div className="grid grid-cols-3 gap-1.5 text-center text-[11px] font-bold">
          {([7, 14, 21] as const).map((d) => (
            <div key={d} className={`rounded-[3px] px-1 py-1.5 ${score.days >= d ? "bg-leaf text-ink" : "bg-night-deep text-letter/50"}`}>
              {d} days
            </div>
          ))}
        </div>
        <p className="text-[13px] text-letter/70">
          {score.reports.length} complaint{score.reports.length > 1 ? "s" : ""} within 50 m in the last 30 days. A streak resets with the next complaint,
          so the lane, not a person, earns it.
        </p>
        {clean && (
          <button onClick={share} className="sign flex w-full items-center justify-center gap-2 rounded-[3px] bg-chrome px-3 pb-1 pt-2 text-[19px] text-ink hover:bg-chrome-deep">
            <Share2 size={17} /> Share “our lane, clean” card
          </button>
        )}
        {note && (
          <p className="flex items-center gap-1.5 text-[13px] text-leaf">
            <Download size={14} /> {note}
          </p>
        )}
      </div>
    </div>
  );
}

/* ---------------- What-if planner ---------------- */

export type PlanMode = "bin" | "shift";

export function PlannerPanel({
  mode,
  setMode,
  bin,
  binResult,
  vanId,
  setVanId,
  routes,
  shift,
  onClose,
}: {
  mode: PlanMode;
  setMode: (m: PlanMode) => void;
  bin: { lat: number; lon: number } | null;
  binResult: { homes: number; newHomes: number; reports: number; drop: number; nearestBinM: number } | null;
  vanId: string;
  setVanId: (id: string) => void;
  routes: Routes | null;
  shift: { lanes: unknown[]; lengthM: number; homes: number; confirmed: number; minutes: number } | null;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col">
      <Head title="What-if planner" sub="Try a change on the map before spending on it" onClose={onClose} />
      <div className="flex gap-1 p-2">
        {(
          [
            ["bin", "New community bin"],
            ["shift", "Extra van shift"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`sign flex-1 rounded-[3px] pb-1 pt-2 text-[17px] ${mode === m ? "bg-chrome text-ink" : "text-letter/70 hover:bg-night-line"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === "bin" ? (
        <div className="space-y-3 px-4 pb-4">
          <p className="flex items-start gap-2 text-[14px] text-letter/75">
            <MapPin size={16} className="mt-0.5 shrink-0 text-chrome" />
            {bin ? "Drag the yellow bin, or click anywhere to move it." : "Click the map where you would put a new community bin."} White rings are
            today&apos;s bins and their 100 m reach.
          </p>
          {bin && binResult && (
            <>
              <p className="sign text-[18px]">{localityFor(bin.lat, bin.lon)}</p>
              <div className="grid grid-cols-2 gap-2">
                <Num v={`+${binResult.newHomes}`} l="homes newly within 100 m of a bin" tone="text-chrome" />
                <Num v={`${binResult.homes}`} l="homes within 100 m in all" />
                <Num v={`−${binResult.drop}`} l={`reports a month (${binResult.reports} dumping reports here × ${BIN_EFFECT * 100}%)`} tone="text-leaf" />
                <Num v={`${Math.round(binResult.nearestBinM)} m`} l="to the nearest existing bin" />
              </div>
              <p className="text-[11px] leading-snug text-letter/50">
                The {BIN_EFFECT * 100}% drop is a planning assumption, not a measured effect. Homes come from real building footprints; reports from the
                last 30 days.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3 px-4 pb-4">
          <p className="text-[14px] text-letter/75">Pick a van. Its extra afternoon shift drives only the lanes it skipped today, shown in green.</p>
          <div className="flex flex-wrap gap-1.5">
            {routes?.vans.map((v) => (
              <button
                key={v.id}
                onClick={() => setVanId(v.id)}
                className={`sign rounded-[3px] px-2.5 pb-0 pt-1 text-[16px] ${vanId === v.id ? "bg-chrome text-ink" : "bg-night-line text-letter/80"}`}
              >
                {v.id}
              </button>
            ))}
          </div>
          {shift && (
            <div className="grid grid-cols-2 gap-2">
              <Num v={`${shift.lanes.length}`} l="skipped lanes covered" tone="text-leaf" />
              <Num v={`${(shift.lengthM / 1000).toFixed(1)} km`} l="of lanes, about" />
              <Num v={`~${Math.round(shift.homes * 4.5).toLocaleString("en-IN")}`} l="people along them (est.)" tone="text-chrome" />
              <Num v={`${shift.confirmed}`} l="open “truck did not come” reports it answers" />
            </div>
          )}
          {shift && (
            <p className="text-[12px] text-letter/60">
              About {Math.round(shift.minutes)} van-minutes, including the drive between lanes. Simulated rounds on real roads.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------- Next week's hotspots ---------------- */

export function ForecastPanel({ spots, onPick, onClose }: { spots: Hotspot[]; onPick: (h: Hotspot) => void; onClose: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Head title="Next week's hotspots" sub="Where crews should go before anyone complains" onClose={onClose} />
      <ol className="min-h-0 flex-1 overflow-y-auto">
        {spots.slice(0, 12).map((h, i) => (
          <li key={`${h.lat}-${h.lon}`}>
            <button onClick={() => onPick(h)} className="grid w-full grid-cols-[1.6rem_1fr_auto] items-center gap-2 border-b border-dashed border-night-line px-4 py-2 text-left hover:bg-night-line/70">
              <span className="sign text-[20px] text-letter/45">{i + 1}</span>
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-bold">{localityFor(h.lat, h.lon)}</span>
                <span className="block truncate text-[12px] text-letter/60">
                  {h.driver} · {h.reports} report{h.reports === 1 ? "" : "s"} in 30 days
                </span>
              </span>
              <span className="text-right">
                <span className={`sign tabular block text-[22px] ${h.likelihood >= 0.75 ? "text-vermilion" : "text-chrome"}`}>{Math.round(h.likelihood * 100)}%</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
      <p className="border-t-2 border-night-line px-4 py-2 text-[11px] leading-snug text-letter/50">
        A transparent heuristic, not a trained model: recent reports by kind with a 12-day decay, a bonus where reports keep coming back, skipped
        van lanes, and drains weighted up after heavy rain. The bars are the same score.
      </p>
    </div>
  );
}

/* ---------------- Crew routes of the day ---------------- */

export function CrewRoutesPanel({ plans, onPick, onClose }: { plans: CrewRoute[]; onPick: (t: Ticket) => void; onClose: () => void }) {
  const km = plans.reduce((s, p) => s + p.totalM, 0) / 1000;
  const people = plans.reduce((s, p) => s + p.people, 0);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Head title="Crew routes of the day" sub="Each zone's top jobs, in the shortest order on real lanes" onClose={onClose} />
      <div className="grid grid-cols-3 gap-2 p-3">
        <Num v={`${plans.reduce((s, p) => s + p.stops.length, 0)}`} l="stops in 3 zones" />
        <Num v={`${km.toFixed(1)} km`} l="of driving" />
        <Num v={`~${people.toLocaleString("en-IN")}`} l="people relieved" tone="text-chrome" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {plans.map((p) => (
          <section key={p.zone} className="border-t-2 border-night-line px-4 py-2.5">
            <div className="flex items-baseline justify-between">
              <h3 className="sign text-[20px] text-leaf">{ZONES[p.zone].name} crew</h3>
              <span className="text-[12px] font-semibold text-letter/60">
                {(p.totalM / 1000).toFixed(1)} km · {Math.floor(p.minutes / 60)} h {Math.round(p.minutes % 60)} min
              </span>
            </div>
            <ol className="mt-1 flex flex-wrap gap-1">
              {p.stops.map((st, i) => (
                <li key={st.t.id}>
                  <button
                    onClick={() => onPick(st.t)}
                    title={`${st.t.locality}, ~${st.exposed} people`}
                    className="sign rounded-[3px] bg-night-line px-2 pb-0 pt-1 text-[15px] hover:bg-leaf hover:text-ink"
                  >
                    {i + 1} · {st.t.locality.replace("near ", "")}
                  </button>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
      <p className="border-t-2 border-night-line px-4 py-2 text-[11px] leading-snug text-letter/50">
        Jobs chosen by priority per metre of road from the zone office, then ordered by shortest road distance (2-opt) over 31,133 OSM
        junctions. The green dot plays the plan back fast. The same route is in each crew&apos;s app.
      </p>
    </div>
  );
}
