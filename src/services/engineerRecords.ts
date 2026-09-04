/**
 * Per-engineer shift logs and expense claims in Supabase.
 *
 * Tables (public schema, see db/shift_logs_expenses.sql):
 *   shift_logs  id, engineer_id -> engineers(id), date, site, shift_type,
 *               shift_count, own_vehicle, status, comment, comment_at, source
 *   expenses    id, engineer_id -> engineers(id), date, site, fuel, meals,
 *               card, receipt_name, status, source
 *
 * EVERY read and write in this module is scoped by `engineer_id`, so one
 * engineer can never see or overwrite another engineer's rows. Google Sheet
 * syncs write with `source = 'sheet'` and are also engineer_id-scoped.
 */
import { supabase } from "@/integrations/supabase/client";
import { num, type ExpenseEntry, type ShiftLog, type ShiftType, type Status } from "@/lib/mock-data";

type Row = Record<string, unknown>;

const str = (v: unknown, fallback = "") => (v === null || v === undefined ? fallback : String(v));

/** True when the table has not been created in this database yet. */
export const isMissingTable = (message?: string) =>
  !!message && (message.includes("schema cache") || message.includes("does not exist"));

const status = (v: unknown): Status => (str(v).toLowerCase() === "approved" ? "Approved" : "Pending");

function toShift(r: Row, engineerId: string): ShiftLog {
  const comment = r['comment'] ? str(r['comment']) : undefined;
  return {
    id: str(r['id']),
    engineerId,
    date: str(r['date']),
    site: str(r['site']),
    shiftType: (str(r['shift_type']) === "Night" ? "Night" : "Day") as ShiftType,
    shiftCount: num(r['shift_count'], 1) || 1,
    ownVehicle: r['own_vehicle'] === true,
    status: status(r['status']),
    ...(comment ? { comment } : {}),
    ...(r['comment_at'] ? { commentAt: str(r['comment_at']) } : {}),
  };
}

function toExpense(r: Row, engineerId: string): ExpenseEntry {
  const receiptName = r['receipt_name'] ? str(r['receipt_name']) : undefined;
  return {
    id: str(r['id']),
    engineerId,
    date: str(r['date']),
    site: str(r['site']),
    fuel: num(r['fuel']),
    meals: num(r['meals']),
    creditCard: num(r['card']),
    status: status(r['status']),
    ...(receiptName ? { receiptName } : {}),
  };
}

/* ------------------------------------------------------------------ *
 * Reads — always filtered by engineer_id
 * ------------------------------------------------------------------ */

export async function fetchShiftsForEngineer(
  engineerId: string,
): Promise<{ shifts: ShiftLog[]; error?: string }> {
  if (!engineerId) return { shifts: [] };
  const { data, error } = await supabase
    .from("shift_logs")
    .select("*")
    .eq("engineer_id", engineerId)
    .order("date", { ascending: false });
  if (error) return { shifts: [], error: error.message };
  return { shifts: ((data ?? []) as Row[]).map((r) => toShift(r, engineerId)) };
}

export async function fetchExpensesForEngineer(
  engineerId: string,
): Promise<{ expenses: ExpenseEntry[]; error?: string }> {
  if (!engineerId) return { expenses: [] };
  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .eq("engineer_id", engineerId)
    .order("date", { ascending: false });
  if (error) return { expenses: [], error: error.message };
  return { expenses: ((data ?? []) as Row[]).map((r) => toExpense(r, engineerId)) };
}

/** Admin console view: one engineer_id-scoped query per engineer, merged. */
export async function fetchRecordsForEngineers(engineerIds: string[]): Promise<{
  shifts: ShiftLog[];
  expenses: ExpenseEntry[];
  shiftsError?: string;
  expensesError?: string;
}> {
  const results = await Promise.all(
    engineerIds.map(async (id) => ({
      id,
      s: await fetchShiftsForEngineer(id),
      e: await fetchExpensesForEngineer(id),
    })),
  );
  const shifts = results.flatMap((r) => r.s.shifts);
  const expenses = results.flatMap((r) => r.e.expenses);
  const shiftsError = results.find((r) => r.s.error)?.s.error;
  const expensesError = results.find((r) => r.e.error)?.e.error;
  return {
    shifts,
    expenses,
    ...(shiftsError ? { shiftsError } : {}),
    ...(expensesError ? { expensesError } : {}),
  };
}

/* ------------------------------------------------------------------ *
 * Writes
 * ------------------------------------------------------------------ */

export async function insertShiftRow(
  shift: ShiftLog,
): Promise<{ shift?: ShiftLog; error?: string }> {
  if (!shift.engineerId) return { error: "Missing engineer" };
  const { data, error } = await supabase
    .from("shift_logs")
    .insert({
      engineer_id: shift.engineerId,
      date: shift.date,
      site: shift.site,
      shift_type: shift.shiftType,
      shift_count: num(shift.shiftCount, 1),
      own_vehicle: !!shift.ownVehicle,
      status: shift.status,
      source: "app",
    })
    .select("*")
    .single();
  if (error || !data) return { error: error?.message ?? "Insert failed" };
  return { shift: toShift(data as Row, shift.engineerId) };
}

