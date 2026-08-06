-- =============================================================================
-- 0014 · Menü ürün görseli
-- =============================================================================
-- Dokunmatik ekranda ürün tanıma büyük ölçüde görsele dayanır — rakiplerin
-- çoğunda POS ızgarasında fotoğraf var, bizde yalnızca isim vardı. Görsel
-- HERKESE açık bir bucket'ta (`menu-images`): hem personel POS'u hem QR
-- self-servis sayfası (`/siparis/masa/[qrToken]`, oturumsuz) aynı görseli
-- göstermeli, ikisi için ayrı imzalı URL üretmek gereksiz karmaşıklık.
-- Ürünün ADI/fiyatı gibi ticari sır değil; sızıntı riski yok.
--
-- Yol kuralı `${tenant_id}/${menu_item_id}.${ext}` — `storage.foldername`
-- ile klasörün tenant'a ait olduğunu policy'de doğrulayabilmek için.
-- =============================================================================

alter table public.menu_items
  add column image_url text;

insert into storage.buckets (id, name, public)
values ('menu-images', 'menu-images', true)
on conflict (id) do nothing;

create policy menu_images_public_read on storage.objects
  for select to public
  using (bucket_id = 'menu-images');

create policy menu_images_manager_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'menu-images'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
    and public.is_manager()
  );

create policy menu_images_manager_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'menu-images'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
    and public.is_manager()
  )
  with check (
    bucket_id = 'menu-images'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
    and public.is_manager()
  );

create policy menu_images_manager_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'menu-images'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
    and public.is_manager()
  );
