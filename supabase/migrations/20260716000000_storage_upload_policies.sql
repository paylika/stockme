-- ============================================================
-- StockMe — Stockage : fiabiliser les envois de photos
--
-- Contexte : les uploads utilisaient `upsert: true` alors que la policy
-- posée sur le bucket ne couvrait que INSERT / SELECT / DELETE.
-- Supabase Storage exige aussi une policy UPDATE pour un upsert, sinon
-- l'envoi peut être refusé (« new row violates row-level security policy »).
--
-- Le code n'utilise plus d'upsert (chemins uniques), ce fichier ajoute
-- la policy manquante pour que tout remplacement d'image reste possible
-- (avatar / logo notamment) sans jamais bloquer un vendeur.
-- ============================================================

-- Bucket public (rappel idempotent : ne casse rien s'il existe déjà).
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

-- Lecture publique des images
drop policy if exists "Public read product images" on storage.objects;
create policy "Public read product images"
  on storage.objects for select
  using (bucket_id = 'product-images');

-- Envoi par le propriétaire, dans SON dossier uniquement
drop policy if exists "Auth upload product images" on storage.objects;
create policy "Auth upload product images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and auth.uid()::text = (storage.foldername(name))[1]);

-- Remplacement / mise à jour par le propriétaire (policy manquante avant)
drop policy if exists "Owner update product images" on storage.objects;
create policy "Owner update product images"
  on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'product-images' and auth.uid()::text = (storage.foldername(name))[1]);

-- Suppression par le propriétaire
drop policy if exists "Owner delete product images" on storage.objects;
create policy "Owner delete product images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and auth.uid()::text = (storage.foldername(name))[1]);
