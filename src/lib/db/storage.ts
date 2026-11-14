import "server-only";

import { asRole, asSystem, type RequestRole, type Row } from "./engine";
import { isDemoMode } from "./mode";
import { demoQuotaError } from "./storage-quota";

/**
 * Supabase Storage'ın kullanılan iki işi: bir bucket'a dosya yüklemek ve
 * herkese açık bucket'taki dosyayı sunmak. Dosyalar `storage.objects`
 * tablosunda tutulur; yükleme yetkisini o tablonun RLS politikaları belirler.
 */

export type StorageResponse = { status: number; body: BodyInit | null; headers: Record<string, string> };

function json(status: number, body: unknown): StorageResponse {
  return { status, body: JSON.stringify(body), headers: { "content-type": "application/json" } };
}

function storageError(status: number, error: string, message: string): StorageResponse {
  return json(status, { statusCode: String(status), error, message });
}

const OBJECT_NAME = /^[A-Za-z0-9._\-/]{1,300}$/;

async function readUpload(request: Request): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const type = request.headers.get("content-type") ?? "";
  if (type.startsWith("multipart/form-data")) {
    const form = await request.formData();
    for (const value of form.values()) {
      if (value instanceof Blob) {
        return { bytes: new Uint8Array(await value.arrayBuffer()), contentType: value.type || "application/octet-stream" };
      }
    }
    return null;
  }
  return { bytes: new Uint8Array(await request.arrayBuffer()), contentType: type || "application/octet-stream" };
}

export async function handleUpload(
  request: Request,
  bucket: string,
  name: string,
  role: RequestRole,
  claims: Row,
): Promise<StorageResponse> {
  if (!OBJECT_NAME.test(name) || name.includes("..")) return storageError(400, "InvalidKey", "Geçersiz dosya adı");

  const config = await asSystem(async (tx) => {
    const { rows } = await tx.query<{ file_size_limit: string | null; allowed_mime_types: string[] | null }>(
      "select file_size_limit, allowed_mime_types from storage.buckets where id = $1",
      [bucket],
    );
    return rows[0] ?? null;
  });
  if (!config) return storageError(404, "Bucket not found", "Bucket bulunamadı");

  const upload = await readUpload(request);
  if (!upload) return storageError(400, "InvalidRequest", "Dosya bulunamadı");
  if (config.file_size_limit !== null && upload.bytes.byteLength > Number(config.file_size_limit)) {
    return storageError(413, "Payload too large", "Dosya bucket sınırını aşıyor");
  }
  if (config.allowed_mime_types && !config.allowed_mime_types.includes(upload.contentType)) {
    return storageError(415, "invalid_mime_type", "Bu dosya türü kabul edilmiyor");
  }

  const upsert = request.headers.get("x-upsert") === "true";
  try {
    const result = await asRole(role, claims, async (tx) => {
      // Demo modunda toplam depolama sınırlıdır; sayım ve ekleme aynı transaction'da.
      if (isDemoMode()) {
        const { rows: usageRows } = await tx.query<{ count: number; bytes: string }>(
          "select count(*)::int as count, coalesce(sum(octet_length(content)), 0)::text as bytes from storage.objects",
        );
        const { rows: existing } = await tx.query<{ size: number }>(
          "select octet_length(content)::int as size from storage.objects where bucket_id = $1 and name = $2",
          [bucket, name],
        );
        const quotaMessage = demoQuotaError(
          { count: usageRows[0].count, bytes: Number(usageRows[0].bytes) },
          upload.bytes.byteLength,
          upsert && existing[0] ? existing[0].size : null,
        );
        if (quotaMessage) return { ok: false as const, quotaMessage };
      }

      const { rows } = await tx.query<{ id: string }>(
        `insert into storage.objects (bucket_id, name, owner, metadata, content)
         values ($1, $2, nullif($3, '')::uuid, jsonb_build_object('mimetype', $4::text, 'size', $5::int), decode($6, 'base64'))
         ${upsert ? "on conflict (bucket_id, name) do update set content = excluded.content, metadata = excluded.metadata, updated_at = now()" : ""}
         returning id`,
        [
          bucket,
          name,
          typeof claims.sub === "string" ? claims.sub : "",
          upload.contentType,
          upload.bytes.byteLength,
          Buffer.from(upload.bytes).toString("base64"),
        ],
      );
      return { ok: true as const, id: rows[0].id };
    });
    if (!result.ok) return storageError(413, "Payload too large", result.quotaMessage);
    return json(200, { Key: `${bucket}/${name}`, Id: result.id });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "42501") return storageError(403, "Unauthorized", "new row violates row-level security policy");
    if (code === "23505") return storageError(409, "Duplicate", "The resource already exists");
    console.error("Dosya yüklenemedi:", error);
    return storageError(500, "InternalError", "Dosya yüklenemedi");
  }
}

/** Dosyaları siler (supabase-js `remove`); hangi dosyaların silinebileceğini RLS belirler. */
export async function handleRemove(
  bucket: string,
  names: unknown,
  role: RequestRole,
  claims: Row,
): Promise<StorageResponse> {
  if (
    !Array.isArray(names) ||
    names.length === 0 ||
    names.length > 100 ||
    !names.every((name) => typeof name === "string" && OBJECT_NAME.test(name) && !name.includes(".."))
  ) {
    return storageError(400, "InvalidKey", "Geçersiz dosya adı");
  }

  try {
    const removed = await asRole(role, claims, async (tx) => {
      const { rows } = await tx.query<{ name: string }>(
        "delete from storage.objects where bucket_id = $1 and name = any($2::text[]) returning name",
        [bucket, names],
      );
      return rows;
    });
    return json(200, removed);
  } catch (error) {
    console.error("Dosya silinemedi:", error);
    return storageError(500, "InternalError", "Dosya silinemedi");
  }
}

export async function handlePublicObject(bucket: string, name: string): Promise<StorageResponse> {
  if (!OBJECT_NAME.test(name)) return storageError(400, "InvalidKey", "Geçersiz dosya adı");

  const object = await asSystem(async (tx) => {
    const { rows } = await tx.query<{ mimetype: string | null; content: string }>(
      `select o.metadata ->> 'mimetype' as mimetype, encode(o.content, 'base64') as content
         from storage.objects o
         join storage.buckets b on b.id = o.bucket_id
        where b.public and o.bucket_id = $1 and o.name = $2`,
      [bucket, name],
    );
    return rows[0] ?? null;
  });
  if (!object) return storageError(404, "not_found", "Object not found");

  return {
    status: 200,
    body: Buffer.from(object.content, "base64"),
    headers: {
      "content-type": object.mimetype ?? "application/octet-stream",
      "cache-control": "public, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  };
}
