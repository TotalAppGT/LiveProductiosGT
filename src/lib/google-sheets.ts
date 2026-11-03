import { createSign } from "crypto";
import { prisma } from "@/lib/prisma";
import { buildComparisonTabs } from "@/lib/compare-report";
import type { CompareData } from "@/lib/order-compare";

type ServiceAccount = { client_email: string; private_key: string; token_uri?: string };

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"];
const DEFAULT_SHARE_EMAIL = "liveproductionsgt@gmail.com";

let cached: ServiceAccount | null | undefined;

async function configValue(key: string): Promise<string> {
  try {
    return (await prisma.systemConfig.findUnique({ where: { key } }))?.value || "";
  } catch {
    return "";
  }
}

export async function getServiceAccount(): Promise<ServiceAccount | null> {
  if (cached !== undefined) return cached;
  let raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "";
  if (!raw) raw = await configValue("google_service_account_json");
  if (!raw) {
    cached = null;
    return null;
  }
  try {
    let text = raw.trim();
    if (!text.startsWith("{")) text = Buffer.from(text, "base64").toString("utf8");
    cached = JSON.parse(text) as ServiceAccount;
  } catch {
    cached = null;
  }
  return cached;
}

const b64url = (input: Buffer | string) =>
  Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const tokenUri = sa.token_uri || "https://oauth2.googleapis.com/token";
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({ iss: sa.client_email, scope: SCOPES.join(" "), aud: tokenUri, iat: now, exp: now + 3600 })
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  const signature = b64url(signer.sign(sa.private_key));
  const assertion = `${header}.${payload}.${signature}`;
  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || "google-auth-failed");
  }
  return json.access_token as string;
}

async function shareEmail(): Promise<string> {
  const fromEnv = process.env.GOOGLE_SHEETS_SHARE_EMAIL || "";
  if (fromEnv) return fromEnv;
  const fromDb = await configValue("google_sheets_share_email");
  return fromDb || DEFAULT_SHARE_EMAIL;
}

export async function createComparisonSheet(data: CompareData): Promise<{ url: string; spreadsheetId: string }> {
  const sa = await getServiceAccount();
  if (!sa) throw new Error("google-service-account-not-configured");
  const token = await getAccessToken(sa);
  const auth = { Authorization: "Bearer " + token, "Content-Type": "application/json" };
  const tabs = buildComparisonTabs(data);
  const title = `Comparativa ${data.source.eventName} → ${data.target.eventName} — ${data.source.eventDate || ""}`;

  const createRes = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      properties: { title },
      sheets: tabs.map((t) => ({ properties: { title: t.name } })),
    }),
  });
  const created = await createRes.json();
  if (!createRes.ok) throw new Error(created?.error?.message || "sheet-create-failed");
  const spreadsheetId = created.spreadsheetId as string;
  const sheetIds: number[] = (created.sheets || []).map((s: { properties: { sheetId: number } }) => s.properties.sheetId);

  const values = tabs.map((t) => ({
    range: `'${t.name.replace(/'/g, "''")}'!A1`,
    values: t.rows,
  }));
  const valRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ valueInputOption: "RAW", data: values }),
  });
  if (!valRes.ok) {
    const err = await valRes.json().catch(() => ({}));
    throw new Error(err?.error?.message || "sheet-values-failed");
  }

  const requests: unknown[] = [];
  tabs.forEach((tab, i) => {
    const sheetId = sheetIds[i];
    if (sheetId === undefined) return;
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
            backgroundColor: { red: 0.12, green: 0.23, blue: 0.54 },
            horizontalAlignment: "CENTER",
          },
        },
        fields: "userEnteredFormat.textFormat,userEnteredFormat.backgroundColor,userEnteredFormat.horizontalAlignment",
      },
    });
    requests.push({
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
        fields: "gridProperties.frozenRowCount",
      },
    });
    tab.widths.forEach((w, col) => {
      requests.push({
        updateDimensionProperties: {
          range: { sheetId, dimension: "COLUMNS", startIndex: col, endIndex: col + 1 },
          properties: { pixelSize: Math.round(w * 7 + 12) },
          fields: "pixelSize",
        },
      });
    });
    for (const row of tab.sectionRows) {
      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: row, endRowIndex: row + 1 },
          cell: {
            userEnteredFormat: {
              textFormat: { bold: true },
              backgroundColor: { red: 0.9, green: 0.92, blue: 0.95 },
            },
          },
          fields: "userEnteredFormat.textFormat,userEnteredFormat.backgroundColor",
        },
      });
    }
  });
  try {
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ requests }),
    });
  } catch {
    // El formato es opcional; los datos ya quedaron.
  }

  try {
    await fetch(`https://www.googleapis.com/drive/v3/files/${spreadsheetId}/permissions`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ role: "writer", type: "user", emailAddress: await shareEmail() }),
    });
  } catch {
    // Si falla el share, la hoja queda en la cuenta de servicio; el link puede requerir acceso.
  }

  return { url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`, spreadsheetId };
}
