/**
 * Header-driven Google Sheet row parsing.
 *
 * Columns are matched by NAME (case-insensitive, trimmed, punctuation-agnostic)
 * instead of fixed index numbers, so re-ordered or extra sheet columns can no
 * longer shift data into the wrong field.
 *
 * This module only maps and sanitises raw cells. It performs NO financial
 * maths — every total spend, VAT, reimbursable and payout formula stays exactly
 * where it already lives.
 */

/** "Site_Location " -> "sitelocation" */
const key = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** Accepted aliases per logical field. */
export const COLUMN_ALIASES = {
  id: ["id", "recordid", "entryid", "rowid"],
  engineerName: ["engineername", "engineer", "name", "engineerfullname"],
  date: ["date", "shiftdate", "workdate", "expensedate"],
  site: ["sitelocation", "site", "location", "sitename"],
  shiftType: ["shifttype", "type", "daynight"],
  shiftCount: ["shifthours", "shifts", "shiftcount", "shift", "noofshifts", "hours"],
  ownVehicle: ["ownvehicle", "vehicle", "usedownvehicle", "own"],
  fuel: ["fuelexpense", "fuel", "fuelcost"],
  meals: ["mealexpense", "meals", "meal", "mealscost", "food"],
  card: ["creditcard", "card", "cardexpense", "companycard"],
  receiptName: ["receipt", "receiptname", "receiptfile", "attachment"],
} as const;

export type ColumnField = keyof typeof COLUMN_ALIASES;
export type HeaderMap = Partial<Record<ColumnField, number>>;

/** True when the row looks like a header row rather than data. */
export function looksLikeHeader(row: string[] | undefined): boolean {
  if (!row?.length) return false;
  const keys = row.map(key).filter(Boolean);
  if (!keys.length) return false;
  const known = new Set(Object.values(COLUMN_ALIASES).flat() as string[]);
  return keys.some((k) => known.has(k));
}

/** Build a field -> column index map from a header row. */
export function buildHeaderMap(row: string[] | undefined): HeaderMap {
  const map: HeaderMap = {};
  if (!row) return map;
  const keys = row.map(key);
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES) as [
    ColumnField,
    readonly string[],
  ][]) {
    const idx = keys.findIndex((k) => k && aliases.includes(k));
    if (idx >= 0) map[field] = idx;
  }
  return map;
}

/** Read a cell by logical field, falling back to a legacy fixed index. */
export function cell(
  row: string[],
  map: HeaderMap,
  field: ColumnField,
  fallbackIndex?: number,
): string {
  const idx = map[field] ?? fallbackIndex;
  if (idx === undefined) return "";
  return String(row[idx] ?? "").trim();
}

/** Trimmed string. */
export const text = (v: unknown) => String(v ?? "").trim();

/** Safe number: strips currency symbols/commas, never returns NaN. */
export function numeric(v: unknown, fallback = 0): number {
  const n = Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

const MONTHS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Normalise a sheet date cell to YYYY-MM-DD.
 * Handles ISO, DD/MM/YYYY, MM/DD/YYYY (when unambiguous), "12 Mar 2026" and
 * Google Sheets serial numbers. Returns "" when it cannot be understood.
 */
export function isoDate(v: unknown): string {
  const raw = text(v);
  if (!raw) return "";

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${pad(Number(iso[2]))}-${pad(Number(iso[3]))}`;

  const slash = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (slash) {
    let [a, b] = [Number(slash[1]), Number(slash[2])];
    const yr = Number(slash[3]);
    const year = yr < 100 ? 2000 + yr : yr;
    // Day-first unless impossible (e.g. 03/25/2026).
    if (a > 12 && b <= 12) [a, b] = [a, b];
    else if (b > 12 && a <= 12) [a, b] = [b, a];
    if (a >= 1 && a <= 31 && b >= 1 && b <= 12) return `${year}-${pad(b)}-${pad(a)}`;
    return "";
  }

  const named = raw.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
  if (named) {
    const m = MONTHS.indexOf(named[2]!.slice(0, 3).toLowerCase());
    if (m >= 0) return `${named[3]}-${pad(m + 1)}-${pad(Number(named[1]))}`;
  }

  if (/^\d{5}$/.test(raw)) {
    // Google Sheets serial date (days since 1899-12-30).
    const ms = (Number(raw) - 25569) * 86400000;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) {
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    }
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getUTCFullYear()}-${pad(parsed.getUTCMonth() + 1)}-${pad(parsed.getUTCDate())}`;
  }
  return "";
}
