import { useCallback, useEffect, useMemo, useState } from "react";

// Per-user card preferences for a card row (which cards are shown, and in what order), persisted
// locally under a scope key so each surface keeps its own arrangement. Deliberately local rather
// than server-side: this is a display preference for one person on one machine, not shared config,
// and it must survive a reload without a round trip.

export type CardPreference = { order: string[]; hidden: string[] };

const STORAGE_PREFIX = "buildpos.cards:";

function read(scope: string): CardPreference | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + scope);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CardPreference>;
    return {
      order: Array.isArray(parsed.order) ? parsed.order.filter((k) => typeof k === "string") : [],
      hidden: Array.isArray(parsed.hidden)
        ? parsed.hidden.filter((k) => typeof k === "string")
        : [],
    };
  } catch {
    return null;
  }
}

function write(scope: string, pref: CardPreference): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + scope, JSON.stringify(pref));
  } catch {
    // Blocked storage: preferences apply for this session only.
  }
}

/**
 * @param scope   stable id for this card row, e.g. "dashboard.overview". Pass null to opt out —
 *                the hook still runs (hooks can't be conditional) but reads and writes nothing, so
 *                a shared component can call it unconditionally and only some callers opt in.
 * @param allKeys the keys currently available, in their natural (default) order
 */
export function useCardPreferences(scope: string | null, allKeys: string[]) {
  const [pref, setPref] = useState<CardPreference>({ order: [], hidden: [] });

  // localStorage isn't available during SSR, so load after mount rather than in the initialiser.
  useEffect(() => {
    setPref(scope ? (read(scope) ?? { order: [], hidden: [] }) : { order: [], hidden: [] });
  }, [scope]);

  const allKeysSignature = allKeys.join("|");
  // Stored order first (minus keys that no longer exist), then any key the stored order predates —
  // a card added by a later release appears at the end instead of vanishing for existing users.
  const order = useMemo(() => {
    const known = new Set(allKeys);
    const kept = pref.order.filter((k) => known.has(k));
    return [...kept, ...allKeys.filter((k) => !kept.includes(k))];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allKeysSignature, pref.order]);

  const hidden = useMemo(() => new Set(pref.hidden), [pref.hidden]);
  const visibleKeys = useMemo(() => order.filter((k) => !hidden.has(k)), [order, hidden]);

  const update = useCallback(
    (next: CardPreference) => {
      setPref(next);
      if (scope) write(scope, next);
    },
    [scope],
  );

  const toggle = useCallback(
    (key: string) => {
      const nextHidden = hidden.has(key)
        ? pref.hidden.filter((k) => k !== key)
        : [...pref.hidden, key];
      update({ order, hidden: nextHidden });
    },
    [hidden, pref.hidden, order, update],
  );

  const move = useCallback(
    (key: string, direction: -1 | 1) => {
      const i = order.indexOf(key);
      const j = i + direction;
      if (i < 0 || j < 0 || j >= order.length) return;
      const next = [...order];
      [next[i], next[j]] = [next[j], next[i]];
      update({ order: next, hidden: pref.hidden });
    },
    [order, pref.hidden, update],
  );

  const reset = useCallback(() => update({ order: [], hidden: [] }), [update]);

  const isCustomised = pref.order.length > 0 || pref.hidden.length > 0;

  return { order, hidden, visibleKeys, toggle, move, reset, isCustomised };
}

/** Reorders and filters `items` to match the saved preference. */
export function applyCardPreference<T>(
  items: T[],
  keyOf: (item: T) => string,
  order: string[],
  hidden: Set<string>,
): T[] {
  const byKey = new Map(items.map((i) => [keyOf(i), i]));
  return order
    .filter((k) => !hidden.has(k))
    .map((k) => byKey.get(k))
    .filter((i): i is T => i !== undefined);
}
