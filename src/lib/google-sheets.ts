import { createSign } from "crypto";
import { prisma } from "@/lib/prisma";
import { buildReportTabs, type CompareTab } from "@/lib/compare-report";
import type { CompareResult } from "@/lib/order-compare";

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

export async function getReportSheetId(): Promise<string> {
  return process.env.GOOGLE_SHEETS_REPORT_ID || (await configValue("google_sheets_report_id"));
}

export async function getFolderId(): Promise<string> {
  return process.env.GOOGLE_SHEETS_FOLDER_ID || (await configValue("google_sheets_folder_id"));
}

export async function getPurchasesSheetId(): Promise<string> {
  return process.env.GOOGLE_SHEETS_PURCHASES_ID || (await configValue("google_sheets_purchases_id"));
}

function purchasesAction(section: string, inventory: number): string {
  const s = String(section || "").toUpperCase();
  if (inventory <= 0) return "Comprar";
  if (/CABLE|CONSUM|LIMPI|TELA/.test(s)) return "Comprar";
  return "Alquilar";
}

function dateTabName(dates: (string | null)[]): string {
  const uniq = Array.from(new Set(dates.filter(Boolean) as string[])).sort();
  if (uniq.length === 0) return "Compras";
  const parts = uniq.map((iso) => {
    const [, m, d] = iso.split("-");
    return { d, m };
  });
  if (parts.length === 1) return `${parts[0].d}-${parts[0].m}`;
  if (parts.every((p) => p.m === parts[0].m)) return parts.map((p) => p.d).join("/");
  return parts.map((p) => `${p.d}/${p.m}`).join("-");
}

export async function writePurchasesToSheet(
  data: CompareResult,
  spreadsheetId: string
): Promise<{ url: string; spreadsheetId: string; tabName: string }> {
  const sa = await getServiceAccount();
  if (!sa) throw new Error("google-service-account-not-configured");
  const token = await getAccessToken(sa);
  const auth = { Authorization: "Bearer " + token, "Content-Type": "application/json" };

  type Line = { name: string; section: string; need: number; inventory: number; short: number; action: string; cuadros: string[] };
  const lines: Line[] = [];

  if (data.mode === "pair") {
    for (const r of data.rows) {
      const need = r.sourceQty + r.targetQty;
      if (need <= 0) continue;
      const inventory = r.bodega || 0;
      const short = Math.max(0, need - inventory);
      if (short <= 0) continue;
      const cuadros: string[] = [];
      if (r.sourceQty > 0) cuadros.push(`#${data.source.orderNumber}`);
      if (r.targetQty > 0) cuadros.push(`#${data.target.orderNumber}`);
      const section = r.section || r.category || "OTRO";
      lines.push({
        name: r.name,
        section,
        need,
        inventory,
        short,
        action: purchasesAction(section, inventory),
        cuadros: Array.from(new Set(cuadros)),
      });
    }
  } else {
    for (const i of data.items) {
      const need = i.totalNeed;
      if (need <= 0) continue;
      const inventory = i.bodega || 0;
      const short = Math.max(0, need - inventory);
      if (short <= 0) continue;
      const section = i.section || i.category || "OTRO";
      const cuadros = Array.from(new Set(i.perEvent.filter((p) => p.need > 0).map((p) => `#${p.orderNumber}`)));
      lines.push({
        name: i.name,
        section,
        need,
        inventory,
        short,
        action: purchasesAction(section, inventory),
        cuadros,
      });
    }
  }

  lines.sort((a, b) => b.short - a.short || a.name.localeCompare(b.name));
  const rows: (string | number)[][] = [
    ["Equipo", "Sección", "Necesito", "Inventario", "Reparación", "Faltante", "Acción", "Cuadros"],
    ...lines.map((l) => [l.name, l.section, l.need, l.inventory, 0, l.short, l.action, l.cuadros.join(", ")]),
  ];

  const dates = data.mode === "pair" ? [data.source.eventDate, data.target.eventDate] : data.events.map((e) => e.eventDate);
  const tabName = dateTabName(dates);

  const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`, {
    headers: auth,
  });
  const meta = await metaRes.json();
  if (!metaRes.ok) throw new Error(meta?.error?.message || "sheet-read-failed");
  const found = (meta.sheets || []).find(
    (s: { properties: { title: string } }) => s.properties.title === tabName
  );
  let sheetId: number | undefined = found?.properties?.sheetId;

  if (sheetId === undefined) {
    const addRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tabName } } }] }),
    });
    const addJson = await addRes.json();
    if (!addRes.ok) throw new Error(addJson?.error?.message || "sheet-add-failed");
    sheetId = addJson?.replies?.[0]?.addSheet?.properties?.sheetId;
  }

  const quoted = tabName.replace(/'/g, "''");
  const clearRange = `'${quoted}'!A1:H5000`;
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(clearRange)}:clear`, {
    method: "POST",
    headers: auth,
    body: "{}",
  });

  const valRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ valueInputOption: "RAW", data: [{ range: `'${quoted}'!A1`, values: rows }] }),
  });
  if (!valRes.ok) {
    const err = await valRes.json().catch(() => ({}));
    throw new Error(err?.error?.message || "sheet-values-failed");
  }

  const gid = sheetId !== undefined ? `#gid=${sheetId}` : "";
  return {
    url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit${gid}`,
    spreadsheetId,
    tabName,
  };
}

async function formatTabs(token: string, spreadsheetId: string, tabs: CompareTab[], sheetIds: number[]) {
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
            userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.9, green: 0.92, blue: 0.95 } },
          },
          fields: "userEnteredFormat.textFormat,userEnteredFormat.backgroundColor",
        },
      });
    }
  });
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ requests }),
  });
}

export async function createComparisonSheetInFolder(
  data: CompareResult,
  folderId: string
): Promise<{ url: string; spreadsheetId: string }> {
  const sa = await getServiceAccount();
  if (!sa) throw new Error("google-service-account-not-configured");
  const token = await getAccessToken(sa);
  const auth = { Authorization: "Bearer " + token, "Content-Type": "application/json" };
  const tabs = buildReportTabs(data);
  const title = `Comparativa ${data.source.eventName} → ${data.target.eventName} — ${data.source.eventDate || ""}`;

  const createRes = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      name: title,
      mimeType: "application/vnd.google-apps.spreadsheet",
      parents: [folderId],
    }),
  });
  const created = await createRes.json();
  if (!createRes.ok) throw new Error(created?.error?.message || "drive-create-failed");
  const spreadsheetId = created.id as string;

  const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`, {
    headers: auth,
  });
  const meta = await metaRes.json();
  if (!metaRes.ok) throw new Error(meta?.error?.message || "sheet-read-failed");
  const firstId: number | undefined = meta.sheets?.[0]?.properties?.sheetId;

  const setupRequests: unknown[] = [];
  if (firstId !== undefined) {
    setupRequests.push({
      updateSheetProperties: {
        properties: { sheetId: firstId, title: tabs[0].name, index: 0 },
        fields: "title,index",
      },
    });
  }
  for (const tab of tabs.slice(1)) {
    setupRequests.push({ addSheet: { properties: { title: tab.name } } });
  }
  const setupRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ requests: setupRequests }),
  });
  if (!setupRes.ok) {
    const err = await setupRes.json().catch(() => ({}));
    throw new Error(err?.error?.message || "sheet-setup-failed");
  }

  const values = tabs.map((t) => ({ range: `'${t.name.replace(/'/g, "''")}'!A1`, values: t.rows }));
  const valRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ valueInputOption: "RAW", data: values }),
  });
  if (!valRes.ok) {
    const err = await valRes.json().catch(() => ({}));
    throw new Error(err?.error?.message || "sheet-values-failed");
  }

  const meta2Res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`, {
    headers: auth,
  });
  const meta2 = await meta2Res.json();
  const sheetIds: number[] = (meta2.sheets || []).map((s: { properties: { sheetId: number } }) => s.properties.sheetId);
  try {
    await formatTabs(token, spreadsheetId, tabs, sheetIds);
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
    // La hoja queda en la cuenta de servicio si falla el share.
  }

  return { url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`, spreadsheetId };
}

