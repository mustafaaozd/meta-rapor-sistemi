-- ============================================================================
-- META RAPORU — Supabase Veritabanı Şeması
-- Bu dosyanın tamamını Supabase panelinde "SQL Editor" bölümüne yapıştırıp
-- "RUN" butonuna basman yeterli. Tek seferlik kurulumdur.
-- ============================================================================

-- 1) MARKALAR
create table if not exists brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  access_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  created_at timestamptz not null default now()
);

-- 2) AYLIK RAPORLAR (her marka için birden fazla rapor/ay olabilir)
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  report_date date not null default current_date,
  ad_spend numeric not null default 0,
  revenue numeric not null default 0,
  add_to_cart integer not null default 0,
  checkout_started integer not null default 0,
  total_orders integer not null default 0,
  created_at timestamptz not null default now()
);

-- 3) VİDEOLAR / KANCALAR
create table if not exists videos (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references reports(id) on delete cascade,
  title text,
  video_url text not null,
  hook_rate numeric,
  clip_start numeric not null default 0,
  clip_end numeric not null default 0,
  original_duration numeric not null default 0,
  sort_order bigint not null default 0,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- ROW LEVEL SECURITY
-- Herkes (müşteri linkiyle) okuyabilir; sadece giriş yapmış admin yazabilir.
-- Güvenlik, linkteki tahmin edilemez access_token'a dayanır.
-- ============================================================================

alter table brands enable row level security;
alter table reports enable row level security;
alter table videos enable row level security;

drop policy if exists "public read brands" on brands;
create policy "public read brands" on brands for select using (true);
drop policy if exists "admin write brands" on brands;
create policy "admin write brands" on brands for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "public read reports" on reports;
create policy "public read reports" on reports for select using (true);
drop policy if exists "admin write reports" on reports;
create policy "admin write reports" on reports for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "public read videos" on videos;
create policy "public read videos" on videos for select using (true);
drop policy if exists "admin write videos" on videos;
create policy "admin write videos" on videos for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ============================================================================
-- STORAGE (video dosyaları için "hook-videos" adında herkese açık bir bucket)
-- Not: Bucket'ı SQL ile değil, Supabase panelinde Storage sekmesinden
-- "New bucket" > adı: hook-videos > Public bucket: AÇIK olarak oluştur.
-- Aşağıdaki politikalar o bucket için okuma/yazma iznini ayarlar.
-- ============================================================================

drop policy if exists "public read hook videos" on storage.objects;
create policy "public read hook videos" on storage.objects for select
  using (bucket_id = 'hook-videos');

drop policy if exists "admin upload hook videos" on storage.objects;
create policy "admin upload hook videos" on storage.objects for insert
  with check (bucket_id = 'hook-videos' and auth.role() = 'authenticated');

drop policy if exists "admin delete hook videos" on storage.objects;
create policy "admin delete hook videos" on storage.objects for delete
  using (bucket_id = 'hook-videos' and auth.role() = 'authenticated');

drop policy if exists "public read brand logos" on storage.objects;
create policy "public read brand logos" on storage.objects for select
  using (bucket_id = 'brand-logos');

drop policy if exists "admin upload brand logos" on storage.objects;
create policy "admin upload brand logos" on storage.objects for insert
  with check (bucket_id = 'brand-logos' and auth.role() = 'authenticated');
