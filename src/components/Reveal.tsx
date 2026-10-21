"use client";

import { motion } from "framer-motion";

/** Fades and lifts its children in the first time they scroll into view. */
export function Reveal({ children, delay = 0, className, y = 28 }: { children: React.ReactNode; delay?: number; className?: string; y?: number }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, amount: 0.25 }}
      variants={{ hidden: { opacity: 0, y }, shown: { opacity: 1, y: 0 } }}
      transition={{ duration: 0.6, delay, ease: [0.2, 0.7, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** A thin meter that fills to `value` (0..1). Place it inside a Reveal: it fills when that Reveal comes into view. */
export function FillBar({ value, color, delay = 0 }: { value: number; color: string; delay?: number }) {
  return (
    <div className="mt-1.5 h-[3px] overflow-hidden bg-line">
      <motion.div
        className="h-full origin-left"
        style={{ background: color, width: `${value * 100}%` }}
        variants={{ hidden: { scaleX: 0 }, shown: { scaleX: 1, transition: { duration: 0.9, delay: delay + 0.4, ease: [0.2, 0.7, 0.2, 1] } } }}
      />
    </div>
  );
}

/** A coloured rule that draws itself left to right when it scrolls into view. */
export function DrawLine({ color, delay = 0 }: { color: string; delay?: number }) {
  return (
    <motion.span
      aria-hidden="true"
      className="block h-[3px] origin-left"
      style={{ background: color }}
      initial={{ scaleX: 0 }}
      whileInView={{ scaleX: 1 }}
      viewport={{ once: true, amount: 0.8 }}
      transition={{ duration: 0.7, delay, ease: [0.7, 0, 0.3, 1] }}
    />
  );
}
