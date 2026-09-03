"use client";

import { useId, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";

/**
 * A title + one-line teaser that's always visible, with the full
 * explanation tucked behind a click. Built for the homepage's "Problem" and
 * "How It Works" sections (2026-09-03, owner's request): those sections
 * used to show a full paragraph under every card, which read as a wall of
 * text on a page whose whole job is to get a visitor to the CTA fast. The
 * teaser alone carries the point; the expanded text is there for anyone who
 * wants the detail, not required reading for everyone.
 *
 * Plain <button>/aria-expanded/aria-controls — no external accordion
 * library — so this stays keyboard- and screen-reader-accessible for free.
 */
export function Disclosure({
  title,
  teaser,
  children,
  defaultOpen = false,
  eyebrow,
}: {
  title: string;
  teaser: string;
  children: ReactNode;
  defaultOpen?: boolean;
  /** Optional small label rendered above the title — used by the "How It Works" steps for their step number. */
  eyebrow?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <div>
      {eyebrow}
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="group flex w-full items-start justify-between gap-4 text-left"
      >
        <span className="min-w-0">
          <span className="block font-display text-lg font-bold text-navy-900">{title}</span>
          <span className="mt-1.5 block text-sm leading-relaxed text-navy-900/60">{teaser}</span>
        </span>
        <span
          aria-hidden
          className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-navy-900/15 text-navy-900/50 transition-all duration-200 group-hover:border-red-600/40 group-hover:text-red-600 ${
            open ? "rotate-45" : ""
          }`}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M5 0V10M0 5H10" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <p className="mt-3 text-sm leading-relaxed text-navy-900/60">{children}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
