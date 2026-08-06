"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAppUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

/**
 * Reçete ve hammadde yazma işlemleri.
 *
 * Yetki kontrolü burada TEKRARLANMIYOR: RLS politikaları `is_manager()`
 * kısıtını zaten uyguluyor. Buradaki `requireAppUser()` çağrısı yetki için
 * değil, `tenant_id`'yi almak için — o değeri kullanıcıdan gelen forma
 * asla güvenmeden, doğrulanmış oturumdan okuyoruz.
 */

export type ActionState = { error?: string; ok?: boolean };

const unitSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-zçğıöşü]{1,16}$/, "Birim yalnızca küçük harf olmalı (kg, g, lt, ml, adet, koli…)");

const positive = z.coerce.number().positive("Sıfırdan büyük olmalı");

function fail(error: unknown): ActionState {
  if (error instanceof z.ZodError) {
    return { error: error.issues[0]?.message ?? "Girdi geçersiz." };
  }
  if (error instanceof Error) return { error: error.message };
  return { error: "Beklenmeyen bir hata oluştu." };
}

// -----------------------------------------------------------------------------
// Hammaddeler
// -----------------------------------------------------------------------------

const ingredientSchema = z.object({
  name: z.string().trim().min(1, "Ad gerekli").max(120),
  baseUnit: unitSchema,
  costPerBaseUnit: z.coerce.number().min(0, "Maliyet negatif olamaz"),
});

export async function createIngredient(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const input = ingredientSchema.parse({
      name: formData.get("name"),
      baseUnit: formData.get("baseUnit"),
      costPerBaseUnit: formData.get("costPerBaseUnit"),
    });

    const user = await requireAppUser();
    const supabase = await createClient();

    const { error } = await supabase.from("inventory_items").insert({
      tenant_id: user.tenantId,
      name: input.name,
      base_unit: input.baseUnit,
      cost_per_base_unit: input.costPerBaseUnit,
    });

    if (error) {
      return {
        error:
          error.code === "23505"
            ? "Bu adda bir hammadde zaten var."
            : error.message,
      };
    }
  } catch (error) {
    return fail(error);
  }

  revalidatePath("/recipes/malzemeler");
  return { ok: true };
}

export async function updateIngredient(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const id = z.uuid().parse(formData.get("id"));
    const input = ingredientSchema.parse({
      name: formData.get("name"),
      baseUnit: formData.get("baseUnit"),
      costPerBaseUnit: formData.get("costPerBaseUnit"),
    });

    const supabase = await createClient();
    const { error } = await supabase
      .from("inventory_items")
      .update({
        name: input.name,
        base_unit: input.baseUnit,
        cost_per_base_unit: input.costPerBaseUnit,
      })
      .eq("id", id);

    if (error) return { error: error.message };
  } catch (error) {
    return fail(error);
  }

  revalidatePath("/recipes/malzemeler");
  revalidatePath("/recipes");
  return { ok: true };
}

const conversionSchema = z
  .object({
    inventoryItemId: z.uuid(),
    fromUnit: unitSchema,
    toUnit: unitSchema,
    factor: positive,
  })
  .refine((v) => v.fromUnit !== v.toUnit, {
    message: "Bir birim kendisine dönüştürülemez",
  });

export async function addConversion(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const input = conversionSchema.parse({
      inventoryItemId: formData.get("inventoryItemId"),
      fromUnit: formData.get("fromUnit"),
      toUnit: formData.get("toUnit"),
      factor: formData.get("factor"),
    });

    const user = await requireAppUser();
    const supabase = await createClient();

    const { error } = await supabase.from("item_unit_conversions").insert({
      tenant_id: user.tenantId,
      inventory_item_id: input.inventoryItemId,
      from_unit: input.fromUnit,
      to_unit: input.toUnit,
      factor: input.factor,
    });

    if (error) {
      return {
        error:
          error.code === "23505"
            ? "Bu dönüşüm zaten tanımlı."
            : error.message,
      };
    }
  } catch (error) {
    return fail(error);
  }

  revalidatePath("/recipes/malzemeler");
  revalidatePath("/recipes");
  return { ok: true };
}

