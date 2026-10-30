-- Depo görevlisi stok ekranının asıl kullanıcısı, ama hammadde okuma kuralı onu
-- dışarıda bırakıyordu: ekranda bakiye tablosu boş, hareketlerde "Bilinmeyen ürün"
-- görünüyordu. Stok okuma yetkisi olan herkes hammaddeyi ve birim dönüşümlerini de
-- görür. Garson ve kasiyer bu yetkide yok; hammadde maliyetini görmemeye devam ederler.
drop policy inventory_items_select on public.inventory_items;
create policy inventory_items_select on public.inventory_items
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.can_read_stock());

drop policy item_unit_conversions_select on public.item_unit_conversions;
create policy item_unit_conversions_select on public.item_unit_conversions
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.can_read_stock());
