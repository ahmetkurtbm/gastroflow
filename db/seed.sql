-- =============================================================================
-- Demo verisi: bir işletme, her rol için bir kullanıcı, menü, salon, reçeteler,
-- stok, satın alma ve son iki haftanın satışları.
--
-- Demo modunda her açılışta, yerel kurulumda `npm run db:setup` ile yüklenir.
-- Bütün kullanıcıların şifresi: demo1234
-- =============================================================================

do $$
declare
  v_tenant  uuid;
  v_branch  uuid;
  v_owner   uuid := '00000000-0000-4000-8000-000000000001';
  v_manager uuid := '00000000-0000-4000-8000-000000000002';
  v_chef    uuid := '00000000-0000-4000-8000-000000000003';
  v_waiter  uuid := '00000000-0000-4000-8000-000000000004';
  v_cashier uuid := '00000000-0000-4000-8000-000000000005';
  v_store   uuid := '00000000-0000-4000-8000-000000000006';
  v_account uuid := '00000000-0000-4000-8000-000000000007';

  v_kitchen uuid;
  v_depot   uuid;
  v_salon   uuid;
  v_garden  uuid;
  v_cat     jsonb := '{}';
  v_item    jsonb := '{}';
  v_inv     jsonb := '{}';
  v_sup1    uuid;
  v_sup2    uuid;
  v_po      uuid;
  v_group   uuid;
  v_combo   uuid;
  v_coupon  uuid;
  v_session uuid;
  v_order   uuid;
  v_line    uuid;
  v_table   uuid;
  v_menu    record;
  v_rl      record;
  v_day     int;
  v_n       int;
  v_count   int;
  v_lines   int;
  v_opened  timestamptz;
  v_total   numeric;
  v_cash    numeric;
  v_method  public.payment_method;
  v_tables  uuid[];
  v_items   uuid[];
  v_qty     int;
  v_customer uuid;
  v_customers uuid[] := '{}';
  r         record;
