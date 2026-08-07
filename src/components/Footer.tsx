import Link from "next/link";
import { siteConfig } from "@/lib/site";

const columns = [
  {
    title: "Site",
    links: [
      { href: "/", label: "Home" },
      { href: "/pricing", label: "Pricing" },
      { href: "/sample-memo", label: "Sample Memo" },
      { href: "/get-started", label: "Get Started" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/contact", label: "Contact" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-navy-950 text-white">
      <div className="mx-auto w-full max-w-6xl px-6 py-14 lg:px-8">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="font-display text-lg font-bold tracking-tight">
              {siteConfig.shortName}
              <span className="text-red-500">.</span>
            </div>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/60">
              {siteConfig.description}
            </p>
            <a
              href={`mailto:${siteConfig.email}`}
              className="mt-4 inline-block text-sm font-medium text-white/80 underline decoration-white/30 underline-offset-4 hover:text-white"
            >
              {siteConfig.email}
            </a>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <div className="text-xs font-semibold tracking-[0.2em] text-white/40 uppercase">
                {col.title}
              </div>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-white/70 hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-white/10 pt-8 text-xs text-white/40 sm:flex-row sm:items-center sm:justify-between">
          <p>
            &copy; {new Date().getFullYear()} {siteConfig.name}. All rights reserved.
          </p>
          <p className="max-w-xl leading-relaxed">
            {siteConfig.shortName} is not affiliated with, endorsed by, or acting on
            behalf of the Department of Veterans Affairs or any government agency.
            We provide independent, informational risk analysis only — not a loan,
            appraisal, tax, or legal determination.
          </p>
        </div>
      </div>
    </footer>
  );
}
