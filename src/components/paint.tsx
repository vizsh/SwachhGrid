"use client";

import { useEffect, useRef, useState } from "react";
import { CATEGORIES, type Ticket, fmtAge, HOUR } from "@/lib/domain";

/**
 * The rubber stamp that marks proof.
 * strike=true strikes on mount; strike=false sits at rest; omitted strikes once when scrolled into view.
 */
export function Stamp({
  top = "CLEARED",
  bottom = "साफ · photo proof",
  strike,
  className = "",
  size = "md",
}: {
  top?: string;
  bottom?: string;
  strike?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [hit, setHit] = useState(strike === true);
  useEffect(() => {
    if (strike !== undefined || !ref.current) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setHit(true);
          io.disconnect();
        }
      },
      { threshold: 0.8 },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [strike]);
  const s = size === "lg" ? "text-[44px]" : size === "sm" ? "text-[22px]" : "text-[32px]";
  return (
    <span ref={ref} className={`stamp ${hit ? "stamp-strike" : ""} ${className}`} aria-label={`${top}, ${bottom}`}>
      <span className={`sign ${s} font-semibold`}>{top}</span>
      <span className="text-[11px] font-bold tracking-wide">{bottom}</span>
    </span>
  );
}

/** Category paints: chrome, letter white, sign blue (and its wash), chrome-deep, vermilion. */
export const CAT_PAINT: Record<Ticket["cat"], string> = {
  garbage_dump: "#F2B705",
  overflowing_bin: "#F4F1E8",
  blocked_drain: "#2F6DB5",
  stagnant_water: "#7EAADE",
  missed_collection: "#D99A00",
  dead_animal: "#D7372B",
};

/**
 * The custody line: one painted line through a report's life.
 * Done folds are solid; pending folds are open rings on a dashed line.
 */
export function CustodyLine({
  t,
  tone = "dark",
  labels,
}: {
  t: Ticket;
  tone?: "dark" | "light";
  labels?: [string, string, string, string];
}) {
  const resolved = t.status === "resolved";
  const L = labels ?? ["Reported", "Assigned to crew", "Work started", "Cleared with photo proof"];
  const steps: { label: string; done: boolean; when?: string }[] = [
    { label: L[0], done: true, when: new Date(t.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) },
    { label: L[1], done: t.status !== "open" },
    { label: L[2], done: t.status === "in_progress" || resolved },
    {
      label: L[3],
      done: resolved,
      when: resolved && t.resolvedAt ? `after ${fmtAge((t.resolvedAt - t.createdAt) / HOUR)}` : undefined,
    },
  ];
  const ink = tone === "dark" ? "var(--color-chrome)" : "var(--color-ink)";
  const dim = tone === "dark" ? "rgb(244 241 232 / 0.25)" : "rgb(22 19 15 / 0.25)";
  return (
    <ol className="relative">
      {steps.map((s, i) => {
        const nextDone = steps[i + 1]?.done;
        return (
          <li key={s.label} className="relative flex gap-3 pb-4 last:pb-0">
            {i < steps.length - 1 && (
              <span
                aria-hidden
                className="absolute left-[7px] top-4 h-[calc(100%-8px)] w-[3px]"
                style={{
                  background: nextDone ? ink : `repeating-linear-gradient(${dim} 0 5px, transparent 5px 10px)`,
                }}
              />
            )}
            <span
              aria-hidden
              className="relative mt-[3px] h-[17px] w-[17px] shrink-0 rounded-full"
              style={{ background: s.done ? ink : "transparent", border: `3px solid ${s.done ? ink : dim}` }}
            />
            <span className={s.done ? "" : "opacity-70"}>
              <span className="block text-[15px] font-bold leading-tight">{s.label}</span>
              {s.when && <span className="block text-[13px] opacity-70">{s.when}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function catLabel(t: Ticket) {
  return CATEGORIES[t.cat].label;
}
