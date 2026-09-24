-- Veri bırakmayan erişim ve arşiv kontrolü. SQL Editor / execute_sql ile çalıştır.
begin;
do $$
declare b record;
begin
  select id,access_token into b from public.brands order by created_at limit 1;
  if b.id is null then raise exception 'Test için en az bir marka gerekli'; end if;
  perform set_config('test.brand',b.id::text,true);
  perform set_config('test.token',b.access_token,true);
  perform set_config('test.report_count',(select count(*)::text from public.reports where brand_id=b.id),true);
  perform set_config('test.admin',(select user_id::text from private.report_admins limit 1),true);
end $$;
set local role anon;
select set_config('request.headers','{}',true);
do $$
begin
  if exists(select 1 from public.brands) or exists(select 1 from public.reports) or exists(select 1 from public.videos) then
    raise exception 'Tokensız veri sızıntısı'; end if;
  begin
    insert into public.brands(name) values ('UNAUTHORIZED TEST');
    raise exception 'Anonim yazma engellenmedi';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from retired_daily.daily_entries;
    raise exception 'Günlük arşive erişim engellenmedi';
  exception when insufficient_privilege then null; end;
end $$;
do $$ begin
  perform set_config('request.headers',jsonb_build_object('x-report-token',current_setting('test.token'))::text,true);
end $$;
do $$
begin
  if (select count(*) from public.brands) <> 1 then raise exception 'Token markası okunamadı'; end if;
  if exists(select 1 from public.brands where id::text<>current_setting('test.brand')) then raise exception 'Diğer marka sızıntısı'; end if;
  if (select count(*) from public.reports) <> current_setting('test.report_count')::int then raise exception 'Rapor arşivi okunamadı'; end if;
  if exists(select 1 from public.reports where brand_id::text<>current_setting('test.brand')) then raise exception 'Diğer rapor sızıntısı'; end if;
  if exists(select 1 from public.videos v where not exists(select 1 from public.reports r where r.id=v.report_id)) then raise exception 'Diğer video sızıntısı'; end if;
end $$;
select set_config('request.headers','{"x-report-token":"invalid"}',true);
do $$ begin
  if exists(select 1 from public.brands) or exists(select 1 from public.reports) or exists(select 1 from public.videos) then raise exception 'Yanlış token kabul edildi'; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
begin
  if exists(select 1 from public.brands) or exists(select 1 from public.reports) then raise exception 'Yönetici olmayan hesap veri okuyabildi'; end if;
  begin
    insert into public.brands(name) values ('UNAUTHORIZED TEST');
    raise exception 'Yönetici olmayan hesap yazabildi';
  exception when insufficient_privilege then null; end;
end $$;
do $$ begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.admin'),'role','authenticated')::text,true);
end $$;
do $$
declare new_id uuid; next_id uuid; old_count bigint; m jsonb := '{"ad_spend":10,"revenue":50,"add_to_cart":3,"checkout_started":2,"total_orders":1}';
begin
  if not private.is_report_admin() then raise exception 'Yönetici yetkisi kurulamadı'; end if;
  select count(*) into old_count from public.reports;
  insert into public.reports(brand_id,report_date,report_date_end,ad_spend,revenue,meta_data,google_data)
  values(current_setting('test.brand')::uuid,'2098-01-01','2098-01-31',20,100,m,m) returning id into new_id;
  insert into public.reports(brand_id,report_date,report_date_end,ad_spend,revenue)
  values(current_setting('test.brand')::uuid,'2098-02-01','2098-02-28',30,120) returning id into next_id;
  if (select count(*) from public.reports) <> old_count+2 then raise exception 'Arşiv kaydı korunamadı'; end if;
  update public.reports set google_data=null where id=new_id;
  if not exists(select 1 from public.reports where id=new_id and google_data is null and meta_data=m and revenue=100) then raise exception 'Google kaldırma diğer verileri değiştirdi'; end if;
  begin
    update public.reports set meta_data='{"ad_spend":-1}' where id=new_id;
    raise exception 'Bozuk kanal verisi kabul edildi';
  exception when check_violation then null; end;
  begin
    insert into public.reports(brand_id,report_date,report_date_end) values(current_setting('test.brand')::uuid,'2098-01-01','2098-01-31');
    raise exception 'Mükerrer dönem engellenmedi';
  exception when unique_violation then null; end;
  delete from public.reports where id in (new_id,next_id);
  if (select count(*) from public.reports) <> old_count then raise exception 'Kayıt sayısı değişti'; end if;
end $$;
reset role;
rollback;
select 'PASS: token isolation, unauthorized denial, admin CRUD, report archive, google removal, validation; all changes rolled back' as result;
