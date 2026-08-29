"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { siteConfig } from "@/lib/site";

const links = [
  { href: "/", label: "Home" },
  { href: "/pricing", label: "Pricing" },
  { href: "/sample-report", label: "Sample Report" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-navy-900/10 bg-white/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4 lg:px-8">
        <Link
          href="/"
          className="font-display text-lg font-bold tracking-tight text-navy-900"
          onClick={() => setOpen(false)}
        >
          {siteConfig.shortName}
          <span className="text-red-600">.</span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm font-medium transition-colors hover:text-navy-900 ${
                pathname === link.href ? "text-navy-900" : "text-navy-900/60"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:block">
          <Link
            href="/get-started"
            className="inline-flex items-center justify-center rounded-sm bg-red-600 px-5 py-2.5 text-sm font-semibold tracking-wide text-white uppercase transition-colors hover:bg-red-700"
          >
            Get Your Underwriting Report
          </Link>
        </div>

        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center text-navy-900 md:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
            {open ? (
              <path d="M2 2L20 20M20 2L2 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            ) : (
              <path d="M1 5H21M1 11H21M1 17H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </div>

      {open && (
        <div className="border-t border-navy-900/10 bg-white md:hidden">
          <nav className="flex flex-col gap-1 px-6 py-4">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={`rounded-sm px-3 py-2.5 text-sm font-medium ${
                  pathname === link.href
                    ? "bg-navy-50 text-navy-900"
                    : "text-navy-900/70"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/get-started"
              onClick={() => setOpen(false)}
              className="mt-2 inline-flex items-center justify-center rounded-sm bg-red-600 px-5 py-3 text-sm font-semibold tracking-wide text-white uppercase"
            >
              Get Your Underwriting Report
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
