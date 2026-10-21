-- Emula somente a interface mínima do Supabase Auth para testar RLS em PostgreSQL.
-- Não valida sessões, SSR, JWT ou integração com Supabase hospedado.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
\ir ../supabase/migrations/202610200001_tenant_foundation.sql

insert into auth.users values
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002');
insert into public.empresas (dono_id, nome_fantasia, tipo_plano) values
  ('00000000-0000-0000-0000-000000000001', 'Empresa A', 'BASICO'),
  ('00000000-0000-0000-0000-000000000002', 'Empresa B', 'PRO');

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
do $$ begin
  if (select count(*) from public.empresas) <> 1 then raise exception 'Falha RLS usuário A'; end if;
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
