import { AwsClient } from "aws4fetch";

// Almacenamiento de archivos (documentos de compras, fotos).
// Usa Cloudflare R2 (S3-compatible) si está configurado por variables de entorno:
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL
// Si no está configurado, `uploadFile` lanza "storage-not-configured" y quien
// llama puede usar el respaldo (guardar como data URL en la base).

const ACCOUNT = process.env.R2_ACCOUNT_ID;
const ACCESS = process.env.R2_ACCESS_KEY_ID;
const SECRET = process.env.R2_SECRET_ACCESS_KEY;
const BUCKET = process.env.R2_BUCKET;
const PUBLIC = process.env.R2_PUBLIC_URL;

export function storageConfigured(): boolean {
  return !!(ACCOUNT && ACCESS && SECRET && BUCKET && PUBLIC);
}

// Sube un archivo al bucket y devuelve su URL pública.
export async function uploadFile(buf: Buffer, key: string, contentType: string): Promise<{ url: string; size: number }> {
  if (!storageConfigured()) throw new Error("storage-not-configured");
  const client = new AwsClient({ accessKeyId: ACCESS!, secretAccessKey: SECRET! });
  const endpoint = `https://${ACCOUNT}.r2.cloudflarestorage.com/${BUCKET}/${key}`;
  const res = await client.fetch(endpoint, {
    method: "PUT",
    body: new Uint8Array(buf) as unknown as BodyInit,
    headers: { "Content-Type": contentType },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`R2 upload failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  const base = PUBLIC!.replace(/\/$/, "");
  return { url: `${base}/${key}`, size: buf.length };
}

// Genera una clave única y "segura" para el objeto.
export function buildKey(prefix: string, fileName: string): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}/${Date.now()}-${rand}-${safe}`;
}
