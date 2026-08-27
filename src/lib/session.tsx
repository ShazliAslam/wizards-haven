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
  pushEngineer,
  pushExpense,
  pushShift,
} from "@/services/sheetsService";

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
  syncEngineerFromSheet: (id: string) => Promise<void>;
}

// Kept on globalThis so a hot-module reload can't create a second context
// instance (provider from the old module, hook from the new one -> false
// "must be used inside SessionProvider" crash).
const globalStore = globalThis as typeof globalThis & {
  __weactive9SessionCtx?: React.Context<SessionValue | null>;
};
const Ctx =
  globalStore.__weactive9SessionCtx ??
  (globalStore.__weactive9SessionCtx = createContext<SessionValue | null>(null));

const STORAGE_KEY = "weactive9.engineers";

/** Merge sheet-sourced rows into local state without duplicating ids. */
function mergeById<T extends { id: string }>(local: T[], incoming: T[]): T[] {
  const known = new Set(local.map((r) => r.id));
  const fresh = incoming.filter((r) => r.id && !known.has(r.id));
  return fresh.length ? [...fresh, ...local] : local;
}

/** Older saved rosters may predate the shift-rate / VAT fields. */
function normalise(list: Engineer[]): Engineer[] {
  return list.map((e) => ({
    ...e,
    shiftRate: num(e.shiftRate ?? (e as unknown as { hourlyRate?: number }).hourlyRate, 180),
    vatRate: Number.isFinite(Number(e.vatRate)) ? num(e.vatRate) : DEFAULT_VAT_DEDUCTION,
    paidAmount: num(e.paidAmount),
  }));
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role | null>(null);
  const [engineerId, setEngineerId] = useState<string>(CURRENT_ENGINEER.id);
  const [engineers, setEngineers] = useState<Engineer[]>(ENGINEERS);
  const [hydrated, setHydrated] = useState(false);
  const [shifts, setShifts] = useState<ShiftLog[]>(SHIFTS);
  const [expenses, setExpenses] = useState<ExpenseEntry[]>(EXPENSES);

  // Restore any admin edits (new engineers, sheet links, deletions) after hydration.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Engineer[];
        if (Array.isArray(saved) && saved.length) setEngineers(normalise(saved));
      }
    } catch {
      /* ignore corrupt storage */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(engineers));
    } catch {
      /* storage full or unavailable */
    }
  }, [engineers, hydrated]);


  const value = useMemo<SessionValue>(() => {
    const findEngineer = (id: string) => engineers.find((e) => e.id === id);
    const engineer = findEngineer(engineerId) ?? engineers[0]!;

    const syncToast = (label: string, result: { synced: boolean; error?: string }) => {
      if (result.synced) toast.success(`${label} synced to Google Sheets`);
      else if (result.error) toast.error(`Google Sheets sync failed`, { description: result.error });
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
      },
      deleteShift: (id) => {
        setShifts((prev) => prev.filter((s) => s.id !== id));
        toast.success("Shift removed");
      },
      commentOnShift: (id, comment) => {
        setShifts((prev) =>
          prev.map((s) =>
            s.id === id ? { ...s, comment, commentAt: new Date().toISOString() } : s,
          ),
        );
        toast.success("Query sent to the admin console");
      },
      addExpense: (e) => {
        const expense: ExpenseEntry = {
          ...e,
          id: `EX-new-${Date.now()}`,
          engineerId: engineer.id,
          status: "Pending",
        };
        setExpenses((prev) => [expense, ...prev]);
        void pushExpense(expense, engineer).then((r) => syncToast("Expense claim", r));
      },
      updateExpense: (id, patch) => {
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
      },
      addEngineer: (input) => {
        const next: Engineer = {
          id: `ENG-${String(engineers.length + 1).padStart(3, "0")}-${Date.now().toString().slice(-4)}`,
          name: input.name,
          email: input.email,
          region: input.region,
          shiftRate: num(input.shiftRate),
          vatRate: input.vatRate === undefined ? DEFAULT_VAT_DEDUCTION : num(input.vatRate, DEFAULT_VAT_DEDUCTION),
          paidAmount: num(input.paidAmount),
          sheetId: input.sheetId,
          active: true,
        };
        setEngineers((prev) => [...prev, next]);
        void pushEngineer(next).then((r) => syncToast("Engineer record", r));
        return next;
      },
      updateEngineer: (id, patch) => {
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
        toast.success(`${target?.name ?? "Engineer"} removed`);
      },

      setEngineerActive: (id, active) => {
        setEngineers((prev) => prev.map((e) => (e.id === id ? { ...e, active } : e)));
        const target = findEngineer(id);
        toast.success(`${target?.name ?? "Engineer"} ${active ? "activated" : "blocked"}`);
      },
      setEngineerDocument: (id, kind, doc) => {
        setEngineers((prev) =>
          prev.map((e) => {
            if (e.id !== id) return e;
            const docs = { ...(e.documents ?? {}) };
            if (doc) docs[kind] = doc;
            else delete docs[kind];
            return { ...e, documents: docs };
          }),
        );
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
        setShifts((prev) =>
          mergeById(
            prev,
            res.shifts.map((s) => ({ ...s, shiftCount: num(s.shiftCount, 1) })),
          ),
        );
        setExpenses((prev) =>
          mergeById(
            prev,
            res.expenses.map((e) => ({
              ...e,
              fuel: num(e.fuel),
              meals: num(e.meals),
              creditCard: num(e.creditCard),
            })),
          ),
        );
        if (res.paid !== undefined) {
          const paid = num(res.paid);
          setEngineers((prev) => prev.map((e) => (e.id === id ? { ...e, paidAmount: paid } : e)));
        }
        toast.success("Sheet synced successfully!", {
          description: `${target.name}: ${res.shifts.length} shifts · ${res.expenses.length} claims${
            res.paid !== undefined ? ` · paid £${res.paid.toFixed(2)}` : ""
          }`,
        });
      },

    };
  }, [role, engineerId, engineers, shifts, expenses]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
