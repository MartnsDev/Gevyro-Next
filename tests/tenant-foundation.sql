-- Emula somente a interface mínima do Supabase Auth para testar RLS em PostgreSQL.
-- Não valida sessões, SSR, JWT ou integração com Supabase hospedado.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb default '{}',
  raw_app_meta_data jsonb default '{}',
  created_at timestamptz default now()
);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
create function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
grant execute on function auth.jwt() to authenticated;
-- Interface mínima de Storage: valida políticas SQL, não emula uploads HTTP.
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id bigint generated always as identity primary key,bucket_id text,name text);
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated;
grant select,insert,delete on storage.objects to authenticated;
grant usage on sequence storage.objects_id_seq to authenticated;
create function storage.foldername(name text) returns text[] language sql immutable as
  $$ select (string_to_array(name,'/'))[1:greatest(array_length(string_to_array(name,'/'),1)-1,0)] $$;
\ir ../supabase/migrations/202610200001_tenant_foundation.sql

insert into auth.users (id,email) values ('00000000-0000-0000-0000-000000000003','existing@example.invalid');
\ir ../supabase/migrations/202610210001_auth_profiles.sql
\ir ../supabase/migrations/202610210002_profile_storage.sql
\ir ../supabase/migrations/202610210003_company_operations.sql
\ir ../supabase/migrations/202610210004_products_customers.sql
\ir ../supabase/migrations/202610210005_sales_cash.sql
\ir ../supabase/migrations/202610210006_google_profile_photo.sql
\ir ../supabase/migrations/202610210007_domain_policies.sql

insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002');
insert into auth.users (id,email,raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000004','untrusted@example.invalid','{"nome":"Pessoa Teste","tipo_plano":"PREMIUM","status_acesso":"ATIVO"}');
do $$ begin
  if (select count(*) from public.usuarios) <> 4 then raise exception 'Perfil ausente após trigger/backfill'; end if;
  if (select tipo_plano from public.usuarios where auth_user_id = '00000000-0000-0000-0000-000000000004') <> 'EXPERIMENTAL' then raise exception 'Escalada por metadata'; end if;
end $$;
insert into public.empresas (dono_id, nome_fantasia, tipo_plano) values
  ('00000000-0000-0000-0000-000000000001', 'Empresa A', 'BASICO'),
  ('00000000-0000-0000-0000-000000000002', 'Empresa B', 'PRO');

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
do $$ begin
  if (select count(*) from public.empresas) <> 1 then raise exception 'Falha RLS usuário A'; end if;
  if (select count(*) from public.usuarios) <> 1 then raise exception 'Falha RLS perfis'; end if;
  begin
    update public.usuarios set tipo_plano = 'PREMIUM';
    raise exception 'Escalada de plano autorizada';
  exception when insufficient_privilege then null;
  end;
  if exists(select 1 from public.empresas where nome_fantasia = 'Empresa B') then raise exception 'Vazamento entre empresas'; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
do $$ begin
  if (select count(*) from public.empresas where nome_fantasia = 'Empresa B') <> 1 then raise exception 'Falha RLS usuário B'; end if;
end $$;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  if (select count(*) from public.empresas) <> 0 then raise exception 'Acesso sem identidade'; end if;
  begin
    insert into public.empresas (dono_id,nome_fantasia,tipo_plano) values ('00000000-0000-0000-0000-000000000001','Invasão','PREMIUM');
    raise exception 'Escrita indevidamente autorizada';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.empresas set tipo_plano = 'PREMIUM';
    raise exception 'Atualização indevidamente autorizada';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.empresas;
    raise exception 'Exclusão indevidamente autorizada';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set role anon;
do $$ begin
  begin
    perform * from public.empresas;
    raise exception 'Leitura anônima indevidamente autorizada';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
\echo 'PASS: isolamento entre dois donos; ausência de identidade; leitura anônima; escrita bloqueada.'
\ir company-operations.sql
\ir catalog-operations.sql
\ir sales-operations.sql
reset role;
update public.usuarios set status_acesso='INATIVO' where auth_user_id='00000000-0000-0000-0000-000000000001';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
do $$ begin
 if exists(select 1 from public.produto) or exists(select 1 from public.empresas) or exists(select 1 from public.vendas) then raise exception 'Plano inativo acessou domínio pela Data API';end if;
 if (select count(*) from public.usuarios)<>1 then raise exception 'Perfil de cobrança deixou de ser acessível';end if;
 begin perform public.sale_read(1);raise exception 'Plano inativo acessou RPC';exception when sqlstate 'PT403' then null;end;
end $$;
reset role;
update public.usuarios set status_acesso='ATIVO' where auth_user_id='00000000-0000-0000-0000-000000000001';
\echo 'PASS: plano inativo bloqueado na API SQL e RPC sem impedir leitura do próprio perfil.'
