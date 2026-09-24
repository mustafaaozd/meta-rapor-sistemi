-- Mevcut aylık kayıtları koruyan tek seferlik yükseltme.
begin;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table if not exists private.report_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
revoke all on private.report_admins from public, anon, authenticated;
alter table private.report_admins enable row level security;
-- Bu tek yönetici uygulamasında mevcut tek hesabı yetkilendir.
-- Birden fazla hesap varsa otomatik olarak hepsine yetki verme.
do $$
begin
  if not exists (select 1 from private.report_admins) then
    if (select count(*) from auth.users where is_anonymous is not true) <> 1 then
      raise exception 'Tek yönetici seçilmeden kuruluma devam edilemez. private.report_admins tablosuna yetkili kullanıcıyı ekleyin.';
    end if;
    insert into private.report_admins(user_id)
      select id from auth.users where is_anonymous is not true;
  end if;
end $$;

create or replace function private.is_report_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and exists
    (select 1 from private.report_admins where user_id = auth.uid());
$$;
revoke all on function private.is_report_admin() from public, anon;
grant execute on function private.is_report_admin() to authenticated;

create or replace function private.valid_report_metrics(value jsonb)
returns boolean language plpgsql immutable security invoker set search_path = ''
as $$
declare k text; n numeric;
begin
  if value is null then return true; end if;
  if jsonb_typeof(value) <> 'object' then return false; end if;
  if (select count(*) from jsonb_object_keys(value)) <> 5 then return false; end if;
  foreach k in array array['ad_spend','revenue','add_to_cart','checkout_started','total_orders'] loop
    if jsonb_typeof(value -> k) is distinct from 'number' then return false; end if;
    n := (value ->> k)::numeric;
    if n < 0 or n > 999999999999999 then return false; end if;
    if k in ('add_to_cart','checkout_started','total_orders') and n <> trunc(n) then return false; end if;
  end loop;
  return true;
end $$;
revoke all on function private.valid_report_metrics(jsonb) from public, anon;
grant execute on function private.valid_report_metrics(jsonb) to authenticated;

alter table public.reports add column if not exists meta_data jsonb;
alter table public.reports add column if not exists google_data jsonb;
alter table public.reports drop constraint if exists reports_meta_data_valid;
alter table public.reports add constraint reports_meta_data_valid check (private.valid_report_metrics(meta_data));
alter table public.reports drop constraint if exists reports_google_data_valid;
alter table public.reports add constraint reports_google_data_valid check (private.valid_report_metrics(google_data));
-- NOT VALID mevcut eski kayıtları değiştirmez; yeni yazmalar doğrulanır.
alter table public.reports drop constraint if exists reports_period_valid;
alter table public.reports add constraint reports_period_valid check (report_date_end is null or report_date_end >= report_date) not valid;
alter table public.reports drop constraint if exists reports_metrics_nonnegative;
alter table public.reports add constraint reports_metrics_nonnegative check
  (ad_spend >= 0 and revenue >= 0 and add_to_cart >= 0 and checkout_started >= 0 and total_orders >= 0) not valid;
create index if not exists reports_brand_period_idx on public.reports(brand_id,report_date desc,created_at desc,id desc);
create index if not exists videos_report_order_idx on public.videos(report_id,sort_order);
create unique index if not exists reports_brand_period_unique on public.reports(brand_id,report_date,coalesce(report_date_end,report_date));

-- Günlük modül verileri silinmez; API'ye kapalı arşive alınır.
create schema if not exists retired_daily;
revoke all on schema retired_daily from public, anon, authenticated;
do $$
declare t text;
begin
  foreach t in array array['daily_entries','creatives','creative_sets'] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on public.%I from public, anon, authenticated', t);
      execute format('alter table public.%I set schema retired_daily', t);
    end if;
  end loop;
end $$;

-- Genel okumayı kaldır. Her istekteki token veritabanında denetlenir.
do $$
declare p record; t text;
begin
  for p in select tablename,policyname from pg_policies
    where schemaname='public' and tablename in ('brands','reports','videos') loop
    execute format('drop policy %I on public.%I',p.policyname,p.tablename);
  end loop;
  foreach t in array array['brands','reports','videos'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant select on public.%I to anon',t);
    execute format('grant select,insert,update,delete on public.%I to authenticated',t);
    execute format('create policy admin_manage on public.%I for all to authenticated using ((select private.is_report_admin())) with check ((select private.is_report_admin()))',t);
  end loop;
end $$;

create policy customer_brand on public.brands for select to anon
using (access_token = nullif(coalesce(nullif(current_setting('request.headers',true),'')::jsonb ->> 'x-report-token',''),''));
create policy customer_reports on public.reports for select to anon
using (exists(select 1 from public.brands b where b.id = brand_id));
create policy customer_videos on public.videos for select to anon
using (exists(select 1 from public.reports r where r.id = report_id));

-- Dosyalar bilinen URL ile oynatılabilir; herkese açık listeleme kapatılır.
drop policy if exists "public read hook videos" on storage.objects;
drop policy if exists "admin upload hook videos" on storage.objects;
drop policy if exists "admin delete hook videos" on storage.objects;
drop policy if exists "public read brand logos" on storage.objects;
drop policy if exists "admin upload brand logos" on storage.objects;
drop policy if exists "public read creatives media" on storage.objects;
drop policy if exists "admin upload creatives media" on storage.objects;
drop policy if exists "admin delete creatives media" on storage.objects;
drop policy if exists report_admin_media on storage.objects;
create policy report_admin_media on storage.objects for all to authenticated
using (bucket_id in ('hook-videos','brand-logos') and (select private.is_report_admin()))
with check (bucket_id in ('hook-videos','brand-logos') and (select private.is_report_admin()));
commit;
