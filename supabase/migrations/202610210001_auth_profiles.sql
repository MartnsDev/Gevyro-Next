-- Perfil de domínio: Supabase mantém senhas, confirmação e tokens em auth.users.
begin;
create table public.usuarios (
  id bigint generated always as identity primary key,
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  nome varchar(255) not null,
  foto_google text,
  foto_upload text,
  tipo_plano text not null default 'EXPERIMENTAL' check (tipo_plano in ('EXPERIMENTAL','BASICO','PRO','PREMIUM')),
  status_acesso text not null default 'ATIVO' check (status_acesso in ('ATIVO','INATIVO')),
  data_criacao timestamptz not null default now(),
  data_primeiro_login timestamptz not null default now(),
  data_assinatura_plus timestamptz,
  data_vencimento date,
  email_vendas boolean not null default false,
  email_relatorios boolean not null default false,
  alerta_estoque_zerado boolean not null default true,
  alerta_vencimento_plano boolean not null default true
);
alter table public.usuarios enable row level security;
create policy usuarios_select_self on public.usuarios for select to authenticated
  using (auth_user_id = (select auth.uid()));
revoke all on public.usuarios from anon, authenticated;
grant select on public.usuarios to authenticated;

-- Metadados editáveis pelo usuário podem sugerir NOME, nunca plano ou acesso.
create function public.create_auth_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.usuarios (auth_user_id,nome,data_criacao,data_primeiro_login)
  values (new.id, left(coalesce(nullif(new.raw_user_meta_data ->> 'nome',''),
    nullif(new.raw_user_meta_data ->> 'full_name',''), split_part(new.email,'@',1), 'Usuário'),255),
    coalesce(new.created_at,now()), coalesce(new.created_at,now()));
  return new;
end;
$$;
revoke all on function public.create_auth_profile() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.create_auth_profile();

-- Contas existentes neste projeto novo recebem perfil; não importa contas MySQL.
insert into public.usuarios (auth_user_id,nome,data_criacao,data_primeiro_login)
select id,left(coalesce(nullif(raw_user_meta_data ->> 'nome',''),
  nullif(raw_user_meta_data ->> 'full_name',''),split_part(email,'@',1),'Usuário'),255),
  coalesce(created_at,now()),coalesce(created_at,now()) from auth.users
on conflict (auth_user_id) do nothing;
commit;
