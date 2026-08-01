-- =============================================================================
-- 0016 · RLS hijyeni: gereksiz çift SELECT politikası
-- =============================================================================
-- Supabase'in kendi güvenlik/performans denetçisi (get_advisors) 24 tabloda
-- "multiple permissive policies" uyarısı verdi: her tabloda hem `<tablo>_select`
-- (yalnızca SELECT) hem `<tablo>_write` (FOR ALL — yani SELECT dahil) politikası
-- var. Postgres, aynı komut için birden fazla PERMISSIVE politika varsa
-- HEPSİNİ ayrı ayrı değerlendirip OR'luyor — sonuç doğru ama her SELECT
-- sorgusu gereksiz yere iki politika çalıştırıyor.
--
-- Bu GÜVENLİK AÇIĞI DEĞİL (iki politika da doğru sonucu veriyor, sadece
-- fazladan iş yapılıyor) — ama bedavaya düzeltiliyor. `CREATE POLICY` tek
-- bir çağrıda birden fazla komut (`FOR INSERT, UPDATE, DELETE`) kabul
-- ETMİYOR (Postgres kısıtı) — o yüzden `_write` (FOR ALL) üç ayrı politikaya
-- bölünüyor: `_insert`, `_update`, `_delete`. Hiçbiri SELECT'e dokunmuyor,
-- davranış birebir aynı kalıyor.
-- =============================================================================

drop policy areas_write on public.areas;
create policy areas_insert on public.areas for insert to authenticated with check (tenant_id = public.current_tenant_id() and public.is_manager());
create policy areas_update on public.areas for update to authenticated using (tenant_id = public.current_tenant_id() and public.is_manager()) with check (tenant_id = public.current_tenant_id() and public.is_manager());
create policy areas_delete on public.areas for delete to authenticated using (tenant_id = public.current_tenant_id() and public.is_manager());

drop policy branches_write_owner on public.branches;
create policy branches_insert on public.branches for insert to authenticated with check (tenant_id = public.current_tenant_id() and public.is_owner());
create policy branches_update on public.branches for update to authenticated using (tenant_id = public.current_tenant_id() and public.is_owner()) with check (tenant_id = public.current_tenant_id() and public.is_owner());
create policy branches_delete on public.branches for delete to authenticated using (tenant_id = public.current_tenant_id() and public.is_owner());

drop policy cash_sessions_write on public.cash_sessions;
create policy cash_sessions_insert on public.cash_sessions for insert to authenticated with check (tenant_id = public.current_tenant_id() and (public.is_manager() or (public.current_app_role() = 'cashier' and branch_id = public.current_branch_id())));
create policy cash_sessions_update on public.cash_sessions for update to authenticated using (tenant_id = public.current_tenant_id() and (public.is_manager() or (public.current_app_role() = 'cashier' and branch_id = public.current_branch_id()))) with check (tenant_id = public.current_tenant_id() and (public.is_manager() or (public.current_app_role() = 'cashier' and branch_id = public.current_branch_id())));
create policy cash_sessions_delete on public.cash_sessions for delete to authenticated using (tenant_id = public.current_tenant_id() and (public.is_manager() or (public.current_app_role() = 'cashier' and branch_id = public.current_branch_id())));

drop policy categories_write on public.categories;
create policy categories_insert on public.categories for insert to authenticated with check (tenant_id = public.current_tenant_id() and public.is_manager());
create policy categories_update on public.categories for update to authenticated using (tenant_id = public.current_tenant_id() and public.is_manager()) with check (tenant_id = public.current_tenant_id() and public.is_manager());
create policy categories_delete on public.categories for delete to authenticated using (tenant_id = public.current_tenant_id() and public.is_manager());

drop policy inventory_items_write on public.inventory_items;
create policy inventory_items_insert on public.inventory_items for insert to authenticated with check (tenant_id = public.current_tenant_id() and public.is_manager());
create policy inventory_items_update on public.inventory_items for update to authenticated using (tenant_id = public.current_tenant_id() and public.is_manager()) with check (tenant_id = public.current_tenant_id() and public.is_manager());
create policy inventory_items_delete on public.inventory_items for delete to authenticated using (tenant_id = public.current_tenant_id() and public.is_manager());

drop policy item_unit_conversions_write on public.item_unit_conversions;
create policy item_unit_conversions_insert on public.item_unit_conversions for insert to authenticated with check (tenant_id = public.current_tenant_id() and public.is_manager());
create policy item_unit_conversions_update on public.item_unit_conversions for update to authenticated using (tenant_id = public.current_tenant_id() and public.is_manager()) with check (tenant_id = public.current_tenant_id() and public.is_manager());
create policy item_unit_conversions_delete on public.item_unit_conversions for delete to authenticated using (tenant_id = public.current_tenant_id() and public.is_manager());

