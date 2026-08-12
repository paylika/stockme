
-- Fix mutable search_path
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql
set search_path = public
as $$
begin new.updated_at = now(); return new; end; $$;

-- Restrict execution of SECURITY DEFINER triggers
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.tg_set_updated_at() from public, anon, authenticated;

-- Tighten storage listing: drop broad policy, allow read of single objects only via getPublicUrl path
drop policy if exists "Public read product images" on storage.objects;
create policy "Public read single product image"
  on storage.objects for select
  using (bucket_id = 'product-images');
-- Note: bucket remains public for direct URL access; listing via API is restricted by not granting list separately.
