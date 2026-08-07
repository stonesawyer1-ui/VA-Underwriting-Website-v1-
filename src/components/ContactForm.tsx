"use client";

import { useState } from "react";

const inputClasses =
  "w-full rounded-sm border border-navy-900/15 bg-white px-4 py-3 text-sm text-navy-900 outline-none transition-colors focus:border-navy-900 focus:ring-2 focus:ring-red-600/20";
const labelClasses = "block text-sm font-semibold text-navy-900";

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setError(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Something went wrong.");
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (status === "sent") {
    return (
      <div className="rounded-sm border border-navy-900/10 bg-white p-8 text-center shadow-xl shadow-navy-950/10">
        <h2 className="font-display text-xl font-bold text-navy-900">
          Message sent
        </h2>
        <p className="mt-2 text-sm text-navy-900/60">
          Thanks for reaching out — we&apos;ll reply as soon as we can.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-sm border border-navy-900/10 bg-white p-8 shadow-xl shadow-navy-950/10"
    >
      {error && (
        <div className="rounded-sm border border-red-600/20 bg-red-100 p-4 text-sm text-red-700">
          {error}
        </div>
      )}
      <div>
        <label className={labelClasses} htmlFor="contact-name">Name</label>
        <input
          id="contact-name"
          className={`mt-2 ${inputClasses}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <div>
        <label className={labelClasses} htmlFor="contact-email">Email</label>
        <input
          id="contact-email"
          type="email"
          className={`mt-2 ${inputClasses}`}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div>
        <label className={labelClasses} htmlFor="contact-message">Message</label>
        <textarea
          id="contact-message"
          rows={5}
          className={`mt-2 ${inputClasses}`}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
        />
      </div>
      <button
        type="submit"
        disabled={status === "submitting"}
        className="inline-flex w-full items-center justify-center rounded-sm bg-red-600 px-7 py-3.5 text-sm font-semibold tracking-wide text-white uppercase transition-colors hover:bg-red-700 disabled:opacity-60"
      >
        {status === "submitting" ? "Sending…" : "Send Message"}
      </button>
    </form>
  );
}
