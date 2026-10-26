import { handleDbRequest } from "@/lib/db/handler";
import { isDemoMode } from "@/lib/db/mode";

/**
 * Herkese açık dosyalar (menü görselleri) her modda buradan sunulur. Veritabanı
 * API'si ise yalnızca yerel Postgres modunda açıktır (e2e ve yük testi için);
 * orada da her istek RLS'ten geçer. Demo dağıtımında dışarıya kapalıdır.
 */
async function handle(request: Request): Promise<Response> {
  const { pathname } = new URL(request.url);
  const isPublicFile = pathname.startsWith("/api/db/storage/v1/object/public/") && request.method === "GET";
  if (!isPublicFile && isDemoMode()) {
    return new Response("Not found", { status: 404 });
  }
  return handleDbRequest(request);
}

export { handle as GET, handle as POST, handle as PATCH, handle as DELETE, handle as PUT, handle as HEAD };
