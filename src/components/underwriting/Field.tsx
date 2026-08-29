"use client";

import { ReactNode } from "react";

const baseInputClasses =
  "w-full rounded-sm border border-navy-900/15 bg-white px-3.5 py-2.5 text-sm text-navy-900 outline-none transition-colors focus:border-navy-900 focus:ring-2 focus:ring-red-600/20";

export function EstimatedBadge({ estimated }: { estimated: boolean }) {
  if (!estimated) {
    return (
      <span className="inline-flex items-center gap-1 rounded-sm bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-700 uppercase">
        Confirmed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-sm bg-amber-100 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-amber-700 uppercase">
      Estimated
    </span>
  );
}

export function FieldShell({
  label,
  htmlFor,
  required,
  estimated,
  help,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  estimated?: boolean;
  help?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={htmlFor} className="block text-sm font-semibold text-navy-900">
          {label}
          {required && <span className="ml-1 text-red-600">*</span>}
        </label>
        {estimated !== undefined && <EstimatedBadge estimated={estimated} />}
      </div>
      <div className="mt-2">{children}</div>
      {help && <p className="mt-1.5 text-xs leading-relaxed text-navy-900/50">{help}</p>}
    </div>
  );
}

export function TextField({
  id,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      id={id}
      type={type}
      className={baseInputClasses}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function NumberField({
  id,
  value,
  onChange,
  placeholder,
  min,
}: {
  id: string;
  value: number | "";
  onChange: (v: number | "") => void;
  placeholder?: string;
  min?: number;
}) {
  return (
    <input
      id={id}
      type="number"
      inputMode="decimal"
      min={min}
      className={baseInputClasses}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
    />
  );
}

export function CurrencyField({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  value: number | "";
  onChange: (v: number | "") => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-sm text-navy-900/40">
        $
      </span>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        className={`${baseInputClasses} pl-7`}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      />
    </div>
  );
}

export function PercentField({
  id,
  value,
  onChange,
  step = 0.01,
}: {
  id: string;
  value: number | "";
  onChange: (v: number | "") => void;
  step?: number;
}) {
  return (
    <div className="relative">
      <input
        id={id}
        type="number"
        inputMode="decimal"
        step={step}
        className={`${baseInputClasses} pr-8`}
        value={value}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      />
      <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-sm text-navy-900/40">
        %
      </span>
    </div>
  );
}

export function SelectField({
  id,
  value,
  onChange,
  options,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      id={id}
      className={baseInputClasses}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function ToggleField<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-sm border px-4 py-2 text-sm font-medium transition-colors ${
            value === o.value
              ? "border-navy-900 bg-navy-900 text-white"
              : "border-navy-900/15 text-navy-900/70 hover:border-navy-900/40"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SectionCard({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-sm border border-navy-900/10 bg-white p-6 sm:p-8">
      <p className="text-[10px] font-semibold tracking-[0.2em] text-red-600 uppercase">{eyebrow}</p>
      <h2 className="mt-1.5 font-display text-xl font-bold text-navy-900">{title}</h2>
      {description && <p className="mt-1.5 text-sm text-navy-900/60">{description}</p>}
      <div className="mt-6 space-y-5">{children}</div>
    </div>
  );
}