drop policy memberships_write_owner on public.memberships;
create policy memberships_insert on public.memberships for insert to authenticated with check (tenant_id = public.current_tenant_id() and public.is_owner());
create policy memberships_update on public.memberships for update to authenticated using (tenant_id = public.current_tenant_id() and public.is_owner()) with check (tenant_id = public.current_tenant_id() and public.is_owner());
create policy memberships_delete on public.memberships for delete to authenticated using (tenant_id = public.current_tenant_id() and public.is_owner());

drop policy menu_items_write on public.menu_items;
create policy menu_items_insert on public.menu_items for insert to authenticated with check (tenant_id = public.current_tenant_id() and public.is_manager());
create policy menu_items_update on public.menu_items for update to authenticated using (tenant_id = public.current_tenant_id() and public.is_manager()) with check (tenant_id = public.current_tenant_id() and public.is_manager());
create policy menu_items_delete on public.menu_items for delete to authenticated using (tenant_id = public.current_tenant_id() and public.is_manager());

drop policy menu_prices_write on public.menu_prices;
create policy menu_prices_insert on public.menu_prices for insert to authenticated with check (tenant_id = public.current_tenant_id() and public.is_owner());
create policy menu_prices_update on public.menu_prices for update to authenticated using (tenant_id = public.current_tenant_id() and public.is_owner()) with check (tenant_id = public.current_tenant_id() and public.is_owner());
create policy menu_prices_delete on public.menu_prices for delete to authenticated using (tenant_id = public.current_tenant_id() and public.is_owner());

drop policy modifier_groups_write on public.modifier_groups;
create policy modifier_groups_insert on public.modifier_groups for insert to authenticated with check (tenant_id = public.current_tenant_id() and public.is_manager());
create policy modifier_groups_update on public.modifier_groups for update to authenticated using (tenant_id = public.current_tenant_id() and public.is_manager()) with check (tenant_id = public.current_tenant_id() and public.is_manager());
create policy modifier_groups_delete on public.modifier_groups for delete to authenticated using (tenant_id = public.current_tenant_id() and public.is_manager());

drop policy modifiers_write on public.modifiers;
create policy modifiers_insert on public.modifiers for insert to authenticated with check (tenant_id = public.current_tenant_id() and public.is_manager());
create policy modifiers_update on public.modifiers for update to authenticated using (tenant_id = public.current_tenant_id() and public.is_manager()) with check (tenant_id = public.current_tenant_id() and public.is_manager());
create policy modifiers_delete on public.modifiers for delete to authenticated using (tenant_id = public.current_tenant_id() and public.is_manager());

drop policy notification_rules_write on public.notification_rules;
create policy notification_rules_insert on public.notification_rules for insert to authenticated with check (tenant_id = public.current_tenant_id() and public.is_owner());
create policy notification_rules_update on public.notification_rules for update to authenticated using (tenant_id = public.current_tenant_id() and public.is_owner()) with check (tenant_id = public.current_tenant_id() and public.is_owner());
create policy notification_rules_delete on public.notification_rules for delete to authenticated using (tenant_id = public.current_tenant_id() and public.is_owner());

drop policy order_line_modifiers_write on public.order_line_modifiers;
create policy order_line_modifiers_insert on public.order_line_modifiers for insert to authenticated with check (tenant_id = public.current_tenant_id());
create policy order_line_modifiers_update on public.order_line_modifiers for update to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy order_line_modifiers_delete on public.order_line_modifiers for delete to authenticated using (tenant_id = public.current_tenant_id());

drop policy order_lines_write on public.order_lines;
create policy order_lines_insert on public.order_lines for insert to authenticated with check (tenant_id = public.current_tenant_id());
create policy order_lines_update on public.order_lines for update to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy order_lines_delete on public.order_lines for delete to authenticated using (tenant_id = public.current_tenant_id());

drop policy orders_write on public.orders;
create policy orders_insert on public.orders for insert to authenticated with check (tenant_id = public.current_tenant_id() and (public.is_manager() or branch_id = public.current_branch_id()));
create policy orders_update on public.orders for update to authenticated using (tenant_id = public.current_tenant_id() and (public.is_manager() or branch_id = public.current_branch_id())) with check (tenant_id = public.current_tenant_id() and (public.is_manager() or branch_id = public.current_branch_id()));
create policy orders_delete on public.orders for delete to authenticated using (tenant_id = public.current_tenant_id() and (public.is_manager() or branch_id = public.current_branch_id()));