begin
  perform setseed(0.42);

  -- --- Kullanıcılar -----------------------------------------------------------
  for r in
    select * from (values
      (v_owner,   'patron@demo.gastroflow',   'Selin Aydın'),
      (v_manager, 'mudur@demo.gastroflow',    'Burak Yılmaz'),
      (v_chef,    'sef@demo.gastroflow',      'Hakan Demir'),
      (v_waiter,  'garson@demo.gastroflow',   'Ece Kaya'),
      (v_cashier, 'kasiyer@demo.gastroflow',  'Murat Şahin'),
      (v_store,   'depo@demo.gastroflow',     'Zeynep Arslan'),
      (v_account, 'muhasebe@demo.gastroflow', 'Deniz Öztürk')
    ) as u(id, email, full_name)
  loop
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change, email_change_token_new
    ) values (
      r.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      r.email, extensions.crypt('demo1234', extensions.gen_salt('bf', 6)), now(),
      now() - interval '30 days', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', r.full_name),
      '', '', '', ''
    );
    insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
    values (gen_random_uuid(), r.id, r.id::text, 'email',
            jsonb_build_object('sub', r.id::text, 'email', r.email, 'email_verified', true), now(), now());
  end loop;

  insert into public.tenants (name, slug) values ('Kadıköy Ocakbaşı', 'kadikoy-ocakbasi') returning id into v_tenant;
  insert into public.branches (tenant_id, name) values (v_tenant, 'Moda') returning id into v_branch;

  insert into public.memberships (user_id, tenant_id, branch_id, role) values
    (v_owner,   v_tenant, null,     'owner'),
    (v_manager, v_tenant, v_branch, 'manager'),
    (v_chef,    v_tenant, v_branch, 'chef'),
    (v_waiter,  v_tenant, v_branch, 'waiter'),
    (v_cashier, v_tenant, v_branch, 'cashier'),
    (v_store,   v_tenant, v_branch, 'storekeeper'),
    (v_account, v_tenant, null,     'accountant');

  -- Onay ve geçiş kuralları rolü JWT claim'inden okur; tohum müdür kimliğiyle yazılır.
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', v_manager, 'role', 'authenticated',
    'tenant_id', v_tenant, 'branch_id', v_branch, 'app_role', 'manager')::text, true);

  -- --- Salon ------------------------------------------------------------------
  insert into public.areas (tenant_id, branch_id, name, sort_order) values (v_tenant, v_branch, 'Salon', 1) returning id into v_salon;
  insert into public.areas (tenant_id, branch_id, name, sort_order) values (v_tenant, v_branch, 'Bahçe', 2) returning id into v_garden;

  for v_n in 1..8 loop
    insert into public.tables (tenant_id, branch_id, area_id, name, seats, pos_x, pos_y)
    values (v_tenant, v_branch, v_salon, 'S' || v_n, case when v_n in (4, 8) then 6 else 4 end,
            12 + ((v_n - 1) % 4) * 24, case when v_n <= 4 then 22 else 62 end);
  end loop;
  for v_n in 1..4 loop
    insert into public.tables (tenant_id, branch_id, area_id, name, seats, pos_x, pos_y)
    values (v_tenant, v_branch, v_garden, 'B' || v_n, 4, 15 + (v_n - 1) * 23, 40);
  end loop;
  select array_agg(id order by name) into v_tables from public.tables where branch_id = v_branch;

  -- --- Menü -------------------------------------------------------------------
  for r in select * from (values ('Çorbalar', 1), ('Kebap ve Izgara', 2), ('Pide ve Lahmacun', 3), ('Tatlılar', 4), ('İçecekler', 5)) as c(name, sort)
  loop
    insert into public.categories (tenant_id, name, sort_order) values (v_tenant, r.name, r.sort) returning id into v_group;
    v_cat := v_cat || jsonb_build_object(r.name, v_group);
  end loop;

  for r in select * from (values
      ('mercimek', 'Mercimek Çorbası', 'Çorbalar',          'Tereyağlı, limon ile',          120, 1),
      ('ezogelin', 'Ezogelin Çorbası', 'Çorbalar',          null,                            120, 2),
      ('adana',    'Adana Kebap',      'Kebap ve Izgara',   'Zırh kıyması, közlenmiş biber', 420, 1),
      ('urfa',     'Urfa Kebap',       'Kebap ve Izgara',   null,                            420, 2),
      ('kofte',    'Izgara Köfte',     'Kebap ve Izgara',   'Pilav ve piyaz ile',            360, 3),
      ('tavuk',    'Tavuk Şiş',        'Kebap ve Izgara',   null,                            340, 4),
      ('lahmacun', 'Lahmacun',         'Pide ve Lahmacun',  null,                            150, 1),
      ('pide',     'Kıymalı Pide',     'Pide ve Lahmacun',  null,                            320, 2),
      ('kunefe',   'Künefe',           'Tatlılar',          'Hatay peyniri ile',             220, 1),
      ('sutlac',   'Fırın Sütlaç',     'Tatlılar',          null,                            140, 2),
      ('ayran',    'Ayran',            'İçecekler',         null,                             50, 1),
      ('kola',     'Kola',             'İçecekler',         null,                             70, 2),
      ('cay',      'Çay',              'İçecekler',         null,                             30, 3),
      ('kahve',    'Türk Kahvesi',     'İçecekler',         null,                             90, 4)
    ) as m(key, name, category, description, price, sort)
  loop
    insert into public.menu_items (tenant_id, category_id, name, description, sort_order)
    values (v_tenant, (v_cat ->> r.category)::uuid, r.name, r.description, r.sort)
    returning id into v_group;
    insert into public.menu_prices (tenant_id, menu_item_id, branch_id, price, vat_rate, valid_from)
    values (v_tenant, v_group, null, r.price, 10, now() - interval '60 days');
    v_item := v_item || jsonb_build_object(r.key, v_group);
  end loop;

  -- Şubeye özel fiyat ve eski fiyat örneği: Moda'da Adana 440, genel fiyat bir ay önce 390'dı.
  insert into public.menu_prices (tenant_id, menu_item_id, branch_id, price, vat_rate, valid_from)
  values (v_tenant, (v_item ->> 'adana')::uuid, v_branch, 440, 10, now() - interval '20 days'),
         (v_tenant, (v_item ->> 'adana')::uuid, null,     390, 10, now() - interval '90 days');

  insert into public.modifier_groups (tenant_id, menu_item_id, name, min_select, max_select, sort_order)
  values (v_tenant, (v_item ->> 'adana')::uuid, 'Acı', 0, 1, 1) returning id into v_group;
  insert into public.modifiers (tenant_id, modifier_group_id, name, price_delta, sort_order) values
    (v_tenant, v_group, 'Acısız', 0, 1), (v_tenant, v_group, 'Bol acılı', 0, 2);

  insert into public.modifier_groups (tenant_id, menu_item_id, name, min_select, max_select, sort_order)
  values (v_tenant, (v_item ->> 'adana')::uuid, 'Ekstra', 0, 2, 2) returning id into v_group;
  insert into public.modifiers (tenant_id, modifier_group_id, name, price_delta, sort_order) values
    (v_tenant, v_group, 'Ekstra lavaş', 15, 1), (v_tenant, v_group, 'Közlenmiş domates', 25, 2);

  insert into public.modifier_groups (tenant_id, menu_item_id, name, min_select, max_select, sort_order)
  values (v_tenant, (v_item ->> 'kahve')::uuid, 'Şeker', 1, 1, 1) returning id into v_group;
  insert into public.modifiers (tenant_id, modifier_group_id, name, price_delta, sort_order) values
    (v_tenant, v_group, 'Sade', 0, 1), (v_tenant, v_group, 'Az şekerli', 0, 2),
    (v_tenant, v_group, 'Orta', 0, 3), (v_tenant, v_group, 'Şekerli', 0, 4);

  insert into public.combos (tenant_id, name, price) values (v_tenant, 'Öğle Menüsü', 450) returning id into v_combo;
  insert into public.combo_items (tenant_id, combo_id, menu_item_id, quantity) values
    (v_tenant, v_combo, (v_item ->> 'mercimek')::uuid, 1),
    (v_tenant, v_combo, (v_item ->> 'kofte')::uuid, 1),
    (v_tenant, v_combo, (v_item ->> 'ayran')::uuid, 1);

  -- --- Hammaddeler ve reçeteler ----------------------------------------------
  for r in select * from (values
      ('kiyma',    'Dana kıyma',        'g',    0.55),
      ('kuzu',     'Kuzu kıyma',        'g',    0.70),
      ('tavuk',    'Tavuk göğsü',       'g',    0.28),
      ('mercimek', 'Kırmızı mercimek',  'g',    0.07),
      ('sogan',    'Kuru soğan',        'g',    0.02),
      ('domates',  'Domates',           'g',    0.04),
      ('biber',    'Sivri biber',       'g',    0.06),
      ('lavas',    'Lavaş',             'adet', 6),
      ('hamur',    'Pide hamuru',       'g',    0.03),
      ('tereyag',  'Tereyağı',          'g',    0.50),
      ('pirinc',   'Baldo pirinç',      'g',    0.08),
      ('sut',      'Süt',               'ml',   0.04),
      ('seker',    'Toz şeker',         'g',    0.04),
      ('kadayif',  'Tel kadayıf',       'g',    0.15),
      ('peynir',   'Hatay peyniri',     'g',    0.40),
      ('kahve',    'Türk kahvesi',      'g',    1.20),
      ('cay',      'Siyah çay',         'g',    0.50),
      ('ayran',    'Ayran 300 ml',      'adet', 18),
      ('kola',     'Kola 330 ml',       'adet', 28)
    ) as i(key, name, unit, cost)
  loop
    insert into public.inventory_items (tenant_id, name, base_unit, cost_per_base_unit)
    values (v_tenant, r.name, r.unit, r.cost) returning id into v_group;
    v_inv := v_inv || jsonb_build_object(r.key, v_group);
  end loop;

  insert into public.item_unit_conversions (tenant_id, inventory_item_id, from_unit, to_unit, factor) values
    (v_tenant, (v_inv ->> 'ayran')::uuid, 'koli', 'adet', 20),
    (v_tenant, (v_inv ->> 'kola')::uuid,  'koli', 'adet', 24);

  for v_menu in select * from (values
      ('mercimek', '{"mercimek":60,"sogan":15,"tereyag":10}'),
      ('ezogelin', '{"mercimek":50,"pirinc":15,"sogan":15,"tereyag":10}'),
      ('adana',    '{"kuzu":120,"kiyma":60,"lavas":1,"biber":30,"domates":40}'),
      ('urfa',     '{"kuzu":120,"kiyma":60,"lavas":1,"domates":40}'),
      ('kofte',    '{"kiyma":180,"sogan":20,"pirinc":80,"tereyag":10}'),
      ('tavuk',    '{"tavuk":200,"biber":20,"pirinc":80}'),
      ('lahmacun', '{"hamur":90,"kiyma":50,"sogan":20,"domates":30}'),
      ('pide',     '{"hamur":180,"kiyma":120,"tereyag":10}'),
      ('kunefe',   '{"kadayif":90,"peynir":70,"tereyag":30,"seker":60}'),
      ('sutlac',   '{"sut":250,"pirinc":30,"seker":40}'),
      ('ayran',    '{"ayran":1}'),
      ('kola',     '{"kola":1}'),
      ('cay',      '{"cay":3,"seker":10}'),
      ('kahve',    '{"kahve":7}')
    ) as x(key, lines)
  loop
    insert into public.recipes (tenant_id, menu_item_id, name)
    values (v_tenant, (v_item ->> v_menu.key)::uuid,
            (select name from public.menu_items where id = (v_item ->> v_menu.key)::uuid))
    returning id into v_group;
    insert into public.recipe_versions (tenant_id, recipe_id, version_no, yield_quantity, yield_unit)
    values (v_tenant, v_group, 1, 1, 'porsiyon') returning id into v_line;
    v_n := 0;
    for v_rl in select key, value::numeric as qty from jsonb_each_text(v_menu.lines::jsonb) loop
      v_n := v_n + 1;
      insert into public.recipe_lines (tenant_id, recipe_version_id, line_no, component_type, inventory_item_id, quantity, unit, waste_percent)
      values (v_tenant, v_line, v_n, 'ingredient', (v_inv ->> v_rl.key)::uuid, v_rl.qty,
              (select base_unit from public.inventory_items where id = (v_inv ->> v_rl.key)::uuid),
              case when v_rl.key in ('sogan', 'domates', 'biber') then 10 else 0 end);
    end loop;
    update public.recipe_versions set status = 'active' where id = v_line;
  end loop;

  -- --- Stok -------------------------------------------------------------------
  -- Satıştan düşüm şubenin ilk lokasyonundan yapılır; mutfak önce açılıyor.
  insert into public.stock_locations (tenant_id, branch_id, name, kind, created_at)
  values (v_tenant, v_branch, 'Mutfak', 'kitchen', now() - interval '40 days') returning id into v_kitchen;
  insert into public.stock_locations (tenant_id, branch_id, name, kind)
  values (v_tenant, v_branch, 'Kuru Depo', 'storage') returning id into v_depot;

  insert into public.stock_movements (tenant_id, branch_id, location_id, inventory_item_id, movement_type, quantity, note, created_by, created_at)
  select v_tenant, v_branch, v_kitchen, (v_inv ->> key)::uuid, 'purchase_in', qty, 'Açılış stoğu', v_store, now() - interval '15 days'
  from (values ('kiyma', 60000), ('kuzu', 42000), ('tavuk', 18000), ('mercimek', 14000), ('sogan', 12000),
               ('domates', 14000), ('biber', 6000), ('lavas', 420), ('hamur', 30000), ('tereyag', 9000),
               ('pirinc', 22000), ('sut', 30000), ('seker', 15000), ('kadayif', 13500), ('peynir', 10500),
               ('kahve', 1500), ('cay', 1800), ('ayran', 420), ('kola', 300)) as s(key, qty);

  insert into public.stock_movements (tenant_id, branch_id, location_id, inventory_item_id, movement_type, quantity, note, created_by, created_at)
  select v_tenant, v_branch, v_depot, (v_inv ->> key)::uuid, 'purchase_in', qty, 'Açılış stoğu', v_store, now() - interval '15 days'
  from (values ('pirinc', 25000), ('mercimek', 15000), ('seker', 10000), ('ayran', 200), ('kola', 240)) as s(key, qty);

  insert into public.par_levels (tenant_id, location_id, inventory_item_id, reorder_point, min_quantity, max_quantity)
  select v_tenant, v_kitchen, (v_inv ->> key)::uuid, rp, rp, mx
  from (values ('kiyma', 15000, 60000), ('kuzu', 12000, 45000), ('lavas', 250, 600), ('peynir', 2500, 6000),
               ('kadayif', 2500, 7000), ('ayran', 100, 450), ('kola', 80, 300), ('tereyag', 2000, 9000)) as p(key, rp, mx);

  -- --- Tedarikçiler ve satın alma --------------------------------------------
  insert into public.suppliers (tenant_id, name, contact_name, phone, email, lead_time_days)
  values (v_tenant, 'Moda Et Kombinası', 'Kemal Usta', '0216 555 10 20', 'siparis@modaet.example', 1) returning id into v_sup1;
  insert into public.suppliers (tenant_id, name, contact_name, phone, email, lead_time_days)
  values (v_tenant, 'Anadolu Gıda Toptan', 'Aylin Hanım', '0216 555 30 40', 'satis@anadolugida.example', 2) returning id into v_sup2;

  insert into public.supplier_items (tenant_id, supplier_id, inventory_item_id, supplier_sku, price, min_order_quantity)
  select v_tenant, sup, (v_inv ->> key)::uuid, sku, price, moq
  from (values (v_sup1, 'kiyma', 'ET-001', 0.54, 5000), (v_sup1, 'kuzu', 'ET-002', 0.69, 5000), (v_sup1, 'tavuk', 'ET-010', 0.27, 3000),
               (v_sup2, 'mercimek', 'KB-101', 0.065, 10000), (v_sup2, 'pirinc', 'KB-102', 0.078, 10000), (v_sup2, 'seker', 'KB-110', 0.038, 10000),
               (v_sup2, 'ayran', 'IC-201', 17.5, 100), (v_sup2, 'kola', 'IC-202', 27, 96), (v_sup2, 'peynir', 'SU-301', 0.39, 2000)) as x(sup, key, sku, price, moq);

  insert into public.purchase_orders (tenant_id, branch_id, supplier_id, requested_by, requested_at, note, client_key)
  values (v_tenant, v_branch, v_sup1, v_store, now() - interval '6 days', 'Hafta sonu hazırlığı', 'seed-po-1') returning id into v_po;
  insert into public.po_lines (tenant_id, po_id, inventory_item_id, quantity, unit_price) values
    (v_tenant, v_po, (v_inv ->> 'kiyma')::uuid, 20000, 0.54), (v_tenant, v_po, (v_inv ->> 'kuzu')::uuid, 15000, 0.69);
  update public.purchase_orders set status = 'approved', decided_by = v_manager, decided_at = now() - interval '6 days' where id = v_po;
  update public.po_lines set received_quantity = quantity where po_id = v_po;
  update public.purchase_orders set status = 'received', received_by = v_store, received_at = now() - interval '5 days' where id = v_po;
  insert into public.stock_movements (tenant_id, branch_id, location_id, inventory_item_id, movement_type, quantity, reference_type, reference_id, created_by, created_at)
  select v_tenant, v_branch, v_kitchen, inventory_item_id, 'purchase_in', quantity, 'purchase_order', v_po, v_store, now() - interval '5 days'
  from public.po_lines where po_id = v_po;

  insert into public.purchase_orders (tenant_id, branch_id, supplier_id, requested_by, requested_at, client_key)
  values (v_tenant, v_branch, v_sup2, v_store, now() - interval '1 day', 'seed-po-2') returning id into v_po;
  insert into public.po_lines (tenant_id, po_id, inventory_item_id, quantity, unit_price) values
    (v_tenant, v_po, (v_inv ->> 'ayran')::uuid, 200, 17.5), (v_tenant, v_po, (v_inv ->> 'peynir')::uuid, 4000, 0.39);
  update public.purchase_orders set status = 'approved', decided_by = v_manager, decided_at = now() - interval '20 hours' where id = v_po;

  insert into public.purchase_orders (tenant_id, branch_id, supplier_id, requested_by, requested_at, note, client_key)
  values (v_tenant, v_branch, v_sup1, v_store, now() - interval '2 hours', 'Kıyma azaldı', 'seed-po-3') returning id into v_po;
  insert into public.po_lines (tenant_id, po_id, inventory_item_id, quantity, unit_price) values
    (v_tenant, v_po, (v_inv ->> 'kiyma')::uuid, 25000, 0.54), (v_tenant, v_po, (v_inv ->> 'tavuk')::uuid, 8000, 0.27);

  -- --- Müşteri, kupon, vardiya ------------------------------------------------
  for r in select * from (values ('0532 111 22 33', 'Ali Vural'), ('0533 444 55 66', 'Gizem Koç'), ('0544 777 88 99', null)) as c(phone, name) loop
    insert into public.customers (tenant_id, phone, name) values (v_tenant, r.phone, r.name) returning id into v_customer;
    v_customers := v_customers || v_customer;
  end loop;

  insert into public.coupons (tenant_id, code, kind, value, max_uses, valid_until)
  values (v_tenant, 'HOSGELDIN10', 'percent', 10, 100, now() + interval '30 days') returning id into v_coupon;
  insert into public.coupons (tenant_id, code, kind, value, valid_until)
  values (v_tenant, 'OGLE50', 'amount', 50, now() + interval '14 days');

  for v_day in 0..6 loop
    insert into public.shift_schedules (tenant_id, branch_id, user_id, starts_at, ends_at, created_by)
    select v_tenant, v_branch, u, date_trunc('week', now()) + make_interval(days => v_day, hours => h1),
           date_trunc('week', now()) + make_interval(days => v_day, hours => h2), v_manager
    from (values (v_waiter, 11, 19), (v_chef, 10, 18), (v_cashier, 14, 23), (v_manager, 12, 22)) as s(u, h1, h2)
    where not (u = v_waiter and v_day = 1);
  end loop;

  -- --- Geçmiş satışlar --------------------------------------------------------
  select array_agg(id) into v_items from public.menu_items where tenant_id = v_tenant;

  for v_day in reverse 13..0 loop
    insert into public.cash_sessions (tenant_id, branch_id, opening_float, opened_by, opened_at)
    values (v_tenant, v_branch, 1000, v_cashier, date_trunc('day', now()) - make_interval(days => v_day) + interval '10 hours')
    returning id into v_session;

    v_cash := 0;
    v_count := case when v_day = 0 then 6 else 16 + floor(random() * 12)::int + case when extract(isodow from now() - make_interval(days => v_day)) >= 5 then 8 else 0 end end;

    for v_n in 1..v_count loop
      v_opened := date_trunc('day', now()) - make_interval(days => v_day)
                  + make_interval(hours => 11 + floor(random() * 11)::int, mins => floor(random() * 60)::int);
      if v_opened > now() - interval '2 hours' then
        v_opened := now() - interval '2 hours' - make_interval(mins => v_n * 7);
      end if;
      -- Bugün masa başına tek açık adisyon kuralı bozulmasın diye her sipariş ayrı masada.
      v_table := case
        when v_day = 0 then v_tables[v_n]
        when random() < 0.8 then v_tables[1 + floor(random() * array_length(v_tables, 1))::int]
      end;

      insert into public.orders (tenant_id, branch_id, table_id, channel, guest_count, opened_by, opened_at, client_key, customer_id, created_at)
      values (v_tenant, v_branch, v_table, (case when v_table is null then 'takeaway' else 'dine_in' end)::public.order_channel,
              case when v_table is null then null else 1 + floor(random() * 4)::int end,
              v_waiter, v_opened, 'seed-' || v_day || '-' || v_n,
              case when random() < 0.15 then v_customers[1 + floor(random() * 3)::int] end, v_opened)
      returning id into v_order;

      v_total := 0;
      v_lines := 1 + floor(random() * 4)::int;
      for v_qty in 1..v_lines loop
        v_line := v_items[1 + floor(random() * array_length(v_items, 1))::int];
        select mi.id, mp.price, rv.id as version
          into v_menu
          from public.menu_items mi
          join public.menu_prices mp on mp.menu_item_id = mi.id and mp.branch_id is null and mp.valid_from < now() - interval '30 days'
          left join public.recipes rc on rc.menu_item_id = mi.id
          left join public.recipe_versions rv on rv.recipe_id = rc.id and rv.status = 'active'
         where mi.id = v_line
         order by mp.valid_from desc limit 1;

        insert into public.order_lines (tenant_id, order_id, menu_item_id, quantity, unit_price, vat_rate, recipe_version_id,
                                        status, sent_at, ready_at, created_by, client_key, created_at)
        values (v_tenant, v_order, v_menu.id, 1 + floor(random() * 2)::int, v_menu.price, 10, v_menu.version,
                'served', v_opened + interval '3 minutes', v_opened + interval '18 minutes', v_waiter,
                'seed-line-' || v_qty, v_opened)
        returning id, quantity * unit_price into v_line, v_total;

        -- Bugün açık kalacak siparişlerin stoğu henüz düşmez (adisyon kapanınca düşer).
        insert into public.stock_movements (tenant_id, branch_id, location_id, inventory_item_id, movement_type, quantity, reference_type, reference_id, created_at)
        select v_tenant, v_branch, v_kitchen, l.inventory_item_id, 'sale_out',
               -round(l.quantity * ol.quantity / (1 - l.waste_percent / 100), 3), 'order_line', v_line, v_opened + interval '50 minutes'
          from public.order_lines ol
          join public.recipe_lines l on l.recipe_version_id = ol.recipe_version_id
         where ol.id = v_line and not (v_day = 0 and v_n <= 4);
      end loop;

      select sum(quantity * unit_price) into v_total from public.order_lines where order_id = v_order;
      if v_day = 0 and v_n <= 4 then
        -- Bugünün ilk siparişleri açık kalır: POS, mutfak ve kasa ekranı boş görünmesin.
        update public.order_lines
           set status = (array['sent', 'preparing', 'ready', 'pending']::public.order_line_status[])[v_n],
               sent_at = case when v_n = 4 then null else now() - make_interval(mins => 4 + v_n * 5) end,
               ready_at = null
         where order_id = v_order;
        update public.orders set opened_at = now() - make_interval(mins => 10 + v_n * 6) where id = v_order;
        continue;
      end if;

      v_method := case when random() < 0.4 then 'cash' when random() < 0.85 then 'card' else 'meal_card' end;
      insert into public.payments (tenant_id, order_id, method, amount, received_by, received_at, client_key, cash_session_id)
      values (v_tenant, v_order, v_method, v_total, v_cashier, v_opened + interval '55 minutes', 'seed-pay', v_session);
      if v_method = 'cash' then v_cash := v_cash + v_total; end if;

      update public.orders set status = 'closed', closed_at = v_opened + interval '55 minutes' where id = v_order;

      select customer_id into v_customer from public.orders where id = v_order;
      if v_customer is not null then
        insert into public.loyalty_transactions (tenant_id, customer_id, order_id, kind, points_delta, created_by, created_at)
        values (v_tenant, v_customer, v_order, 'earn', greatest(1, floor(v_total / 10)::int), v_cashier, v_opened + interval '55 minutes');
      end if;
    end loop;

    if v_day > 0 then
      update public.cash_sessions
         set status = 'closed', closed_by = v_cashier,
             closed_at = date_trunc('day', now()) - make_interval(days => v_day) + interval '23 hours 30 minutes',
             counted_cash = 1000 + v_cash - case when v_day = 3 then 120 else 0 end,
             note = case when v_day = 3 then 'Bozuk para eksik' end
       where id = v_session;

      insert into public.fiscal_receipts (tenant_id, branch_id, receipt_date, receipt_no, amount, imported_by)
      select v_tenant, v_branch, (now() - make_interval(days => v_day))::date, 'Z-' || lpad((200 - v_day)::text, 4, '0'),
             sum(p.amount), v_account
        from public.payments p join public.orders o on o.id = p.order_id
       where p.cash_session_id = v_session and v_day <> 2
      having count(*) > 0;
    end if;
  end loop;

  insert into public.channel_settlements (tenant_id, branch_id, platform, settlement_date, amount, imported_by) values
    (v_tenant, v_branch, 'Yemeksepeti', (now() - interval '7 days')::date, 8450, v_account),
    (v_tenant, v_branch, 'Getir',       (now() - interval '7 days')::date, 3120, v_account);

  -- Açık siparişlerden birinde onay bekleyen ikram isteği.
  select ol.id into v_line from public.order_lines ol join public.orders o on o.id = ol.order_id
   where o.tenant_id = v_tenant and o.status = 'open' order by ol.created_at limit 1;
  insert into public.line_discounts (tenant_id, order_line_id, kind, value, reason, requested_by)
  values (v_tenant, v_line, 'comp', 0, 'Müşteri bekledi, ikram', v_waiter);

  -- Biraz zayiat.
  insert into public.stock_movements (tenant_id, branch_id, location_id, inventory_item_id, movement_type, quantity, waste_reason, note, created_by, created_at) values
    (v_tenant, v_branch, v_kitchen, (v_inv ->> 'domates')::uuid, 'waste', -1200, 'spoilage', 'Ezilmiş kasa', v_chef, now() - interval '3 days'),
    (v_tenant, v_branch, v_kitchen, (v_inv ->> 'peynir')::uuid,  'waste', -200,  'dropped',  null,           v_chef, now() - interval '1 day');
end;
$$;
