import { useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

export type SearchOption = { value: string; label: string; group?: string; hint?: string };

/**
 * The one searchable, grouped dropdown used everywhere a technical value must be picked rather
 * than typed (rule data points, operators, roles, users, branches…).
 */
export function SearchSelect({
  options,
  value,
  onChange,
  placeholder = "Select…",
  emptyText = "Nothing found.",
  disabled,
  className = "",
}: {
  options: SearchOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  const groups = Array.from(new Set(options.map((o) => o.group ?? "")));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          aria-expanded={open}
          className={`h-9 w-full justify-between gap-2 truncate text-left font-normal ${className}`}
        >
          <span className={`truncate ${selected ? "" : "text-muted-foreground"}`}>{selected?.label ?? placeholder}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(28rem,calc(100vw-2rem))] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search…" />
          <CommandList className="max-h-72">
            <CommandEmpty>{emptyText}</CommandEmpty>
            {groups.map((g) => (
              <CommandGroup key={g || "all"} heading={g || undefined}>
                {options
                  .filter((o) => (o.group ?? "") === g)
                  .map((o) => (
                    <CommandItem
                      key={o.value}
                      value={`${o.label} ${o.hint ?? ""}`}
                      onSelect={() => {
                        onChange(o.value);
                        setOpen(false);
                      }}
                    >
                      <Check className={`mr-2 h-3.5 w-3.5 ${o.value === value ? "opacity-100" : "opacity-0"}`} />
                      <span className="flex-1 truncate">{o.label}</span>
                      {o.hint && <span className="ml-2 shrink-0 font-mono text-[10px] text-muted-foreground">{o.hint}</span>}
                    </CommandItem>
                  ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Multi-value variant — used by In / In List / Contains Any operators and branch scopes. */
export function MultiSearchSelect({
  options,
  values,
  onChange,
  placeholder = "Select…",
  className = "",
}: {
  options: SearchOption[];
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (v: string) => onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);

  return (
    <div className={`space-y-1.5 ${className}`}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className="h-9 w-full justify-between gap-2 text-left font-normal">
            <span className={`truncate ${values.length ? "" : "text-muted-foreground"}`}>
              {values.length ? `${values.length} selected` : placeholder}
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(28rem,calc(100vw-2rem))] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search…" />
            <CommandList className="max-h-72">
              <CommandEmpty>Nothing found.</CommandEmpty>
              <CommandGroup>
                {options.map((o) => (
                  <CommandItem key={o.value} value={o.label} onSelect={() => toggle(o.value)}>
                    <Check className={`mr-2 h-3.5 w-3.5 ${values.includes(o.value) ? "opacity-100" : "opacity-0"}`} />
                    <span className="flex-1 truncate">{o.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {values.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => toggle(v)}
              className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-black/5 px-2 py-0.5 text-[11px] text-foreground"
            >
              {options.find((o) => o.value === v)?.label ?? v}
              <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}