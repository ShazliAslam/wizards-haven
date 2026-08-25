import {
  OWN_VEHICLE_WEEKLY_CAP,
  expenseTotal,
  type Engineer,
  type ExpenseEntry,
  type ShiftLog,
} from "./mock-data";

/** Monday-based ISO week key, e.g. "2026-W34". */
export function weekKey(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day + 3); // Thursday of this week
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const fDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fDay + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function weekStart(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

export function weekRangeLabel(dateStr: string): string {
  const start = new Date(`${weekStart(dateStr)}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
  return `${fmt(start)} – ${fmt(end)}`;
}

export const monthKey = (dateStr: string) => dateStr.slice(0, 7);

export function monthLabel(key: string) {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

export const totalShifts = (shifts: ShiftLog[]) => shifts.reduce((a, s) => a + s.shiftCount, 0);

/** Own-vehicle days, capped at 7 per calendar week. */
export function ownVehicleDays(shifts: ShiftLog[]): number {
  const perWeek = new Map<string, Set<string>>();
  shifts
    .filter((s) => s.ownVehicle)
    .forEach((s) => {
      const k = weekKey(s.date);
      const set = perWeek.get(k) ?? new Set<string>();
      set.add(s.date);
      perWeek.set(k, set);
    });
  return [...perWeek.values()].reduce(
    (a, set) => a + Math.min(set.size, OWN_VEHICLE_WEEKLY_CAP),
    0,
  );
}

export interface PaymentSummary {
  shiftCount: number;
  grossEarned: number;
  vatDeducted: number;
  netEarned: number;
  reimbursables: number;
  paid: number;
  toBePaid: number;
  ownVehicleDays: number;
}

/**
 * To Be Paid = (Total Shifts × Shift Rate) × (1 − VAT%/100)
 *              + Approved Reimbursables − Paid Amount
 */
export function paymentSummary(
  engineer: Engineer,
  shifts: ShiftLog[],
  expenses: ExpenseEntry[],
): PaymentSummary {
  const count = totalShifts(shifts);
  const grossEarned = count * engineer.shiftRate;
  const vatDeducted = grossEarned * (engineer.vatRate / 100);
  const netEarned = grossEarned - vatDeducted;
  const reimbursables = expenses
    .filter((e) => e.status === "Approved")
    .reduce((a, e) => a + expenseTotal(e), 0);
  const paid = engineer.paidAmount || 0;
  return {
    shiftCount: count,
    grossEarned,
    vatDeducted,
    netEarned,
    reimbursables,
    paid,
    toBePaid: netEarned + reimbursables - paid,
    ownVehicleDays: ownVehicleDays(shifts),
  };
}

export interface WeekBlock {
  key: string;
  start: string;
  label: string;
  shifts: ShiftLog[];
  shiftCount: number;
  ownVehicle: number;
  earnings: number;
}

export function groupByWeek(shifts: ShiftLog[], shiftRate: number): WeekBlock[] {
  const map = new Map<string, ShiftLog[]>();
  shifts.forEach((s) => {
    const k = weekKey(s.date);
    map.set(k, [...(map.get(k) ?? []), s]);
  });
  return [...map.entries()]
    .map(([key, list]) => {
      const sorted = [...list].sort((a, b) => (a.date < b.date ? 1 : -1));
      const count = totalShifts(sorted);
      return {
        key,
        start: weekStart(sorted[0]!.date),
        label: weekRangeLabel(sorted[0]!.date),
        shifts: sorted,
        shiftCount: count,
        ownVehicle: ownVehicleDays(sorted),
        earnings: count * shiftRate,
      };
    })
    .sort((a, b) => (a.start < b.start ? 1 : -1));
}
