/**
 * Google Sheets service for WeActive9.
 *
 * All network work happens server-side (see `src/lib/sheets.functions.ts`) so the
 * connector credentials never reach the browser.
 */
import { appendSheetRow, readSheetRange } from "@/lib/sheets.functions";
import {
  DEFAULT_VAT_DEDUCTION,
  type Engineer,
  type ExpenseEntry,
  type ShiftLog,
  type ShiftType,
  type Status,
} from "@/lib/mock-data";

export const SHEET_TABS = {
  engineers: "Engineers!A2:I",
  shifts: "Shifts!A:G",
  expenses: "Expenses!A:H",
  shiftsRead: "Shifts!A2:G",
  expensesRead: "Expenses!A2:H",
  /** Date | Amount paid */
  paymentsRead: "Payments!A2:B",
} as const;

export interface SyncResult {
  synced: boolean;
  error?: string;
}

/**
 * Accepts a raw sheet ID or a full Google Sheets URL and returns the ID.
 */
export function parseSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1] ?? trimmed;
}

const truthy = (v?: string) =>
  ["yes", "y", "true", "1", "own", "own vehicle"].includes((v ?? "").trim().toLowerCase());

/** Read the engineer master records from the Engineers tab. */
export async function fetchEngineerRecords(): Promise<Engineer[]> {
  try {
    const res = await readSheetRange({ data: { range: SHEET_TABS.engineers } });
    if (!res.configured) return [];
    return res.values
      .filter((r) => r[0])
      .map((r) => ({
        id: r[0] ?? "",
        name: r[1] ?? "",
        email: r[2] ?? "",
        region: r[3] ?? "",
        shiftRate: Number(r[4] ?? 0),
        vatRate: Number(r[5] ?? DEFAULT_VAT_DEDUCTION),
        paidAmount: Number(r[6] ?? 0),
        sheetId: r[7] || undefined,
        active: (r[8] ?? "Active").toLowerCase() !== "blocked",
      }));
  } catch (err) {
    console.error("[sheetsService] fetchEngineerRecords failed", err);
    return [];
  }
}

/**
 * Pull an individual engineer's own spreadsheet so their externally-logged
 * shifts, claims and payments can be merged with in-app submissions.
 */
export async function fetchEngineerSheetRecords(engineer: Engineer): Promise<{
  shifts: ShiftLog[];
  expenses: ExpenseEntry[];
  paid?: number;
  configured: boolean;
  error?: string;
}> {
  if (!engineer.sheetId) {
    return { shifts: [], expenses: [], configured: false, error: "No Google Sheet linked" };
  }
  const spreadsheetId = parseSpreadsheetId(engineer.sheetId);
  try {
    const [s, e] = await Promise.all([
      readSheetRange({ data: { range: SHEET_TABS.shiftsRead, spreadsheetId } }),
      readSheetRange({ data: { range: SHEET_TABS.expensesRead, spreadsheetId } }),
    ]);
    const shifts: ShiftLog[] = s.values
      .filter((r) => r[0])
      .map((r) => ({
        id: r[0] ?? "",
        engineerId: engineer.id,
        date: r[2] ?? "",
        site: r[3] ?? "",
        shiftType: (r[4] === "Night" ? "Night" : "Day") as ShiftType,
        shiftCount: Number(r[5] ?? 1) || 1,
        ownVehicle: truthy(r[6]),
        status: "Approved" as Status,
      }));
    const expenses: ExpenseEntry[] = e.values
      .filter((r) => r[0])
      .map((r) => ({
        id: r[0] ?? "",
        engineerId: engineer.id,
        date: r[2] ?? "",
        site: r[3] ?? "",
        fuel: Number(r[4] ?? 0),
        meals: Number(r[5] ?? 0),
        creditCard: Number(r[6] ?? 0),
        receiptName: r[7] || undefined,
        status: "Approved" as Status,
      }));

    const paid = await fetchPaidTotal(spreadsheetId);
    return { shifts, expenses, configured: true, ...(paid !== undefined ? { paid } : {}) };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown Google Sheets error";
    console.error("[sheetsService] fetchEngineerSheetRecords failed", error);
    return { shifts: [], expenses: [], configured: true, error };
  }
}

/** Sum of the Paid column on the engineer's Payments tab (optional tab). */
export async function fetchPaidTotal(spreadsheetId: string): Promise<number | undefined> {
  try {
    const res = await readSheetRange({ data: { range: SHEET_TABS.paymentsRead, spreadsheetId } });
    if (!res.configured) return undefined;
    const total = res.values.reduce((a, r) => {
      const n = Number(String(r[1] ?? "").replace(/[^0-9.-]/g, ""));
      return a + (Number.isFinite(n) ? n : 0);
    }, 0);
    return total;
  } catch {
    // Payments tab is optional — a missing tab must not fail the whole sync.
    return undefined;
  }
}

/** Append a submitted shift to the Shifts tab (company sheet + engineer sheet). */
export async function pushShift(shift: ShiftLog, engineer: Engineer): Promise<SyncResult> {
  const row = [
    shift.id,
    engineer.name,
    shift.date,
    shift.site,
    shift.shiftType,
    shift.shiftCount,
    shift.ownVehicle ? "Yes" : "No",
  ];
  return appendEverywhere(SHEET_TABS.shifts, row, engineer.sheetId);
}

/** Append a submitted expense claim to the Expenses tab. */
export async function pushExpense(
  expense: ExpenseEntry,
  engineer: Engineer,
): Promise<SyncResult> {
  const row = [
    expense.id,
    engineer.name,
    expense.date,
    expense.site,
    expense.fuel,
    expense.meals,
    expense.creditCard,
    expense.receiptName ?? "",
  ];
  return appendEverywhere(SHEET_TABS.expenses, row, engineer.sheetId);
}

/** Register a new engineer row on the master Engineers tab. */
export async function pushEngineer(engineer: Engineer): Promise<SyncResult> {
  return append("Engineers!A:I", [
    engineer.id,
    engineer.name,
    engineer.email,
    engineer.region,
    engineer.shiftRate,
    engineer.vatRate,
    engineer.paidAmount,
    engineer.sheetId ?? "",
    engineer.active ? "Active" : "Blocked",
  ]);
}

async function appendEverywhere(
  range: string,
  row: (string | number)[],
  engineerSheet?: string | undefined,
): Promise<SyncResult> {
  const results = await Promise.all([
    append(range, row),
    engineerSheet
      ? append(range, row, parseSpreadsheetId(engineerSheet))
      : Promise.resolve<SyncResult>({ synced: false }),
  ]);
  const error = results.find((r) => r.error)?.error;
  return error ? { synced: false, error } : { synced: results.some((r) => r.synced) };
}

async function append(
  range: string,
  row: (string | number)[],
  spreadsheetId?: string,
): Promise<SyncResult> {
  try {
    const res = await appendSheetRow({ data: { range, row, ...(spreadsheetId ? { spreadsheetId } : {}) } });
    return { synced: res.configured };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown Google Sheets error";
    console.error("[sheetsService] append failed", error);
    return { synced: false, error };
  }
}
