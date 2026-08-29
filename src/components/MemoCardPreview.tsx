const rows = [
  { label: "Post-PCS Tax Reassessment", value: "+$412 / mo", level: "high" as const },
  { label: "Rent Coverage (post-PCS)", value: "94%", level: "moderate" as const },
  { label: "Market Rent Trend (12 mo)", value: "+2.1%", level: "low" as const },
  { label: "Vacancy Risk Factor", value: "Low", level: "low" as const },
];

const levelClasses = {
  high: "bg-red-100 text-red-700",
  moderate: "bg-amber-100 text-amber-700",
  low: "bg-emerald-100 text-emerald-700",
};

export function MemoCardPreview({ className = "" }: { className?: string }) {
  return (
    <div
      className={`w-full max-w-sm rounded-sm border border-navy-900/10 bg-white p-6 shadow-2xl shadow-navy-950/30 ${className}`}
    >
      <div className="flex items-center justify-between border-b border-navy-900/10 pb-4">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.2em] text-navy-900/40 uppercase">
            VA Home Underwriting Report
          </p>
          <p className="mt-1 font-display text-sm font-bold text-navy-900">
            123 Sample Ct, Fayetteville, NC
          </p>
        </div>
        <span className="rounded-sm bg-navy-50 px-2 py-1 text-[10px] font-semibold tracking-wide text-navy-900/60 uppercase">
          Sample
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3">
            <span className="text-xs text-navy-900/60">{row.label}</span>
            <span
              className={`rounded-sm px-2 py-1 text-xs font-semibold whitespace-nowrap ${levelClasses[row.level]}`}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-sm bg-navy-50 p-3">
        <p className="text-[10px] font-semibold tracking-[0.15em] text-navy-900/50 uppercase">
          Go / No-Go Signal
        </p>
        <p className="mt-1 text-sm font-bold text-navy-900">
          Proceed with rate-lock contingency
        </p>
      </div>
    </div>
  );
}
