-- menu-images herkese açık bir bucket. Uygulama boyut ve türü kontrol ediyor,
-- ama Storage API'si doğrudan çağrılarak bu kontrol atlanabiliyordu; sınırlar
-- artık bucket düzeyinde de zorunlu.
update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'menu-images';
