"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

/** Segmented resource meter that flashes a delta badge when the value changes. */
export function ResourceBar({
  label,
  value,
  max,
  color,
  segments = true,
  suffix,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  segments?: boolean;
  suffix?: string;
}) {
  const prev = useRef(value);
  const [delta, setDelta] = useState<{ v: number; key: number } | null>(null);
  useEffect(() => {
    if (value !== prev.current) {
      const d = value - prev.current;
      prev.current = value;
      const t0 = setTimeout(() => setDelta({ v: d, key: Date.now() }), 0);
      const t = setTimeout(() => setDelta(null), 1800);
      return () => {
        clearTimeout(t0);
        clearTimeout(t);
      };
    }
  }, [value]);

  const clamped = Math.max(0, Math.min(max, value));
  return (
    <div className="relative" aria-label={`${label}: ${value}${suffix ?? ""} of ${max}`}>
      <div className="mb-0.5 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-ink-faint">
        <span>{label}</span>
        <span className="text-ink">
          {value}
          {suffix}
        </span>
      </div>
      {segments && max <= 6 ? (
        <div className="flex gap-0.5">
          {Array.from({ length: max }, (_, i) => (
            <motion.div
              key={i}
              className="h-1.5 flex-1 rounded-[1px]"
              animate={{ backgroundColor: i < clamped ? color : "#2a2347", opacity: i < clamped ? 1 : 0.6 }}
              transition={{ duration: 0.35 }}
            />
          ))}
        </div>
      ) : (
        <div className="h-1.5 overflow-hidden rounded-[1px] bg-line">
          <motion.div className="h-full" style={{ backgroundColor: color }} animate={{ width: `${(clamped / max) * 100}%` }} transition={{ duration: 0.45 }} />
        </div>
      )}
      <AnimatePresence>
        {delta && (
          <motion.span
            key={delta.key}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: -10 }}
            exit={{ opacity: 0 }}
            className={`pointer-events-none absolute right-0 top-0 font-mono text-xs font-bold ${delta.v < 0 ? "text-rose-400" : "text-emerald-300"}`}
          >
            {delta.v > 0 ? `+${delta.v}` : delta.v}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