export async function updateShiftRow(
  id: string,
  engineerId: string,
  patch: Partial<Omit<ShiftLog, "id" | "engineerId">>,
): Promise<string | undefined> {
  const body: Row = {};
  if (patch.date !== undefined) body['date'] = patch.date;
  if (patch.site !== undefined) body['site'] = patch.site;
  if (patch.shiftType !== undefined) body['shift_type'] = patch.shiftType;
  if (patch.shiftCount !== undefined) body['shift_count'] = num(patch.shiftCount, 1);
  if (patch.ownVehicle !== undefined) body['own_vehicle'] = !!patch.ownVehicle;
  if (patch.status !== undefined) body['status'] = patch.status;
  if (patch.comment !== undefined) body['comment'] = patch.comment ?? null;
  if (patch.commentAt !== undefined) body['comment_at'] = patch.commentAt ?? null;
  if (!Object.keys(body).length) return undefined;
  const { error } = await supabase
    .from("shift_logs")
    .update(body)
    .eq("id", id)
    .eq("engineer_id", engineerId);
  return error?.message;
}

export async function deleteShiftRow(
  id: string,
  engineerId: string,
): Promise<string | undefined> {
  const { error } = await supabase
    .from("shift_logs")
    .delete()
    .eq("id", id)
    .eq("engineer_id", engineerId);
  return error?.message;
}

export async function insertExpenseRow(
  entry: ExpenseEntry,
): Promise<{ expense?: ExpenseEntry; error?: string }> {
  if (!entry.engineerId) return { error: "Missing engineer" };
  const { data, error } = await supabase
    .from("expenses")
    .insert({
      engineer_id: entry.engineerId,
      date: entry.date,
      site: entry.site,
      fuel: num(entry.fuel),
      meals: num(entry.meals),
      card: num(entry.creditCard),
      receipt_name: entry.receiptName ?? null,
      status: entry.status,
      source: "app",
    })
    .select("*")
    .single();
  if (error || !data) return { error: error?.message ?? "Insert failed" };
  return { expense: toExpense(data as Row, entry.engineerId) };
}

export async function updateExpenseRow(
  id: string,
  engineerId: string,
  patch: Partial<Omit<ExpenseEntry, "id" | "engineerId">>,
): Promise<string | undefined> {
  const body: Row = {};
  if (patch.date !== undefined) body['date'] = patch.date;
  if (patch.site !== undefined) body['site'] = patch.site;
  if (patch.fuel !== undefined) body['fuel'] = num(patch.fuel);
  if (patch.meals !== undefined) body['meals'] = num(patch.meals);
  if (patch.creditCard !== undefined) body['card'] = num(patch.creditCard);
  if (patch.receiptName !== undefined) body['receipt_name'] = patch.receiptName ?? null;
  if (patch.status !== undefined) body['status'] = patch.status;
  if (!Object.keys(body).length) return undefined;
  const { error } = await supabase
    .from("expenses")
    .update(body)
    .eq("id", id)
    .eq("engineer_id", engineerId);
  return error?.message;
}

/* ------------------------------------------------------------------ *
 * Google Sheet sync — writes sheet rows into the engineer's own rows only
 * ------------------------------------------------------------------ */

export async function saveSheetRecords(
  engineerId: string,
  shifts: ShiftLog[],
  expenses: ExpenseEntry[],
): Promise<{ shifts: ShiftLog[]; expenses: ExpenseEntry[]; error?: string }> {
  if (!engineerId) return { shifts: [], expenses: [], error: "Missing engineer" };

  const shiftRows = shifts.map((s) => ({
    engineer_id: engineerId,
    date: s.date,
    site: s.site,
    shift_type: s.shiftType,
    shift_count: num(s.shiftCount, 1),
    own_vehicle: !!s.ownVehicle,
    status: s.status,
    source: "sheet",
  }));
  const expenseRows = expenses.map((e) => ({
    engineer_id: engineerId,
    date: e.date,
    site: e.site,
    fuel: num(e.fuel),
    meals: num(e.meals),
    card: num(e.creditCard),
    receipt_name: e.receiptName ?? null,
    status: e.status,
    source: "sheet",
  }));

  let error: string | undefined;
  if (shiftRows.length) {
    const res = await supabase
      .from("shift_logs")
      .upsert(shiftRows, {
        onConflict: "engineer_id,date,site,shift_type",
        ignoreDuplicates: true,
      });
    if (res.error) error = res.error.message;
  }
  if (expenseRows.length) {
    const res = await supabase
      .from("expenses")
      .upsert(expenseRows, {
        onConflict: "engineer_id,date,site,fuel,meals,card",
        ignoreDuplicates: true,
      });
    if (res.error) error ??= res.error.message;
  }

  // Re-read so the UI shows the persisted, engineer-scoped rows.
  const [s, e] = await Promise.all([
    fetchShiftsForEngineer(engineerId),
    fetchExpensesForEngineer(engineerId),
  ]);
  return {
    shifts: s.shifts,
    expenses: e.expenses,
    ...(error ? { error } : {}),
  };
}
