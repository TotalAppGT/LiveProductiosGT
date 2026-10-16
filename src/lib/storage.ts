import { AwsClient } from "aws4fetch";
import { prisma } from "@/lib/prisma";

// Almacenamiento de archivos (documentos de compras, fotos) en Cloudflare R2.
// Config (por variables de entorno o por la tabla SystemConfig):
//   r2_account_id, r2_access_key_id, r2_secret_access_key, r2_bucket, r2_public_url
// El bucket es privado: los archivos se sirven por el proxy /api/files/<key>.
// Sólo se permiten claves con el prefijo PREFIX (evita exponer el resto del bucket).

const PREFIX = "liveproductions";

interface R2Config {
  account: string;
  access: string;
  secret: string;
  bucket: string;
  publicUrl: string;
}

let cached: R2Config | null | undefined;

async function getConfig(): Promise<R2Config | null> {
  if (cached !== undefined) return cached;
  const env = {
    account: process.env.R2_ACCOUNT_ID,
    access: process.env.R2_ACCESS_KEY_ID,
    secret: process.env.R2_SECRET_ACCESS_KEY,
    bucket: process.env.R2_BUCKET,
    publicUrl: process.env.R2_PUBLIC_URL || "",
  };
  if (env.account && env.access && env.secret && env.bucket) {
    cached = env as R2Config;
    return cached;
  }
  try {
    const rows = await prisma.systemConfig.findMany({
      where: { key: { in: ["r2_account_id", "r2_access_key_id", "r2_secret_access_key", "r2_bucket", "r2_public_url"] } },
    });
    const m: Record<string, string> = {};
    for (const r of rows) m[r.key] = r.value;
    if (m.r2_account_id && m.r2_access_key_id && m.r2_secret_access_key && m.r2_bucket) {
      cached = { account: m.r2_account_id, access: m.r2_access_key_id, secret: m.r2_secret_access_key, bucket: m.r2_bucket, publicUrl: m.r2_public_url || "" };
      return cached;
    }
  } catch {
    // sin config
  }
  cached = null;
  return null;
}

export async function storageConfigured(): Promise<boolean> {
  return !!(await getConfig());
}

function client(cfg: R2Config) {
  return new AwsClient({ accessKeyId: cfg.access, secretAccessKey: cfg.secret, service: "s3", region: "auto" });
}

// Sube un archivo al bucket (bajo el prefijo) y devuelve la URL (proxy o pública).
export async function uploadFile(buf: Buffer, key: string, contentType: string): Promise<{ url: string; size: number }> {
  const cfg = await getConfig();
  if (!cfg) throw new Error("storage-not-configured");
  const fullKey = `${PREFIX}/${key.replace(/^\/+/, "")}`;
  const endpoint = `https://${cfg.account}.r2.cloudflarestorage.com/${cfg.bucket}/${fullKey}`;
  const res = await client(cfg).fetch(endpoint, {
    method: "PUT",
    body: new Uint8Array(buf) as unknown as BodyInit,
    headers: { "Content-Type": contentType },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`R2 upload failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  const url = cfg.publicUrl ? `${cfg.publicUrl.replace(/\/$/, "")}/${fullKey}` : `/api/files/${fullKey}`;
  return { url, size: buf.length };
}

// Descarga un objeto del bucket (para el proxy). Sólo claves con el prefijo.
export async function getObject(fullKey: string): Promise<{ body: ArrayBuffer; contentType: string } | null> {
  if (!fullKey.startsWith(`${PREFIX}/`)) return null;
  const cfg = await getConfig();
  if (!cfg) return null;
  const endpoint = `https://${cfg.account}.r2.cloudflarestorage.com/${cfg.bucket}/${fullKey}`;
  const res = await client(cfg).fetch(endpoint);
  if (!res.ok) return null;
  return { body: await res.arrayBuffer(), contentType: res.headers.get("content-type") || "application/octet-stream" };
}

// Genera una clave única y "segura".
export function buildKey(prefix: string, fileName: string): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}/${Date.now()}-${rand}-${safe}`;
}
