"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Category } from "./domain";
import type { Lang } from "./i18n";

/**
 * Voice reporting for residents who would rather speak than read.
 * Speech-to-text is the browser's own (Web Speech API: Chrome, Edge, Android, Safari 14.5+),
 * so there is no key and no audio leaves the browser through our code. The transcript is matched to a
 * category with plain keyword lists in Marathi, Hindi, English and common Roman-script spellings.
 */

const WORDS: Record<Category, string[]> = {
  dead_animal: ["मृत", "मेलेला", "मेलेले", "मेली", "मरा हुआ", "मरी हुई", "मृत पशु", "जनावर", "कुत्रा", "कुत्ता", "डुक्कर", "सुअर", "उंदीर", "चूहा", "dead", "carcass", "animal", "kutta", "kutra", "mara hua"],
  missed_collection: ["गाडी आली नाही", "गाडी नाही", "घंटागाडी", "घंटा गाडी", "गाड़ी नहीं", "गाड़ी नही", "कचरा गाड़ी", "कचरा गाडी", "truck", "van", "ghanta gadi", "ghantagadi", "gadi nahi", "did not come", "didn't come", "not come", "collection"],
  blocked_drain: ["गटार", "नाली", "नाला", "तुंबले", "तुंबलेले", "चोक", "जाम", "drain", "gutter", "nali", "nala", "gatar", "sewer", "choked", "blocked", "overflowing drain"],
  stagnant_water: ["साचलेले पाणी", "साचले", "पाणी साचले", "डबके", "रुका हुआ पानी", "पानी जमा", "जमा पानी", "पानी", "पाणी", "डास", "मच्छर", "stagnant", "water", "puddle", "mosquito", "machhar", "pani"],
  overflowing_bin: ["कचराकुंडी", "कचरा कुंडी", "कुंडी", "डबा", "कूड़ेदान", "कूडेदान", "डस्टबिन", "भरली", "भरा", "bin", "dustbin", "kundi", "full", "overflow"],
  garbage_dump: ["कचरा", "कचऱ्याचा", "कचऱ्याचा ढीग", "ढीग", "ढेर", "कूड़ा", "कूडा", "घाण", "गंदगी", "garbage", "trash", "rubbish", "waste", "dump", "kachra", "kachara", "kuda", "pile"],
};

// more specific problems are checked first: "कचरा गाडी आली नाही" is a missed collection, not a dump
const ORDER: Category[] = ["dead_animal", "missed_collection", "blocked_drain", "stagnant_water", "overflowing_bin", "garbage_dump"];

export function matchCategory(text: string): Category | null {
  const s = ` ${text.toLowerCase()} `;
  let best: { cat: Category; score: number } | null = null;
  ORDER.forEach((cat, rank) => {
    let score = 0;
    for (const w of WORDS[cat]) if (s.includes(w.toLowerCase())) score += w.length;
    if (score > 0) {
      const weighted = score * (1 + (ORDER.length - rank) * 0.15);
      if (!best || weighted > best.score) best = { cat, score: weighted };
    }
  });
  return (best as { cat: Category } | null)?.cat ?? null;
}

const LOCALE: Record<Lang, string> = { mr: "mr-IN", hi: "hi-IN", en: "en-IN" };

type Rec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
};

function recognizer(): (new () => Rec) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useSpeechInput(lang: Lang) {
  const [supported] = useState(() => recognizer() !== null);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Rec | null>(null);

  const start = useCallback(() => {
    const R = recognizer();
    if (!R) return;
    const r = new R();
    r.lang = LOCALE[lang];
    r.interimResults = true;
    r.continuous = false;
    r.maxAlternatives = 1;
    setTranscript("");
    setError(null);
    r.onresult = (e) => {
      let s = "";
      for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript;
      setTranscript(s);
    };
    r.onerror = (e) => setError(e.error);
    r.onend = () => setListening(false);
    rec.current = r;
    setListening(true);
    r.start();
  }, [lang]);

  const stop = useCallback(() => rec.current?.stop(), []);
  useEffect(() => () => rec.current?.stop(), []);
  return { supported, listening, transcript, setTranscript, error, start, stop };
}

/** Read text aloud in the chosen language. Marathi falls back to a Hindi voice, which reads Devanagari. */
export function speak(text: string, lang: Lang) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voices = synth.getVoices();
  const want = LOCALE[lang];
  const v =
    voices.find((x) => x.lang === want) ??
    voices.find((x) => x.lang.startsWith(want.slice(0, 2))) ??
    (lang === "mr" ? voices.find((x) => x.lang.startsWith("hi")) : undefined) ??
    voices.find((x) => x.lang.startsWith("en-IN"));
  if (v) u.voice = v;
  u.lang = v?.lang ?? want;
  u.rate = 0.92;
  synth.speak(u);
  return true;
}
