-- Fundação parcial, NÃO substitui o schema JPA. Aplicar somente em Supabase novo.
-- Escritas continuam fechadas até portar limites de plano e serviços transacionais.
begin;

create table public.empresas (
  id bigint generated always as identity primary key,
  dono_id uuid not null references auth.users(id) on delete restrict,
  nome_fantasia varchar(255) not null check (length(trim(nome_fantasia)) > 0),
  cnpj varchar(14) unique,
  logotipo_url text,
  tipo_plano text not null check (tipo_plano in ('EXPERIMENTAL','BASICO','PRO','PREMIUM')),
  ativa boolean not null default true,
  razao_social text,
  cep text,
  logradouro text,
  numero text,
  bairro text,
  cidade text,
  uf text,
  telefone text,
  created_at timestamptz not null default now(),
  constraint documento_normalizado check (cnpj is null or cnpj ~ '^([0-9]{11}|[0-9]{14})$')
);
create index empresas_dono_id_idx on public.empresas(dono_id, id);
alter table public.empresas enable row level security;

-- Modelo inicial mantém o dono do Java. Delegações fiscais e associação de
-- colaboradores precisam de migrations próprias após a revisão dos respectivos serviços.
create policy empresas_select_dono on public.empresas for select to authenticated
  using (dono_id = (select auth.uid()));

revoke all on public.empresas from anon, authenticated;
grant select on public.empresas to authenticated;
-- Sem INSERT/UPDATE/DELETE para o browser: limites de plano, documento fiscal,
-- arquivamento e restauração ainda não foram migrados e não podem ser contornados.

commit;
