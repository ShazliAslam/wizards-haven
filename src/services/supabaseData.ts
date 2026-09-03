/**
 * Live Supabase data access for engineers, expense claims, payout logs and
 * engineer documents. Replaces the previous localStorage-only persistence so
 * every change survives a hard refresh.
 *
 * Tables used (public schema):
 *   engineers    id, name, email, region, shift_rate, status, created_at
 *   claims       id, engineer_email, date, site, fuel, meals, card, status
 *   payout_logs  id, engineer_email, date, paid_amount, payment_method,
 *                transaction_ref, notes
 *   documents    id, engineer_email, doc_type, file_url, created_at
 *
 * Optional columns (`vat_rate`, `sheet_id`, `paid_amount` on engineers) are
 * written when they exist and silently skipped when they do not, so the app
 * works against the current schema without a migration.
 */
import { DOCUMENTS_BUCKET, supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_VAT_DEDUCTION,
  num,
  type DocumentKind,
  type Engineer,
  type EngineerDocument,
  type ExpenseEntry,
} from "@/lib/mock-data";
import type { PayoutLog } from "@/services/sheetsService";

type Row = Record<string, unknown>;

const DOC_TYPE: Record<DocumentKind, string> = {
  drivingLicense: "driving_license",
  photoId: "photo_id",
  resume: "resume",
};
const DOC_KIND: Record<string, DocumentKind> = {
  driving_license: "drivingLicense",
  photo_id: "photoId",
  resume: "resume",
};

const str = (v: unknown, fallback = "") => (v === null || v === undefined ? fallback : String(v));
const lower = (v: unknown) => str(v).trim().toLowerCase();

/** Local overlay for fields whose columns may not exist in the database yet. */
const OVERLAY_KEY = "weactive9.engineerOverlay";
type Overlay = Record<string, { vatRate?: number; sheetId?: string }>;

