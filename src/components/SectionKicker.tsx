export function SectionKicker({
  children,
  light = false,
}: {
  children: string;
  light?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 text-xs font-semibold tracking-[0.2em] uppercase ${
        light ? "text-white/60" : "text-navy-900/50"
      }`}
    >
      <span className="h-px w-8 bg-red-600" />
      {children}
    </div>
  );
}