export async function deleteConversion(formData: FormData) {
  const id = z.uuid().parse(formData.get("id"));
  const supabase = await createClient();
  await supabase.from("item_unit_conversions").delete().eq("id", id);
  revalidatePath("/recipes/malzemeler");
  revalidatePath("/recipes");
}

// -----------------------------------------------------------------------------
// Reçeteler
// -----------------------------------------------------------------------------

const newRecipeSchema = z.object({
  name: z.string().trim().min(1, "Ad gerekli").max(120),
  yieldQuantity: positive,
  yieldUnit: unitSchema,
  kind: z.enum(["sold", "sub"]),
  menuItemId: z.string().trim().optional(),
  newMenuItemName: z.string().trim().max(120).optional(),
  newMenuItemPrice: z.coerce.number().min(0).optional(),
  categoryName: z.string().trim().max(80).optional(),
});

export async function createRecipe(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let recipeId: string;

  try {
    const input = newRecipeSchema.parse({
      name: formData.get("name"),
      yieldQuantity: formData.get("yieldQuantity"),
      yieldUnit: formData.get("yieldUnit"),
      kind: formData.get("kind"),
      menuItemId: formData.get("menuItemId") || undefined,
      newMenuItemName: formData.get("newMenuItemName") || undefined,
      newMenuItemPrice: formData.get("newMenuItemPrice") || undefined,
      categoryName: formData.get("categoryName") || undefined,
    });

    const user = await requireAppUser();
    const supabase = await createClient();

    let menuItemId: string | null = null;

    if (input.kind === "sold") {
      if (input.menuItemId) {
        menuItemId = input.menuItemId;
      } else {
        const itemName = input.newMenuItemName?.trim();
        if (!itemName) {
          return { error: "Menü ürünü seçin veya yeni bir ad girin." };
        }

        // Kategori: varsa bul, yoksa oluştur. Kullanıcıyı ayrı bir ekrana
        // göndermemek için — reçete girmek isteyen biri kategori yönetmek
        // zorunda kalmamalı.
        let categoryId: string | null = null;
        const categoryName = input.categoryName?.trim() || "Genel";

        const { data: existingCategory } = await supabase
          .from("categories")
          .select("id")
          .eq("name", categoryName)
          .maybeSingle();

        if (existingCategory) {
          categoryId = existingCategory.id;
        } else {
          const { data: created, error } = await supabase
            .from("categories")
            .insert({ tenant_id: user.tenantId, name: categoryName })
            .select("id")
            .single();
          if (error) return { error: error.message };
          categoryId = created.id;
        }

        const { data: createdItem, error: itemError } = await supabase
          .from("menu_items")
          .insert({
            tenant_id: user.tenantId,
            category_id: categoryId,
            name: itemName,
          })
          .select("id")
          .single();

        if (itemError) {
          return {
            error:
              itemError.code === "23505"
                ? "Bu adda bir menü ürünü zaten var."
                : itemError.message,
          };
        }

        menuItemId = createdItem.id;

        if (input.newMenuItemPrice !== undefined) {
          const { error: priceError } = await supabase.from("menu_prices").insert({
            tenant_id: user.tenantId,
            menu_item_id: menuItemId,
            price: input.newMenuItemPrice,
          });
          // Fiyat yazılamazsa (patron değilse) reçete yine de oluşsun;
          // fiyatı sonra patron girer.
          if (priceError && priceError.code !== "42501") {
            return { error: priceError.message };
          }
        }
      }
    }

    const { data: recipe, error: recipeError } = await supabase
      .from("recipes")
      .insert({ tenant_id: user.tenantId, name: input.name, menu_item_id: menuItemId })
      .select("id")
      .single();

    if (recipeError) {
      return {
        error:
          recipeError.code === "23505"
            ? "Bu adda bir reçete zaten var."
            : recipeError.message,
      };
    }

    const { error: versionError } = await supabase.from("recipe_versions").insert({
      tenant_id: user.tenantId,
      recipe_id: recipe.id,
      version_no: 1,
      yield_quantity: input.yieldQuantity,
      yield_unit: input.yieldUnit,
    });

    if (versionError) return { error: versionError.message };

    recipeId = recipe.id;
  } catch (error) {
    return fail(error);
  }

  revalidatePath("/recipes");
  redirect(`/recipes/${recipeId}/duzenle`);
}