function readOverlay(): Overlay {
  try {
    return JSON.parse(window.localStorage.getItem(OVERLAY_KEY) ?? "{}") as Overlay;
  } catch {
    return {};
  }
}
function writeOverlay(next: Overlay) {
  try {
    window.localStorage.setItem(OVERLAY_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
}
function patchOverlay(email: string, patch: { vatRate?: number; sheetId?: string }) {
  const key = lower(email);
  if (!key) return;
  const all = readOverlay();
  all[key] = { ...all[key], ...patch };
  writeOverlay(all);
}

/* ------------------------------------------------------------------ *
 * Engineers + documents
 * ------------------------------------------------------------------ */

function toEngineer(r: Row, docs: Partial<Record<DocumentKind, EngineerDocument>>): Engineer {
  const email = str(r['email']);
  const overlay = readOverlay()[lower(email)] ?? {};
  return {
    id: str(r['id']),
    name: str(r['name']),
    email,
    region: str(r['region']),
    shiftRate: num(r['shift_rate'], 180),
    vatRate:
      r['vat_rate'] !== undefined && r['vat_rate'] !== null
        ? num(r['vat_rate'], DEFAULT_VAT_DEDUCTION)
        : num(overlay.vatRate, DEFAULT_VAT_DEDUCTION),
    paidAmount: num(r['paid_amount']),
    sheetId: (r['sheet_id'] ? str(r['sheet_id']) : overlay.sheetId) || undefined,
    active: lower(r['status'] ?? "Active") !== "blocked",
    documents: docs,
  };
}

export async function fetchDocumentsByEmail(): Promise<
  Record<string, Partial<Record<DocumentKind, EngineerDocument>>>
> {
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[supabaseData] fetchDocuments", error.message);
    return {};
  }
  const out: Record<string, Partial<Record<DocumentKind, EngineerDocument>>> = {};
  for (const row of (data ?? []) as Row[]) {
    const email = lower(row['engineer_email']);
    const kind = DOC_KIND[str(row['doc_type'])];
    const url = str(row['file_url']);
    if (!email || !kind || !url) continue;
    out[email] ??= {};
    out[email]![kind] = {
      name: decodeURIComponent(url.split("/").pop() ?? "document"),
      url,
      uploadedAt: str(row['created_at']),
    };
  }
  return out;
}

export async function fetchEngineers(): Promise<{ engineers: Engineer[]; error?: string }> {
  const [{ data, error }, docs] = await Promise.all([
    supabase.from("engineers").select("*").order("created_at", { ascending: true }),
    fetchDocumentsByEmail(),
  ]);
  if (error) return { engineers: [], error: error.message };
  const engineers = ((data ?? []) as Row[]).map((r) =>
    toEngineer(r, docs[lower(r['email'])] ?? {}),
  );
  return { engineers };
}

/** Update a row, dropping columns the database does not have (and keeping them locally). */
async function safeUpdate(table: string, id: string, patch: Row): Promise<string | undefined> {
  let body = { ...patch };
  for (let attempt = 0; attempt < 6; attempt++) {
    if (!Object.keys(body).length) return undefined;
    const { error } = await supabase.from(table).update(body).eq("id", id);
    if (!error) return undefined;
    const missing = /Could not find the '(.+?)' column/.exec(error.message)?.[1];
    if (!missing || !(missing in body)) return error.message;
    delete body[missing];
  }
  return undefined;
}

export async function insertEngineer(input: {
  name: string;
  email: string;
  region: string;
  shiftRate: number;
  vatRate: number;
  sheetId?: string | undefined;
}): Promise<{ engineer?: Engineer; error?: string }> {
  const base: Row = {
    name: input.name,
    email: input.email,
    region: input.region,
    shift_rate: num(input.shiftRate),
    status: "Active",
  };
  let body: Row = { ...base, vat_rate: num(input.vatRate), sheet_id: input.sheetId ?? null };
  for (let attempt = 0; attempt < 6; attempt++) {
    const { data, error } = await supabase.from("engineers").insert(body).select("*").single();
    if (!error && data) {
      patchOverlay(input.email, {
        vatRate: num(input.vatRate, DEFAULT_VAT_DEDUCTION),
        ...(input.sheetId ? { sheetId: input.sheetId } : {}),
      });
      return { engineer: toEngineer(data as Row, {}) };
    }
    const missing = error ? /Could not find the '(.+?)' column/.exec(error.message)?.[1] : undefined;
    if (!missing || !(missing in body)) return { error: error?.message ?? "Insert failed" };
    const next = { ...body };
    delete next[missing];
    body = next;
  }
  return { error: "Insert failed" };
}

export async function updateEngineerRow(
  engineer: Engineer,
  patch: Partial<{
    name: string;
    email: string;
    region: string;
    shiftRate: number;
    vatRate: number;
    paidAmount: number;
    sheetId?: string | undefined;
    active: boolean;
  }>,
): Promise<string | undefined> {
  const body: Row = {};
  if (patch.name !== undefined) body['name'] = patch.name;
  if (patch.email !== undefined) body['email'] = patch.email;
  if (patch.region !== undefined) body['region'] = patch.region;
  if (patch.shiftRate !== undefined) body['shift_rate'] = num(patch.shiftRate);
  if (patch.vatRate !== undefined) body['vat_rate'] = num(patch.vatRate);
  if (patch.paidAmount !== undefined) body['paid_amount'] = num(patch.paidAmount);
  if (patch.sheetId !== undefined) body['sheet_id'] = patch.sheetId ?? null;
  if (patch.active !== undefined) body['status'] = patch.active ? "Active" : "Blocked";

  patchOverlay(patch.email ?? engineer.email, {
    ...(patch.vatRate !== undefined ? { vatRate: num(patch.vatRate) } : {}),
    ...(patch.sheetId !== undefined ? { sheetId: patch.sheetId ?? "" } : {}),
  });
  return safeUpdate("engineers", engineer.id, body);
}

export async function deleteEngineerRow(id: string): Promise<string | undefined> {
  const { error } = await supabase.from("engineers").delete().eq("id", id);
  return error?.message;
}

/* ------------------------------------------------------------------ *
 * Documents (Storage + table)
 * ------------------------------------------------------------------ */

export async function uploadEngineerDocument(
  email: string,
  kind: DocumentKind,
  file: File,
): Promise<{ document?: EngineerDocument; error?: string }> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${lower(email) || "unknown"}/${DOC_TYPE[kind]}-${Date.now()}-${safeName}`;

  const up = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, file, { upsert: true, ...(file.type ? { contentType: file.type } : {}) });
  if (up.error) return { error: up.error.message };

  const url = supabase.storage.from(DOCUMENTS_BUCKET).getPublicUrl(path).data.publicUrl;

  await supabase
    .from("documents")
    .delete()
    .eq("engineer_email", email)
    .eq("doc_type", DOC_TYPE[kind]);
  const ins = await supabase
    .from("documents")
    .insert({ engineer_email: email, doc_type: DOC_TYPE[kind], file_url: url })
    .select("*")
    .single();
  if (ins.error) return { error: ins.error.message };

  return { document: { name: file.name, url, uploadedAt: new Date().toISOString() } };
}

export async function deleteEngineerDocument(
  email: string,
  kind: DocumentKind,
  url: string,
): Promise<string | undefined> {
  const marker = `/${DOCUMENTS_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx >= 0) {
    const path = decodeURIComponent(url.slice(idx + marker.length));
    await supabase.storage.from(DOCUMENTS_BUCKET).remove([path]);
  }
  const { error } = await supabase
    .from("documents")
    .delete()
    .eq("engineer_email", email)
    .eq("doc_type", DOC_TYPE[kind]);
  return error?.message;
}

