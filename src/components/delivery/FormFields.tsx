export function Field({
  label, v, onChange, type = "text", required,
}: { label: string; v: string; onChange: (v: string) => void; type?: string; required?: boolean }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}{required && <span className="text-critical"> *</span>}
      </label>
      <input
        type={type}
        value={v}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
      />
    </div>
  );
}

export function Select({
  label, v, onChange, options,
}: { label: string; v: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
      <select
        value={v}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
      >
        <option value="">Select…</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