const lineSchema = z
  .object({
    versionId: z.uuid(),
    componentType: z.enum(["ingredient", "sub_recipe"]),
    componentId: z.uuid("Malzeme seçin"),
    quantity: positive,
    unit: unitSchema,
    wastePercent: z.coerce
      .number()
      .min(0, "Fire negatif olamaz")
      .lt(100, "Fire %100 olamaz — sonsuz hammadde anlamına gelir"),
  })
  .strict();

export async function addRecipeLine(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const input = lineSchema.parse({
      versionId: formData.get("versionId"),
      componentType: formData.get("componentType"),
      componentId: formData.get("componentId"),
      quantity: formData.get("quantity"),
      unit: formData.get("unit"),
      wastePercent: formData.get("wastePercent") || 0,
    });

    const user = await requireAppUser();
    const supabase = await createClient();

    const { data: existing } = await supabase
      .from("recipe_lines")
      .select("line_no")
      .eq("recipe_version_id", input.versionId)
      .order("line_no", { ascending: false })
      .limit(1);

    const nextLineNo = (existing?.[0]?.line_no ?? 0) + 1;

    const { error } = await supabase.from("recipe_lines").insert({
      tenant_id: user.tenantId,
      recipe_version_id: input.versionId,
      line_no: nextLineNo,
      component_type: input.componentType,
      inventory_item_id:
        input.componentType === "ingredient" ? input.componentId : null,
      sub_recipe_id:
        input.componentType === "sub_recipe" ? input.componentId : null,
      quantity: input.quantity,
      unit: input.unit,
      waste_percent: input.wastePercent,
    });

    // Döngü ve dondurma korumaları veritabanından geliyor; mesajları
    // olduğu gibi gösteriyoruz çünkü zaten Türkçe ve açıklayıcılar.
    if (error) return { error: error.message };
  } catch (error) {
    return fail(error);
  }

  revalidatePath("/recipes", "layout");
  return { ok: true };
}

export async function deleteRecipeLine(formData: FormData) {
  const id = z.uuid().parse(formData.get("id"));
  const supabase = await createClient();
  const { error } = await supabase.from("recipe_lines").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/recipes", "layout");
}

export async function publishVersion(formData: FormData) {
  const versionId = z.uuid().parse(formData.get("versionId"));
  const supabase = await createClient();

  const { error } = await supabase
    .from("recipe_versions")
    .update({ status: "active" })
    .eq("id", versionId);

  if (error) throw new Error(error.message);
  revalidatePath("/recipes", "layout");
}

/**
 * Yayınlanmış bir reçeteyi düzenlemek için yeni taslak versiyon açar ve
 * mevcut satırları kopyalar.
 *
 * Aktif versiyon dondurulmuş olduğu için düzenlemenin tek yolu bu. Satırları
 * elle yeniden girmek zorunda bırakmamak için kopyalıyoruz.
 */
