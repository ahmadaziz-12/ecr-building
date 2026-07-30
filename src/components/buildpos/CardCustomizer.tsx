import { useState } from "react";
import { ArrowDown, ArrowUp, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCardPreferences } from "@/lib/buildpos/card-preferences";

/**
 * "Customise cards" control for a row of summary cards: pick which appear and in what order.
 * Pair it with `useCardPreferences` in the parent — the parent owns the preference so it can also
 * use it to render, and this component only drives it.
 */
export function CardCustomizer({
  labels,
  prefs,
}: {
  /** key -> display label, for every card the row can show. */
  labels: Record<string, string>;
  prefs: ReturnType<typeof useCardPreferences>;
}) {
  const [open, setOpen] = useState(false);
  const { order, hidden, toggle, move, reset, isCustomised } = prefs;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="ui-control gap-1.5 border-black/10 bg-white text-xs font-medium hover:border-brand/40"
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          Customise cards
          {isCustomised && (
            <span className="ml-0.5 rounded-full bg-brand/10 px-1.5 text-[10px] font-semibold text-brand">
              {order.length - hidden.size}/{order.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <div className="mb-1.5 flex items-center justify-between px-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Cards on this view
          </p>
          {isCustomised && (
            <button
              type="button"
              onClick={reset}
              className="text-xs font-medium text-brand hover:underline"
            >
              Reset
            </button>
          )}
        </div>
        <div className="max-h-72 space-y-0.5 overflow-y-auto">
          {order.map((key, i) => (
            <div
              key={key}
              className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-canvas"
            >
              <Checkbox checked={!hidden.has(key)} onCheckedChange={() => toggle(key)} />
              <span className="min-w-0 flex-1 truncate text-xs">{labels[key] ?? key}</span>
              <button
                type="button"
                disabled={i === 0}
                onClick={() => move(key, -1)}
                aria-label={`Move ${labels[key] ?? key} up`}
                className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-black/5 hover:text-foreground disabled:opacity-30"
              >
                <ArrowUp className="h-3 w-3" />
              </button>
              <button
                type="button"
                disabled={i === order.length - 1}
                onClick={() => move(key, 1)}
                aria-label={`Move ${labels[key] ?? key} down`}
                className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-black/5 hover:text-foreground disabled:opacity-30"
              >
                <ArrowDown className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
