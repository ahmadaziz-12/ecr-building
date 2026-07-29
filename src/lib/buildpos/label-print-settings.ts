// How far the printer feeds past a label's content before its cutter fires — fundamentally a
// physical constant of the specific printer (the fixed distance between its print head and cutter
// blade), which varies by model and can't be known or tested remotely. Persisted per-browser so once
// someone dials it in for the till's printer, every future barcode/label print reuses it without
// re-entering it each time.
const KEY = "buildpos.labelFeedLines";
const DEFAULT_FEED_LINES = 4;

export function getLabelFeedLines(): number {
  if (typeof window === "undefined") return DEFAULT_FEED_LINES;
  const raw = window.localStorage.getItem(KEY);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_FEED_LINES;
}

export function setLabelFeedLines(n: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, String(Math.max(0, Math.round(n))));
}
