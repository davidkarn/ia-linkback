export function assertCond(condition: boolean, msg?: string): asserts condition {
  if (!condition) {throw new Error(msg ?? "Assertion Failed");}
};

// A date and time as people here read them, in their locale and time zone ("Oct 1, 2026, 9:27 PM")
export const formatDateTime = (iso: string): string => (
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
);