export async function createDraftVersion(formData: FormData) {
  const recipeId = z.uuid().parse(formData.get("recipeId"));

  const user = await requireAppUser();
  const supabase = await createClient();

  const { data: versions, error: versionsError } = await supabase
    .from("recipe_versions")
    .select("id, version_no, status, yield_quantity, yield_unit")
    .eq("recipe_id", recipeId)
    .order("version_no", { ascending: false });

  if (versionsError) throw new Error(versionsError.message);

  const existingDraft = versions?.find((v) => v.status === "draft");
  if (existingDraft) {
    redirect(`/recipes/${recipeId}/duzenle`);
  }

  const latest = versions?.[0];
  if (!latest) throw new Error("Kopyalanacak versiyon bulunamadı.");

  const { data: draft, error: draftError } = await supabase
    .from("recipe_versions")
    .insert({
      tenant_id: user.tenantId,
      recipe_id: recipeId,
      version_no: latest.version_no + 1,
      yield_quantity: latest.yield_quantity,
      yield_unit: latest.yield_unit,
    })
    .select("id")
    .single();

  if (draftError) throw new Error(draftError.message);

  const { data: sourceLines } = await supabase
    .from("recipe_lines")
    .select("line_no, component_type, inventory_item_id, sub_recipe_id, quantity, unit, waste_percent")
    .eq("recipe_version_id", latest.id)
    .order("line_no");

  if (sourceLines && sourceLines.length > 0) {
    const { error: copyError } = await supabase.from("recipe_lines").insert(
      sourceLines.map((line) => ({
        tenant_id: user.tenantId,
        recipe_version_id: draft.id,
        line_no: line.line_no,
        component_type: line.component_type,
        inventory_item_id: line.inventory_item_id,
        sub_recipe_id: line.sub_recipe_id,
        quantity: line.quantity,
        unit: line.unit,
        waste_percent: line.waste_percent,
      })),
    );
    if (copyError) throw new Error(copyError.message);
  }

  revalidatePath("/recipes", "layout");
  redirect(`/recipes/${recipeId}/duzenle`);
}

// -----------------------------------------------------------------------------
// Ürün görseli
// -----------------------------------------------------------------------------

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Menü ürününe görsel yükler (POS ızgarası + QR menü ikisi de gösteriyor).
 *
 * Storage RLS zaten `is_manager()` istiyor (bkz. migration 0014) — buradaki
 * kontrol yetki için değil, RLS'in reddettiği bir yüklemeyi anlaşılır bir
 * hataya çevirmek için (aksi hâlde kullanıcı yalnızca "storage error" görür).
 * Yol `${tenantId}/${menuItemId}.${ext}` — `upsert: true` ile eski görseli
 * SESSİZCE değiştiriyor, ayrı bir "önce sil" adımına gerek yok.
 */
export async function uploadMenuItemImage(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const menuItemId = z.uuid().parse(formData.get("menuItemId"));
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { error: "Bir görsel seç." };
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return { error: "Görsel 5 MB'tan büyük olamaz." };
    }
    const ext = ALLOWED_IMAGE_TYPES[file.type];
    if (!ext) {
      return { error: "Yalnızca JPEG, PNG veya WEBP kabul edilir." };
    }

    const user = await requireAppUser();
    if (user.role !== "owner" && user.role !== "manager") {
      return { error: "Bu işlem için müdür/patron yetkisi gerekli." };
    }
    const supabase = await createClient();

    const path = `${user.tenantId}/${menuItemId}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("menu-images")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) return { error: uploadError.message };

    const { data: publicUrlData } = supabase.storage.from("menu-images").getPublicUrl(path);
    // Aynı yola tekrar yüklense de public URL DEĞİŞMEZ (CDN önbelleği eski
    // görseli gösterebilir) — sorgu string'ine zaman damgası ekleyerek
    // önbelleği kırıyoruz.
    const cacheBustedUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

    const { error: updateError } = await supabase
      .from("menu_items")
      .update({ image_url: cacheBustedUrl })
      .eq("id", menuItemId);
    if (updateError) return { error: updateError.message };
  } catch (error) {
    return fail(error);
  }

  revalidatePath("/recipes", "layout");
  revalidatePath("/pos", "layout");
  return { ok: true };
}

/** Menü ürününün görselini kaldırır — dosyayı silmiyor, yalnızca bağlantıyı kesiyor. */
export async function removeMenuItemImage(formData: FormData) {
  const menuItemId = z.uuid().parse(formData.get("menuItemId"));
  const supabase = await createClient();

  const { error } = await supabase
    .from("menu_items")
    .update({ image_url: null })
    .eq("id", menuItemId);
  if (error) throw new Error(error.message);

  revalidatePath("/recipes", "layout");
  revalidatePath("/pos", "layout");
}
