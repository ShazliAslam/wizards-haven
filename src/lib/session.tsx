import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
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
  type ShiftLog,
} from "./mock-data";
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
  addEngineer: (input: NewEngineerInput) => Engineer;
  updateEngineer: (id: string, patch: Partial<NewEngineerInput>) => void;
  deleteEngineer: (id: string) => void;
  setEngineerActive: (id: string, active: boolean) => void;
  setEngineerDocument: (id: string, kind: DocumentKind, doc: EngineerDocument | null) => void;
  syncEngineerFromSheet: (id: string) => Promise<void>;
}

const Ctx = createContext<SessionValue | null>(null);

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
    shiftRate: Number(e.shiftRate ?? (e as unknown as { hourlyRate?: number }).hourlyRate ?? 180),
    vatRate: Number.isFinite(e.vatRate) ? e.vatRate : DEFAULT_VAT_DEDUCTION,
    paidAmount: Number(e.paidAmount ?? 0),
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
        const shift: ShiftLog = {
          ...s,
          id: `SH-new-${Date.now()}`,
          engineerId: engineer.id,
          status: "Pending",
        };
        setShifts((prev) => [shift, ...prev]);
        void pushShift(shift, engineer).then((r) => syncToast("Shift", r));
      },
      updateShift: (id, patch) => {
        setShifts((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
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
      addEngineer: (input) => {
        const next: Engineer = {
          id: `ENG-${String(engineers.length + 1).padStart(3, "0")}-${Date.now().toString().slice(-4)}`,
          name: input.name,
          email: input.email,
          region: input.region,
          shiftRate: input.shiftRate,
          vatRate: input.vatRate ?? DEFAULT_VAT_DEDUCTION,
          paidAmount: input.paidAmount ?? 0,
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
                  ...(patch.shiftRate !== undefined ? { shiftRate: patch.shiftRate } : {}),
                  ...(patch.vatRate !== undefined ? { vatRate: patch.vatRate } : {}),
                  ...(patch.paidAmount !== undefined ? { paidAmount: patch.paidAmount } : {}),
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
        setShifts((prev) => mergeById(prev, res.shifts));
        setExpenses((prev) => mergeById(prev, res.expenses));
        if (res.paid !== undefined) {
          const paid = res.paid;
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
