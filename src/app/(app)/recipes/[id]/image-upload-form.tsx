"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/ui/form";
import { removeMenuItemImage, uploadMenuItemImage, type ActionState } from "@/lib/recipes/actions";

const initial: ActionState = {};

export function ImageUploadForm({ menuItemId, imageUrl }: { menuItemId: string; imageUrl: string | null }) {
  const [state, action] = useActionState(uploadMenuItemImage, initial);

  return (
    <section className="mt-6 rounded-xl border border-line bg-surface-raised p-5">
      <h2 className="mb-3 text-sm font-semibold text-ink">Ürün görseli</h2>
      <div className="flex items-start gap-4">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- kullanıcı yüklediği veri URI/CDN görseli, next/image optimizasyonu gereksiz
          <img
            src={imageUrl}
            alt=""
            className="h-24 w-24 shrink-0 rounded-lg border border-line object-cover"
          />
        ) : (
          <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-lg border border-dashed border-line text-xs text-ink-muted">
            Görsel yok
          </div>
        )}

        <div className="flex-1 space-y-2">
          <form action={action} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="menuItemId" value={menuItemId} />
            <input
              type="file"
              name="file"
              accept="image/jpeg,image/png,image/webp"
              required
              className="text-xs text-ink-muted file:mr-2 file:rounded-md file:border-0 file:bg-surface-sunken file:px-2.5 file:py-1.5 file:text-xs file:font-medium file:text-ink"
            />
            <SubmitButton>{imageUrl ? "Değiştir" : "Yükle"}</SubmitButton>
          </form>
          {state.error ? (
            <p role="alert" className="text-xs text-danger">
              {state.error}
            </p>
          ) : (
            <p className="text-xs text-ink-muted">JPEG, PNG veya WEBP · en fazla 5 MB.</p>
          )}
          {imageUrl ? (
            <form action={removeMenuItemImage}>
              <input type="hidden" name="menuItemId" value={menuItemId} />
              <button type="submit" className="text-xs text-danger hover:underline">
                Görseli kaldır
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </section>
  );
}
