import type { Metadata } from "next";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";

import { NewRecipeForm } from "./new-recipe-form";

export const metadata: Metadata = { title: "Yeni reçete" };

export default async function NewRecipePage() {
  const supabase = await createClient();

  const [menuItemsResult, recipesResult] = await Promise.all([
    supabase.from("menu_items").select("id, name").eq("is_active", true).order("name"),
    supabase.from("recipes").select("menu_item_id"),
  ]);

  // Bir menü ürününün en fazla bir reçetesi olabilir; zaten reçetesi
  // olanları seçenek olarak sunmuyoruz.
  const linked = new Set(
    (recipesResult.data ?? [])
      .map((r) => r.menu_item_id)
      .filter((id): id is string => id !== null),
  );

  const available = (menuItemsResult.data ?? []).filter((i) => !linked.has(i.id));

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/recipes" className="text-sm text-ink-muted hover:text-ink">
        ← Reçeteler
      </Link>

      <h1 className="mt-3 mb-6 text-2xl font-bold tracking-tight text-ink">
        Yeni reçete
      </h1>

      <div className="rounded-xl border border-line bg-surface-raised p-5">
        <NewRecipeForm availableMenuItems={available} />
      </div>
    </div>
  );
}
