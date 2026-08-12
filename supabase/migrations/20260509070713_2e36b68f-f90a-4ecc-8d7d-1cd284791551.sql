
-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  whatsapp text,
  city text,
  role text not null default 'both' check (role in ('fournisseur','revendeur','both')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "Profiles are viewable by authenticated"
  on public.profiles for select to authenticated using (true);
create policy "Users can insert own profile"
  on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "Users can update own profile"
  on public.profiles for update to authenticated using (auth.uid() = id);

-- Products
create table public.products (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  category text not null,
  price_fcfa integer not null check (price_fcfa >= 0),
  quantity integer not null default 0 check (quantity >= 0),
  moq integer not null default 1 check (moq >= 1),
  city text not null,
  images text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.products enable row level security;
create policy "Products viewable by everyone" on public.products for select using (true);
create policy "Owners can insert" on public.products for insert to authenticated with check (auth.uid() = owner_id);
create policy "Owners can update" on public.products for update to authenticated using (auth.uid() = owner_id);
create policy "Owners can delete" on public.products for delete to authenticated using (auth.uid() = owner_id);

create index products_city_idx on public.products(city);
create index products_category_idx on public.products(category);
create index products_owner_idx on public.products(owner_id);

-- updated_at trigger
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger profiles_updated before update on public.profiles
  for each row execute function public.tg_set_updated_at();
create trigger products_updated before update on public.products
  for each row execute function public.tg_set_updated_at();

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone, whatsapp, city, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.raw_user_meta_data->>'whatsapp', ''),
    coalesce(new.raw_user_meta_data->>'city', ''),
    coalesce(new.raw_user_meta_data->>'role', 'both')
  );
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Storage bucket
insert into storage.buckets (id, name, public) values ('product-images','product-images', true);

create policy "Public read product images"
  on storage.objects for select using (bucket_id = 'product-images');
create policy "Auth upload product images"
  on storage.objects for insert to authenticated with check (bucket_id = 'product-images' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "Owner delete product images"
  on storage.objects for delete to authenticated using (bucket_id = 'product-images' and auth.uid()::text = (storage.foldername(name))[1]);
