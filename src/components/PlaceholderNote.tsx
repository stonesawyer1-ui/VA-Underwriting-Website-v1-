export function PlaceholderNote({ children }: { children: string }) {
  return (
    <div className="rounded-sm border border-dashed border-navy-900/25 bg-navy-50 px-4 py-3 text-xs font-medium tracking-wide text-navy-900/60">
      <span className="font-bold text-red-600">[PLACEHOLDER]</span> {children}
    </div>
  );
}
