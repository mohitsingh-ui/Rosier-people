import "server-only";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { hmac, randomToken, safeEqual } from "@/lib/crypto";

// Private object storage. Files are never in /public; they are served only through
// short-lived signed URLs issued after a server-side permission check.

export interface StorageDriver {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
  signedUrl(key: string, opts: { fileName: string; contentType: string; disposition: "inline" | "attachment"; ttlSeconds: number }): Promise<string>;
}

const ROOT = path.resolve(process.cwd(), "storage");
const safePath = (key: string) => {
  const p = path.resolve(ROOT, key);
  if (!p.startsWith(ROOT + path.sep)) throw new Error("Invalid storage key");
  return p;
};

const local: StorageDriver = {
  async put(key, body) {
    const p = safePath(key);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, body);
  },
  get: (key) => readFile(safePath(key)),
  async remove(key) { await unlink(safePath(key)).catch(() => {}); },
  async signedUrl(key, o) {
    const exp = Math.floor(Date.now() / 1000) + o.ttlSeconds;
    const payload = Buffer.from(JSON.stringify({ k: key, n: o.fileName, t: o.contentType, d: o.disposition, e: exp })).toString("base64url");
    return `/api/files/${payload}.${hmac(payload)}`;
  },
};

/** Validates a local signed token. Returns the file descriptor or null. */
export function verifyFileToken(token: string) {
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !safeEqual(hmac(payload), sig)) return null;
  const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { k: string; n: string; t: string; d: "inline" | "attachment"; e: number };
  if (data.e < Date.now() / 1000) return null;
  return data;
}

let s3Driver: StorageDriver | null = null;
async function s3(): Promise<StorageDriver> {
  if (s3Driver) return s3Driver;
  const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  const client = new S3Client({
    region: process.env.S3_REGION,
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: !!process.env.S3_ENDPOINT,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! },
  });
  const Bucket = process.env.S3_BUCKET!;
  s3Driver = {
    async put(key, body, contentType) { await client.send(new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType, ServerSideEncryption: "AES256" })); },
    async get(key) {
      const r = await client.send(new GetObjectCommand({ Bucket, Key: key }));
      return Buffer.from(await r.Body!.transformToByteArray());
    },
    async remove(key) { await client.send(new DeleteObjectCommand({ Bucket, Key: key })); },
    signedUrl: (key, o) =>
      getSignedUrl(client, new GetObjectCommand({ Bucket, Key: key, ResponseContentType: o.contentType, ResponseContentDisposition: `${o.disposition}; filename="${o.fileName.replace(/"/g, "")}"` }), { expiresIn: o.ttlSeconds }),
  };
  return s3Driver;
}

export async function storage(): Promise<StorageDriver> {
  return process.env.STORAGE_DRIVER === "s3" ? s3() : local;
}

export const ALLOWED_MIME = new Set([
  "application/pdf", "image/png", "image/jpeg", "image/webp", "image/heic",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/csv",
]);
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Validates and stores an uploaded File. Returns metadata for a DocumentVersion. */
export async function storeUpload(file: File, folder: string) {
  if (!file || file.size === 0) throw new Error("Choose a file to upload.");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("Files must be 10 MB or smaller.");
  const type = file.type || "application/octet-stream";
  if (!ALLOWED_MIME.has(type)) throw new Error("Upload a PDF, image, Word or Excel file.");
  const body = Buffer.from(await file.arrayBuffer());
  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  const key = `${folder}/${Date.now()}-${randomToken(9)}.${ext}`;
  await (await storage()).put(key, body, type);
  return { storageKey: key, fileName: file.name.slice(0, 200), mimeType: type, size: file.size, checksum: createHash("sha256").update(body).digest("hex") };
}

export async function storeBuffer(body: Buffer, folder: string, fileName: string, contentType: string) {
  const key = `${folder}/${Date.now()}-${randomToken(9)}-${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  await (await storage()).put(key, body, contentType);
  return { storageKey: key, fileName, mimeType: contentType, size: body.length, checksum: createHash("sha256").update(body).digest("hex") };
}

export async function fileUrl(key: string, fileName: string, contentType: string, disposition: "inline" | "attachment" = "inline") {
  return (await storage()).signedUrl(key, { fileName, contentType, disposition, ttlSeconds: 300 });
}