drop policy par_levels_write on public.par_levels;
create policy par_levels_insert on public.par_levels for insert to authenticated with check (tenant_id = public.current_tenant_id() and public.is_manager());
create policy par_levels_update on public.par_levels for update to authenticated using (tenant_id = public.current_tenant_id() and public.is_manager()) with check (tenant_id = public.current_tenant_id() and public.is_manager());
create policy par_levels_delete on public.par_levels for delete to authenticated using (tenant_id = public.current_tenant_id() and public.is_manager());

drop policy payments_write on public.payments;
create policy payments_insert on public.payments for insert to authenticated with check (tenant_id = public.current_tenant_id());
create policy payments_update on public.payments for update to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy payments_delete on public.payments for delete to authenticated using (tenant_id = public.current_tenant_id());

drop policy recipe_lines_write on public.recipe_lines;
create policy recipe_lines_insert on public.recipe_lines for insert to authenticated with check (tenant_id = public.current_tenant_id() and public.is_manager());
create policy recipe_lines_update on public.recipe_lines for update to authenticated using (tenant_id = public.current_tenant_id() and public.is_manager()) with check (tenant_id = public.current_tenant_id() and public.is_manager());
create policy recipe_lines_delete on public.recipe_lines for delete to authenticated using (tenant_id = public.current_tenant_id() and public.is_manager());

drop policy recipe_versions_write on public.recipe_versions;
create policy recipe_versions_insert on public.recipe_versions for insert to authenticated with check (tenant_id = public.current_tenant_id() and public.is_manager());
create policy recipe_versions_update on public.recipe_versions for update to authenticated using (tenant_id = public.current_tenant_id() and public.is_manager()) with check (tenant_id = public.current_tenant_id() and public.is_manager());
create policy recipe_versions_delete on public.recipe_versions for delete to authenticated using (tenant_id = public.current_tenant_id() and public.is_manager());

drop policy recipes_write on public.recipes;
create policy recipes_insert on public.recipes for insert to authenticated with check (tenant_id = public.current_tenant_id() and public.is_manager());
create policy recipes_update on public.recipes for update to authenticated using (tenant_id = public.current_tenant_id() and public.is_manager()) with check (tenant_id = public.current_tenant_id() and public.is_manager());
create policy recipes_delete on public.recipes for delete to authenticated using (tenant_id = public.current_tenant_id() and public.is_manager());

drop policy stock_locations_write on public.stock_locations;
create policy stock_locations_insert on public.stock_locations for insert to authenticated with check (tenant_id = public.current_tenant_id() and public.is_manager());
create policy stock_locations_update on public.stock_locations for update to authenticated using (tenant_id = public.current_tenant_id() and public.is_manager()) with check (tenant_id = public.current_tenant_id() and public.is_manager());
create policy stock_locations_delete on public.stock_locations for delete to authenticated using (tenant_id = public.current_tenant_id() and public.is_manager());

drop policy supplier_items_write on public.supplier_items;
create policy supplier_items_insert on public.supplier_items for insert to authenticated with check (tenant_id = public.current_tenant_id() and public.can_write_purchasing());
create policy supplier_items_update on public.supplier_items for update to authenticated using (tenant_id = public.current_tenant_id() and public.can_write_purchasing()) with check (tenant_id = public.current_tenant_id() and public.can_write_purchasing());
create policy supplier_items_delete on public.supplier_items for delete to authenticated using (tenant_id = public.current_tenant_id() and public.can_write_purchasing());

drop policy suppliers_write on public.suppliers;
create policy suppliers_insert on public.suppliers for insert to authenticated with check (tenant_id = public.current_tenant_id() and public.can_write_purchasing());
create policy suppliers_update on public.suppliers for update to authenticated using (tenant_id = public.current_tenant_id() and public.can_write_purchasing()) with check (tenant_id = public.current_tenant_id() and public.can_write_purchasing());
create policy suppliers_delete on public.suppliers for delete to authenticated using (tenant_id = public.current_tenant_id() and public.can_write_purchasing());

drop policy tables_write on public.tables;
create policy tables_insert on public.tables for insert to authenticated with check (tenant_id = public.current_tenant_id() and public.is_manager());
create policy tables_update on public.tables for update to authenticated using (tenant_id = public.current_tenant_id() and public.is_manager()) with check (tenant_id = public.current_tenant_id() and public.is_manager());
create policy tables_delete on public.tables for delete to authenticated using (tenant_id = public.current_tenant_id() and public.is_manager());
