import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Context,
  type ReactNode,
} from "react";

import { toast } from "sonner";
import {
  CURRENT_ENGINEER,
  DEFAULT_VAT_DEDUCTION,
  ENGINEERS,
  EXPENSES,
  SHIFTS,
  type DocumentKind,
  type Engineer,
  type EngineerDocument,
  type ExpenseEntry,
  num,
  OWN_VEHICLE_WEEKLY_CAP,
  type ShiftLog,
} from "./mock-data";
import { weekKey } from "./payroll";
import {
  fetchEngineerSheetRecords,
  fetchPayoutLogs,
  type PayoutLog,
  pushEngineer,
  pushExpense,
  pushShift,
} from "@/services/sheetsService";
import {
  deleteEngineerDocument,
  deleteEngineerRow,
  fetchClaims,
  fetchEngineers,
  fetchPayoutLogsByEmail,
  fetchPayoutsForEmail,
  insertClaim,
  insertEngineer,
  updateClaim,
  updateEngineerRow,
  uploadEngineerDocument,
} from "@/services/supabaseData";
import {
  deleteShiftRow,
  fetchRecordsForEngineers,
  insertExpenseRow,
  insertShiftRow,
  isMissingTable,
  saveSheetRecords,
  updateExpenseRow,
  updateShiftRow,
} from "@/services/engineerRecords";


export type Role = "engineer" | "admin";

export interface NewEngineerInput {
  name: string;
  email: string;
  region: string;
  shiftRate: number;
  vatRate?: number;
  paidAmount?: number;
  sheetId?: string | undefined;
}

interface SessionValue {
  role: Role | null;
  engineerId: string;
  engineer: Engineer;
  engineers: Engineer[];
  findEngineer: (id: string) => Engineer | undefined;
  setEngineerId: (id: string) => void;
  signIn: (role: Role, engineerId?: string) => void;
  signOut: () => void;
  shifts: ShiftLog[];
  expenses: ExpenseEntry[];
  addShift: (s: Omit<ShiftLog, "id" | "engineerId" | "status">) => void;
  updateShift: (id: string, patch: Partial<Omit<ShiftLog, "id" | "engineerId">>) => void;
  deleteShift: (id: string) => void;
  commentOnShift: (id: string, comment: string) => void;
  addExpense: (e: Omit<ExpenseEntry, "id" | "engineerId" | "status">) => void;
  updateExpense: (id: string, patch: Partial<Omit<ExpenseEntry, "id" | "engineerId">>) => void;
  addEngineer: (input: NewEngineerInput) => Engineer;
  updateEngineer: (id: string, patch: Partial<NewEngineerInput>) => void;
  deleteEngineer: (id: string) => void;
  setEngineerActive: (id: string, active: boolean) => void;
  setEngineerDocument: (id: string, kind: DocumentKind, doc: EngineerDocument | null) => void;
  /** Upload a file to the engineer-documents bucket and save its public URL. */
  uploadDocument: (id: string, kind: DocumentKind, file: File) => Promise<void>;
  syncEngineerFromSheet: (id: string) => Promise<void>;
  /** Payout rows read from Supabase payout_logs (WeActive9_Payroll_Sync mirror). */
  payouts: Record<string, PayoutLog[]>;
  payoutsFor: (id: string) => PayoutLog[];
  syncPayouts: (id: string, opts?: { silent?: boolean }) => Promise<void>;
}

// Kept on globalThis so a hot-module reload can't create a second context
// instance (provider from the old module, hook from the new one -> false
// "must be used inside SessionProvider" crash).
const globalStore = globalThis as typeof globalThis & {
  __weactive9SessionCtx?: Context<SessionValue | null>;
};
const Ctx =
  globalStore.__weactive9SessionCtx ??
  (globalStore.__weactive9SessionCtx = createContext<SessionValue | null>(null));

