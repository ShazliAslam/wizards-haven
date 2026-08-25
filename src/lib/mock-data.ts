export type Status = "Pending" | "Approved";
export type ShiftType = "Day" | "Night";

export type DocumentKind = "drivingLicense" | "photoId" | "resume";

export interface EngineerDocument {
  name: string;
  /** Data URL kept locally so the file can be previewed / downloaded again. */
  url: string;
  uploadedAt: string;
}

export interface Engineer {
  id: string;
  name: string;
  email: string;
  region: string;
  /** Pay per completed shift (£). */
  shiftRate: number;
  /** Percentage deducted from gross shift earnings before payout. */
  vatRate: number;
  /** Amount already paid out (kept in sync with the sheet's Paid column). */
  paidAmount: number;
  /** Optional per-engineer Google Sheet ID used for two-way data syncing. */
  sheetId?: string | undefined;
  /** Blocked engineers stay in reports but cannot submit new records. */
  active: boolean;
  documents?: Partial<Record<DocumentKind, EngineerDocument>> | undefined;
}

/** UK VAT is 20%; expense amounts are captured VAT-inclusive. */
export const VAT_RATE = 0.2;
export const vatPortion = (grossInclusive: number) =>
  grossInclusive - grossInclusive / (1 + VAT_RATE);

/** Default deduction applied to shift earnings for new engineers. */
export const DEFAULT_VAT_DEDUCTION = 6;

/** Own-vehicle allowance is capped at one per day, seven per week. */
export const OWN_VEHICLE_WEEKLY_CAP = 7;

export interface ShiftLog {
  id: string;
  engineerId: string;
  date: string; // YYYY-MM-DD
  site: string;
  shiftType: ShiftType;
  /** Number of shifts logged on this day (normally 1). */
  shiftCount: number;
  /** Own-vehicle daily allowance claimed for this day. */
  ownVehicle: boolean;
  status: Status;
  /** Engineer-raised query / comment against this shift. */
  comment?: string | undefined;
  commentAt?: string | undefined;
}

export interface ExpenseEntry {
  id: string;
  engineerId: string;
  date: string;
  site: string;
  fuel: number;
  meals: number;
  creditCard: number;
  receiptName?: string | undefined;
  status: Status;
}

export const SITES = [
  "Aberdeen North Substation",
  "Bristol Data Centre",
  "Cardiff Retail Park",
  "Glasgow Rail Depot",
  "Leeds Wind Farm",
  "Manchester Tower A",
  "Norwich Solar Array",
  "Southampton Docks",
];

const FIRST = [
  "James","Sarah","Mohammed","Priya","Liam","Chloe","Daniel","Aisha","Tom","Grace",
  "Ethan","Nadia","Oliver","Fatima","Callum","Zara","Ben","Isla","Ryan","Maya",
  "Connor","Leah","Josh","Amara","Nathan","Ruby","Adam","Sofia","Jack","Elena",
];
const LAST = [
  "Whitfield","Okafor","Rahman","Sharma","Doyle","Bennett","Carver","Hassan","Lawson","Mercer",
  "Nolan","Farah","Pierce","Iqbal","Reid","Malik","Sutton","Grant","Kelly","Barnes",
  "Hughes","Foster","Ellis","Nwosu","Clarke","Dawson","Blake","Moreno","Turner","Petrov",
];

// Deterministic pseudo-random so server and client render identically.
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export const ENGINEERS: Engineer[] = FIRST.map((f, i) => {
  const r = rng(i + 7);
  const name = `${f} ${LAST[i]!}`;
  return {
    id: `ENG-${String(i + 1).padStart(3, "0")}`,
    name,
    email: `${f.toLowerCase()}.${LAST[i]!.toLowerCase()}@weactive9.com`,
    region: ["North", "South", "Midlands", "Scotland", "Wales"][i % 5]!,
    shiftRate: 180 + Math.round(r() * 12) * 5,
    vatRate: DEFAULT_VAT_DEDUCTION,
    paidAmount: 0,
    active: true,
  };
});

export const CURRENT_ENGINEER = ENGINEERS[0]!;

function dateNDaysAgo(n: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export const SHIFTS: ShiftLog[] = [];
export const EXPENSES: ExpenseEntry[] = [];

ENGINEERS.forEach((eng, ei) => {
  const r = rng(ei * 31 + 3);
  for (let d = 0; d < 28; d++) {
    if (r() < 0.32) continue;
    const site = SITES[Math.floor(r() * SITES.length)]!;
    const date = dateNDaysAgo(d);
    const status: Status = d > 6 || r() > 0.45 ? "Approved" : "Pending";
    SHIFTS.push({
      id: `SH-${ei}-${d}`,
      engineerId: eng.id,
      date,
      site,
      shiftType: r() > 0.72 ? "Night" : "Day",
      shiftCount: 1,
      ownVehicle: r() > 0.35,
      status,
    });
    if (r() < 0.75) {
      EXPENSES.push({
        id: `EX-${ei}-${d}`,
        engineerId: eng.id,
        date,
        site,
        fuel: Math.round((12 + r() * 58) * 100) / 100,
        meals: Math.round((6 + r() * 22) * 100) / 100,
        creditCard: r() > 0.6 ? Math.round((20 + r() * 180) * 100) / 100 : 0,
        receiptName: r() > 0.5 ? `receipt-${ei}-${d}.pdf` : undefined,
        status,
      });
    }
  }
});

// Seed a few paid balances so the payment sync view has meaningful data.
ENGINEERS.forEach((eng, i) => {
  const total = SHIFTS.filter((s) => s.engineerId === eng.id).reduce(
    (a, s) => a + s.shiftCount,
    0,
  );
  eng.paidAmount = Math.round(total * eng.shiftRate * (i % 4 === 0 ? 0 : 0.5));
});

export const gbp = (n: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(n);

export const gbp2 = (n: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);

export const expenseTotal = (e: ExpenseEntry) => e.fuel + e.meals + e.creditCard;

export function daysAgo(dateStr: string) {
  const now = new Date().toISOString().slice(0, 10);
  return Math.round(
    (Date.parse(now) - Date.parse(dateStr)) / 86400000,
  );
}

export const engineerById = (id: string) => ENGINEERS.find((e) => e.id === id);