export async function writeComparisonToSheet(
  data: CompareResult,
  spreadsheetId: string
): Promise<{ url: string; spreadsheetId: string }> {
  const sa = await getServiceAccount();
  if (!sa) throw new Error("google-service-account-not-configured");
  const token = await getAccessToken(sa);
  const auth = { Authorization: "Bearer " + token, "Content-Type": "application/json" };

  const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`, {
    headers: auth,
  });
  const meta = await metaRes.json();
  if (!metaRes.ok) throw new Error(meta?.error?.message || "sheet-read-failed");
  const existingProps: { sheetId: number; title: string }[] = (meta.sheets || []).map(
    (s: { properties: { sheetId: number; title: string } }) => s.properties
  );
  const existing = existingProps.map((p) => p.title);

  const tabs = buildReportTabs(data);

  if (existing.length < tabs.length) {
    const requests = tabs.slice(existing.length).map((t) => ({ addSheet: { properties: { title: t.name } } }));
    const addRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ requests }),
    });
    if (!addRes.ok) {
      const err = await addRes.json().catch(() => ({}));
      throw new Error(err?.error?.message || "sheet-add-failed");
    }
  }

  const renameRequests = tabs
    .map((t, i) => {
      const p = existingProps[i];
      if (!p || p.title === t.name) return null;
      return { updateSheetProperties: { properties: { sheetId: p.sheetId, title: t.name }, fields: "title" } };
    })
    .filter(Boolean);
  if (renameRequests.length > 0) {
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ requests: renameRequests }),
    });
  }

  const targets = tabs.map((t) => t.name);

  for (const title of targets) {
    const range = `'${title.replace(/'/g, "''")}'!A1:Z5000`;
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:clear`, {
      method: "POST",
      headers: auth,
      body: "{}",
    });
  }

  const values = tabs.map((t, i) => ({
    range: `'${targets[i].replace(/'/g, "''")}'!A1`,
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

  try {
    const formatRequests: unknown[] = [];
    tabs.forEach((tab, i) => {
      const sheetId = existingProps[i]?.sheetId;
      if (sheetId === undefined) return;
      const lastCol = Math.max(1, (tab.rows[0] || []).length);
      for (const row of tab.sectionRows) {
        formatRequests.push({
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: row,
              endRowIndex: row + 1,
              startColumnIndex: 0,
              endColumnIndex: lastCol,
            },
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true, foregroundColor: { red: 0.12, green: 0.23, blue: 0.54 } },
                backgroundColor: { red: 0.93, green: 0.95, blue: 1 },
              },
            },
            fields: "userEnteredFormat.textFormat,userEnteredFormat.backgroundColor",
          },
        });
      }
    });
    if (formatRequests.length > 0) {
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ requests: formatRequests }),
      });
    }
  } catch {
    // La categoría ya quedó como dato; el formato es visual.
  }

  return { url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`, spreadsheetId };
}

export async function createComparisonSheet(data: CompareResult): Promise<{ url: string; spreadsheetId: string }> {
  const sa = await getServiceAccount();
  if (!sa) throw new Error("google-service-account-not-configured");
  const token = await getAccessToken(sa);
  const auth = { Authorization: "Bearer " + token, "Content-Type": "application/json" };
  const tabs = buildReportTabs(data);
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