/** Merge sheet-sourced rows into local state without duplicating ids. */
function mergeById<T extends { id: string }>(local: T[], incoming: T[]): T[] {
  const known = new Set(local.map((r) => r.id));
  const fresh = incoming.filter((r) => r.id && !known.has(r.id));
  return fresh.length ? [...fresh, ...local] : local;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role | null>(null);
  const [engineerId, setEngineerId] = useState<string>(CURRENT_ENGINEER.id);
  const [engineers, setEngineers] = useState<Engineer[]>(ENGINEERS);
  const [shifts, setShifts] = useState<ShiftLog[]>(SHIFTS);
  const [expenses, setExpenses] = useState<ExpenseEntry[]>(EXPENSES);
  const [payouts, setPayouts] = useState<Record<string, PayoutLog[]>>({});

  // Load the permanent roster, claims and payout logs from Supabase.
  useEffect(() => {
    let active = true;
    void (async () => {
      const { engineers: rows, error } = await fetchEngineers();
      if (!active) return;
      if (error) {
        console.error("[session] engineers load failed", error);
        return;
      }
      if (!rows.length) return;

      const emailToId = new Map(rows.map((e) => [e.email.trim().toLowerCase(), e.id]));
      const [{ byEmail }, records] = await Promise.all([
        fetchPayoutLogsByEmail(),
        fetchRecordsForEngineers(rows.map((e) => e.id)),
      ]);
      if (!active) return;

      // Legacy fallback: databases created before the expenses table still
      // hold claims keyed by engineer_email.
      let expenseRows = records.expenses;
      if (isMissingTable(records.expensesError)) {
        const legacy = await fetchClaims(emailToId);
        if (!active) return;
        expenseRows = legacy.claims;
      } else if (records.expensesError) {
        console.error("[session] expenses load failed", records.expensesError);
      }
      if (records.shiftsError) {
        console.error("[session] shift_logs load failed", records.shiftsError);
      }

      const withPaid = rows.map((e) => {
        const logs = byEmail[e.email.trim().toLowerCase()] ?? [];
        return logs.length
          ? { ...e, paidAmount: logs.reduce((a, p) => a + num(p.amount), 0) }
          : e;
      });
      setEngineers(withPaid);
      setPayouts(
        Object.fromEntries(
          withPaid
            .map((e) => [e.id, byEmail[e.email.trim().toLowerCase()] ?? []] as const)
            .filter(([, logs]) => logs.length),
        ),
      );
      setShifts(records.shifts);
      setExpenses(expenseRows);
      setEngineerId((prev) => (withPaid.some((e) => e.id === prev) ? prev : withPaid[0]!.id));

    })();
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<SessionValue>(() => {
    const findEngineer = (id: string) => engineers.find((e) => e.id === id);
    const engineer = findEngineer(engineerId) ?? engineers[0]!;

    const syncToast = (label: string, result: { synced: boolean; error?: string }) => {
      if (result.synced) toast.success(`${label} synced to Google Sheets`);
      else if (result.error) toast.error(`Google Sheets sync failed`, { description: result.error });
    };

    const dbError = (label: string, error?: string) => {
      if (error) toast.error(`${label} could not be saved`, { description: error });
    };

    return {
      role,
      engineerId,
      engineer,
      engineers,
      findEngineer,
      setEngineerId,
      signIn: (r, id) => {
        if (id) setEngineerId(id);
        setRole(r);
      },
      signOut: () => setRole(null),
      shifts,
      expenses,
      addShift: (s) => {
        const mine = shifts.filter((x) => x.engineerId === engineer.id);
        let ownVehicle = !!s.ownVehicle;
        if (ownVehicle) {
          if (mine.some((x) => x.date === s.date && x.ownVehicle)) {
            ownVehicle = false;
            toast.warning("Own vehicle already claimed for this day", {
              description: "Only one own-vehicle allowance is allowed per day.",
            });
          } else {
            const wk = weekKey(s.date);
            const used = new Set(
              mine.filter((x) => x.ownVehicle && weekKey(x.date) === wk).map((x) => x.date),
            );
            if (used.size >= OWN_VEHICLE_WEEKLY_CAP) {
              ownVehicle = false;
              toast.warning("Weekly own-vehicle limit reached", {
                description: `Maximum ${OWN_VEHICLE_WEEKLY_CAP} own-vehicle days per week.`,
              });
            }
          }
        }
        const shift: ShiftLog = {
          ...s,
          shiftCount: num(s.shiftCount, 1),
          ownVehicle,
          id: `SH-new-${Date.now()}`,
          engineerId: engineer.id,
          status: "Pending",
        };
        setShifts((prev) => [shift, ...prev]);
        void insertShiftRow(shift).then(({ shift: saved, error }) => {
          if (error && !isMissingTable(error)) dbError("Shift", error);
          if (saved) setShifts((prev) => prev.map((x) => (x.id === shift.id ? saved : x)));
        });
        void pushShift(shift, engineer).then((r) => syncToast("Shift", r));
      },
      updateShift: (id, patch) => {
        const target = shifts.find((s) => s.id === id);
        const next = { ...patch };
        if (next.shiftCount !== undefined) next.shiftCount = num(next.shiftCount, 1);
        if (next.ownVehicle && target) {
          const date = next.date ?? target.date;
          const mine = shifts.filter((x) => x.engineerId === target.engineerId && x.id !== id);
          const wk = weekKey(date);
          const used = new Set(
            mine.filter((x) => x.ownVehicle && weekKey(x.date) === wk).map((x) => x.date),
          );
          if (mine.some((x) => x.date === date && x.ownVehicle)) {
            next.ownVehicle = false;
            toast.warning("Own vehicle already claimed for this day");
          } else if (used.size >= OWN_VEHICLE_WEEKLY_CAP) {
            next.ownVehicle = false;
            toast.warning(`Maximum ${OWN_VEHICLE_WEEKLY_CAP} own-vehicle days per week`);
          }
        }
        setShifts((prev) => prev.map((s) => (s.id === id ? { ...s, ...next } : s)));
        if (target?.engineerId) {
          void updateShiftRow(id, target.engineerId, next).then((error) => {
            if (error && !isMissingTable(error)) dbError("Shift", error);
          });
        }
      },
      deleteShift: (id) => {
        const target = shifts.find((s) => s.id === id);
        setShifts((prev) => prev.filter((s) => s.id !== id));
        if (target?.engineerId) {
          void deleteShiftRow(id, target.engineerId).then((error) => {
            if (error && !isMissingTable(error)) dbError("Shift", error);
          });
        }
        toast.success("Shift removed");
      },
      commentOnShift: (id, comment) => {
        const target = shifts.find((s) => s.id === id);
        const commentAt = new Date().toISOString();
        setShifts((prev) => prev.map((s) => (s.id === id ? { ...s, comment, commentAt } : s)));
        if (target?.engineerId) {
          void updateShiftRow(id, target.engineerId, { comment, commentAt }).then((error) => {
            if (error && !isMissingTable(error)) dbError("Query", error);
          });
        }
        toast.success("Query sent to the admin console");
      },
      addExpense: (e) => {
        const temp: ExpenseEntry = {
          ...e,
          id: `EX-new-${Date.now()}`,
          engineerId: engineer.id,
          status: "Pending",
        };
        setExpenses((prev) => [temp, ...prev]);
        void insertExpenseRow(temp).then(async ({ expense, error }) => {
          if (expense) {
            setExpenses((prev) => prev.map((x) => (x.id === temp.id ? expense : x)));
            return;
          }
          if (isMissingTable(error)) {
            // Legacy database without the expenses table.
            const legacy = await insertClaim(temp, engineer.email);
            dbError("Expense claim", legacy.error);
            if (legacy.claim) {
              setExpenses((prev) => prev.map((x) => (x.id === temp.id ? legacy.claim! : x)));
            }
            return;
          }
          dbError("Expense claim", error);
        });
        void pushExpense(temp, engineer).then((r) => syncToast("Expense claim", r));
      },
      updateExpense: (id, patch) => {
        const target = expenses.find((e) => e.id === id);
        setExpenses((prev) =>
          prev.map((e) =>
            e.id === id
              ? {
                  ...e,
                  ...patch,
                  ...(patch.fuel !== undefined ? { fuel: num(patch.fuel) } : {}),
                  ...(patch.meals !== undefined ? { meals: num(patch.meals) } : {}),
                  ...(patch.creditCard !== undefined ? { creditCard: num(patch.creditCard) } : {}),
                }
              : e,
          ),
        );
        if (target?.engineerId) {
          void updateExpenseRow(id, target.engineerId, patch).then(async (error) => {
            if (isMissingTable(error)) {
              dbError("Expense claim", await updateClaim(id, patch));
              return;
            }
            dbError("Expense claim", error);
          });
        }
      },

      addEngineer: (input) => {
        const optimistic: Engineer = {
          id: `pending-${Date.now()}`,
          name: input.name,
          email: input.email,
          region: input.region,
          shiftRate: num(input.shiftRate),
          vatRate:
            input.vatRate === undefined
              ? DEFAULT_VAT_DEDUCTION
              : num(input.vatRate, DEFAULT_VAT_DEDUCTION),
          paidAmount: num(input.paidAmount),
          sheetId: input.sheetId,
          active: true,
        };
        setEngineers((prev) => [...prev, optimistic]);
        void insertEngineer({
          name: optimistic.name,
          email: optimistic.email,
          region: optimistic.region,
          shiftRate: optimistic.shiftRate,
          vatRate: optimistic.vatRate,
          sheetId: optimistic.sheetId,
        }).then(({ engineer: saved, error }) => {
          if (error) {
            dbError("Engineer record", error);
            setEngineers((prev) => prev.filter((e) => e.id !== optimistic.id));
            return;
          }
          if (saved) {
            setEngineers((prev) =>
              prev.map((e) =>
                e.id === optimistic.id
                  ? { ...saved, vatRate: optimistic.vatRate, sheetId: optimistic.sheetId }
                  : e,
              ),
            );
            setEngineerId((prev) => (prev === optimistic.id ? saved.id : prev));
            toast.success(`${saved.name} saved`);
          }
        });
        void pushEngineer(optimistic).then((r) => syncToast("Engineer record", r));
        return optimistic;
      },
      updateEngineer: (id, patch) => {
        const target = findEngineer(id);
        setEngineers((prev) =>
          prev.map((e) =>
            e.id === id
              ? {
                  ...e,
                  ...(patch.name !== undefined ? { name: patch.name } : {}),
                  ...(patch.email !== undefined ? { email: patch.email } : {}),
                  ...(patch.region !== undefined ? { region: patch.region } : {}),
                  ...(patch.shiftRate !== undefined ? { shiftRate: num(patch.shiftRate) } : {}),
                  ...(patch.vatRate !== undefined ? { vatRate: num(patch.vatRate) } : {}),
                  ...(patch.paidAmount !== undefined ? { paidAmount: num(patch.paidAmount) } : {}),
                  ...(patch.sheetId !== undefined ? { sheetId: patch.sheetId || undefined } : {}),
                }
              : e,
          ),
        );
        if (target) {
          void updateEngineerRow(target, patch).then((error) => dbError("Engineer record", error));
        }
      },
      deleteEngineer: (id) => {
        const target = findEngineer(id);
        setEngineers((prev) => prev.filter((e) => e.id !== id));
        setShifts((prev) => prev.filter((s) => s.engineerId !== id));
        setExpenses((prev) => prev.filter((e) => e.engineerId !== id));
        if (engineerId === id) {
          const fallback = engineers.find((e) => e.id !== id);
          if (fallback) setEngineerId(fallback.id);
        }
        void deleteEngineerRow(id).then((error) => dbError("Engineer record", error));
        toast.success(`${target?.name ?? "Engineer"} removed`);
      },

      setEngineerActive: (id, active) => {
        setEngineers((prev) => prev.map((e) => (e.id === id ? { ...e, active } : e)));
        const target = findEngineer(id);
        if (target) {
          void updateEngineerRow(target, { active }).then((error) =>
            dbError("Engineer record", error),
          );
        }
        toast.success(`${target?.name ?? "Engineer"} ${active ? "activated" : "blocked"}`);
      },
      setEngineerDocument: (id, kind, doc) => {
        const target = findEngineer(id);
        setEngineers((prev) =>
          prev.map((e) => {
            if (e.id !== id) return e;
            const docs = { ...(e.documents ?? {}) };
            if (doc) docs[kind] = doc;
            else delete docs[kind];
            return { ...e, documents: docs };
          }),
        );
        if (!doc && target?.documents?.[kind]) {
          void deleteEngineerDocument(target.email, kind, target.documents[kind]!.url).then(
            (error) => dbError("Document", error),
          );
        }
      },
      uploadDocument: async (id, kind, file) => {
        const target = findEngineer(id);
        if (!target) return;
        const { document, error } = await uploadEngineerDocument(target.email, kind, file);
        if (error || !document) {
          toast.error("Upload failed", { description: error ?? "Unknown storage error" });
          return;
        }
        setEngineers((prev) =>
          prev.map((e) =>
            e.id === id ? { ...e, documents: { ...(e.documents ?? {}), [kind]: document } } : e,
          ),
        );
        toast.success("Document uploaded");
      },
      syncEngineerFromSheet: async (id) => {
        const target = findEngineer(id);
        if (!target?.sheetId) {
          toast.info("No Google Sheet linked", {
            description: "Add a Sheet ID to this engineer to pull their external records.",
          });
          return;
        }
        const res = await fetchEngineerSheetRecords(target);
        if (res.error) {
          toast.error("Google Sheets sync failed", { description: res.error });
          return;
        }
        // Persist the sheet rows into this engineer's own shift_logs / expenses
        // rows (engineer_id scoped), then replace only their rows in state.
        const sheetShifts = res.shifts.map((s) => ({
          ...s,
          engineerId: id,
          shiftCount: num(s.shiftCount, 1),
        }));
        const sheetExpenses = res.expenses.map((e) => ({
          ...e,
          engineerId: id,
          fuel: num(e.fuel),
          meals: num(e.meals),
          creditCard: num(e.creditCard),
        }));
        const saved = await saveSheetRecords(id, sheetShifts, sheetExpenses);
        if (saved.error && !isMissingTable(saved.error)) {
          toast.error("Saving sheet records failed", { description: saved.error });
        }
        if (saved.shifts.length || saved.expenses.length) {
          setShifts((prev) => [...saved.shifts, ...prev.filter((s) => s.engineerId !== id)]);
          setExpenses((prev) => [...saved.expenses, ...prev.filter((e) => e.engineerId !== id)]);
        } else {
          setShifts((prev) => mergeById(prev, sheetShifts));
          setExpenses((prev) => mergeById(prev, sheetExpenses));
        }

        // Financial payouts come from Supabase payout_logs first; the legacy
        // WeActive9_Payroll_Sync sheet is only a fallback.
        const live = await fetchPayoutsForEmail(target.email);
        const payoutRes = live.payouts.length
          ? live
          : await fetchPayoutLogs(target.email, target.sheetId);
        if (payoutRes.payouts.length) {
          setPayouts((prev) => ({ ...prev, [id]: payoutRes.payouts }));
          const paid = num(payoutRes.paid);
          setEngineers((prev) => prev.map((e) => (e.id === id ? { ...e, paidAmount: paid } : e)));
        } else if (res.paid !== undefined) {
          const paid = num(res.paid);
          setEngineers((prev) => prev.map((e) => (e.id === id ? { ...e, paidAmount: paid } : e)));
        }
        toast.success("Sheet synced successfully!", {
          description: `${target.name}: ${res.shifts.length} shifts · ${res.expenses.length} claims${
            res.paid !== undefined ? ` · paid £${res.paid.toFixed(2)}` : ""
          }`,
        });
      },

      payouts,
      payoutsFor: (id) => payouts[id] ?? [],
      syncPayouts: async (id, opts) => {
        const target = findEngineer(id);
        if (!target?.email) return;
        const live = await fetchPayoutsForEmail(target.email);
        const res =
          live.payouts.length || !target.sheetId
            ? live
            : await fetchPayoutLogs(target.email, target.sheetId);
        if (res.error && !res.payouts.length) {
          if (!opts?.silent) toast.error("Payroll sync failed", { description: res.error });
          return;
        }
        setPayouts((prev) => ({ ...prev, [id]: res.payouts }));
        if (res.payouts.length) {
          const paid = num(res.paid);
          setEngineers((prev) => prev.map((e) => (e.id === id ? { ...e, paidAmount: paid } : e)));
        }
        if (!opts?.silent) {
          toast.success("Payout history synced", {
            description: `${target.name}: ${res.payouts.length} payout${
              res.payouts.length === 1 ? "" : "s"
            } · paid £${num(res.paid).toFixed(2)}`,
          });
        }
      },
    };
  }, [role, engineerId, engineers, shifts, expenses, payouts]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
