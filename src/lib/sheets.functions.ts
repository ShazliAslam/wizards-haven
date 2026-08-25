import { createServerFn } from "@tanstack/react-start";

const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";
const DIRECT = "https://sheets.googleapis.com/v4";

type Transport = { base: string; headers: Record<string, string>; spreadsheetId: string };

/**
 * Resolve how to talk to Google Sheets:
 * 1. Lovable connector gateway (editor / Lovable-hosted runtime)
 * 2. Google service account (GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY)
 */
async function transport(overrideSpreadsheetId?: string): Promise<Transport | null> {
  const spreadsheetId = overrideSpreadsheetId || process.env["WEACTIVE9_SPREADSHEET_ID"];
  if (!spreadsheetId) return null;

  const lovableKey = (process.env["LOVABLE_API_KEY"] ?? "").trim();
  const connectionKey = (process.env["GOOGLE_SHEETS_API_KEY"] ?? "").trim();
  if (lovableKey && connectionKey) {
    return {
      base: GATEWAY,
      spreadsheetId,
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": connectionKey,
        "Content-Type": "application/json",
      },
    };
  }

  const { getServiceAccountToken } = await import("./google-auth.server");
  const token = await getServiceAccountToken();
  if (token) {
    return {
      base: DIRECT,
      spreadsheetId,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    };
  }

  throw new Error(
    "Google Sheets is not configured on this deployment. Link the Google Sheets connector, or set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY environment variables.",
  );
}

/** Read a tab's values. Returns configured:false when no spreadsheet id is known. */
export const readSheetRange = createServerFn({ method: "GET" })
  .inputValidator((data: { range: string; spreadsheetId?: string }) => data)
  .handler(async ({ data }) => {
    const t = await transport(data.spreadsheetId);
    if (!t) return { configured: false as const, values: [] as string[][] };
    const res = await fetch(
      `${t.base}/spreadsheets/${t.spreadsheetId}/values/${encodeURIComponent(data.range)}`,
      { headers: t.headers },
    );
    if (!res.ok) {
      throw new Error(`Google Sheets read failed [${res.status}]: ${await res.text()}`);
    }
    const json = (await res.json()) as { values?: string[][] };
    return { configured: true as const, values: json.values ?? [] };
  });

/** Append one row to a tab. */
export const appendSheetRow = createServerFn({ method: "POST" })
  .inputValidator((data: { range: string; row: (string | number)[]; spreadsheetId?: string }) => data)
  .handler(async ({ data }) => {
    const t = await transport(data.spreadsheetId);
    if (!t) return { configured: false as const };
    const res = await fetch(
      `${t.base}/spreadsheets/${t.spreadsheetId}/values/${encodeURIComponent(data.range)}:append?valueInputOption=USER_ENTERED`,
      { method: "POST", headers: t.headers, body: JSON.stringify({ values: [data.row] }) },
    );
    if (!res.ok) {
      throw new Error(`Google Sheets append failed [${res.status}]: ${await res.text()}`);
    }
    return { configured: true as const };
  });
