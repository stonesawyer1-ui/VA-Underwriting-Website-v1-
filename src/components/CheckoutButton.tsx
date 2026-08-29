"use client";

import { useState } from "react";
import type { ReactNode } from "react";

const variantClasses = {
  primary: "bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-600",
  secondary: "bg-navy-900 text-white hover:bg-navy-800 focus-visible:outline-navy-900",
};

export function CheckoutButton({
  tierId,
  children,
  variant = "primary",
  className = "",
}: {
  tierId: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tierId }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) {
        throw new Error(json.error ?? "Could not start checkout.");
      }
      window.location.href = json.url;
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Could not start checkout.");
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={status === "loading"}
        className={`inline-flex w-full items-center justify-center gap-2 rounded-sm px-6 py-3.5 text-sm font-semibold tracking-wide uppercase transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60 ${variantClasses[variant]} ${className}`}
      >
        {status === "loading" ? "Redirecting…" : children}
      </button>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
