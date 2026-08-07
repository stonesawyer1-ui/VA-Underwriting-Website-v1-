import Link from "next/link";
import { ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-600",
  secondary:
    "bg-navy-900 text-white hover:bg-navy-800 focus-visible:outline-navy-900",
  ghost:
    "bg-transparent text-navy-900 border border-navy-900/20 hover:border-navy-900/50 focus-visible:outline-navy-900",
};

export function CTAButton({
  href,
  children,
  variant = "primary",
  className = "",
}: {
  href: string;
  children: ReactNode;
  variant?: Variant;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center gap-2 rounded-sm px-6 py-3.5 text-sm font-semibold tracking-wide uppercase transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${variantClasses[variant]} ${className}`}
    >
      {children}
    </Link>
  );
}
