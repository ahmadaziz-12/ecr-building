/**
 * Column-count contract for the shared `ui-card-grid` / `ui-tile-grid` rows.
 *
 * A row declares how many items it holds so the grid can lay them out as that many equal-width
 * `1fr` tracks. The count only steps down at the breakpoints defined in `src/styles.css`, which
 * keeps the same cards together, in the same order and at the same size, at every zoom level in
 * between — unlike `auto-fit`, where the column count drifts with the pixel width.
 */
export function cols(count: number): string {
  return `ui-cols-${Math.max(1, Math.min(8, Math.round(count) || 1))}`;
}