/* ------------------------------------------------------------------ *
 * Claims (expense entries)
 * ------------------------------------------------------------------ */

export async function fetchClaims(
  emailToId: Map<string, string>,
): Promise<{ claims: ExpenseEntry[]; error?: string }> {
  const { data, error } = await supabase
    .from("claims")
    .select("*")
    .order("date", { ascending: false });
  if (error) return { claims: [], error: error.message };
  const claims = ((data ?? []) as Row[])
    .map((r) => {
      const engineerId = emailToId.get(lower(r['engineer_email'])) ?? "";
      const entry: ExpenseEntry = {
        id: str(r['id']),
        engineerId,
        date: str(r['date']),
        site: str(r['site']),
        fuel: num(r['fuel']),
        meals: num(r['meals']),
        creditCard: num(r['card']),
        status: lower(r['status']) === "approved" ? "Approved" : "Pending",
      };
      return entry;
    })
    .filter((e) => e.engineerId);
  return { claims };
}

export async function insertClaim(
  entry: Omit<ExpenseEntry, "id">,
  email: string,
): Promise<{ claim?: ExpenseEntry; error?: string }> {
  const { data, error } = await supabase
    .from("claims")
    .insert({
      engineer_email: email,
      date: entry.date,
      site: entry.site,
      fuel: num(entry.fuel),
      meals: num(entry.meals),
      card: num(entry.creditCard),
      status: entry.status,
    })
    .select("*")
    .single();
  if (error || !data) return { error: error?.message ?? "Insert failed" };
  return { claim: { ...entry, id: str((data as Row)['id']) } };
}

export async function updateClaim(
  id: string,
  patch: Partial<Omit<ExpenseEntry, "id" | "engineerId">>,
): Promise<string | undefined> {
  const body: Row = {};
  if (patch.date !== undefined) body['date'] = patch.date;
  if (patch.site !== undefined) body['site'] = patch.site;
  if (patch.fuel !== undefined) body['fuel'] = num(patch.fuel);
  if (patch.meals !== undefined) body['meals'] = num(patch.meals);
  if (patch.creditCard !== undefined) body['card'] = num(patch.creditCard);
  if (patch.status !== undefined) body['status'] = patch.status;
  return safeUpdate("claims", id, body);
}

/* ------------------------------------------------------------------ *
 * Payout logs (financial payouts only)
 * ------------------------------------------------------------------ */

export async function fetchPayoutLogsByEmail(): Promise<{
  byEmail: Record<string, PayoutLog[]>;
  error?: string;
}> {
  const { data, error } = await supabase
    .from("payout_logs")
    .select("*")
    .order("date", { ascending: false });
  if (error) return { byEmail: {}, error: error.message };
  const byEmail: Record<string, PayoutLog[]> = {};
  for (const row of (data ?? []) as Row[]) {
    const email = lower(row['engineer_email']);
    if (!email) continue;
    byEmail[email] ??= [];
    byEmail[email]!.push({
      date: str(row['date']),
      email,
      amount: num(row['paid_amount']),
      method: str(row['payment_method']),
      reference: str(row['transaction_ref']),
      notes: str(row['notes']),
    });
  }
  return { byEmail };
}

export async function fetchPayoutsForEmail(
  email: string,
): Promise<{ payouts: PayoutLog[]; paid: number; error?: string }> {
  const target = lower(email);
  if (!target) return { payouts: [], paid: 0 };
  const { data, error } = await supabase
    .from("payout_logs")
    .select("*")
    .ilike("engineer_email", target)
    .order("date", { ascending: false });
  if (error) return { payouts: [], paid: 0, error: error.message };
  const payouts = ((data ?? []) as Row[]).map((row) => ({
    date: str(row['date']),
    email: target,
    amount: num(row['paid_amount']),
    method: str(row['payment_method']),
    reference: str(row['transaction_ref']),
    notes: str(row['notes']),
  }));
  return { payouts, paid: payouts.reduce((a, p) => a + num(p.amount), 0) };
}
