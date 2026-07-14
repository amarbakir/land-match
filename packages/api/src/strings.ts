/**
 * Cap a string at `max` UTF-16 code units without splitting a surrogate pair.
 * A bare slice can cut an astral character (emoji) in half, leaving a lone
 * surrogate — ill-formed UTF-16 that renders as U+FFFD and can make strict
 * JSON layers reject the whole payload.
 */
export function truncateUtf16Safe(value: string, max: number): string {
  return value.slice(0, max).replace(/[\uD800-\uDBFF]$/, '');
}
