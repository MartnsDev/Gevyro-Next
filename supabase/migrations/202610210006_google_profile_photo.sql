begin;
create or replace function public.create_auth_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.usuarios (auth_user_id,nome,data_criacao,data_primeiro_login,foto_google)
  values (new.id, left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome'),''),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'),''), split_part(new.email,'@',1), 'Usuário'),255),
    coalesce(new.created_at,now()), coalesce(new.created_at,now()),
    case when new.raw_app_meta_data->>'provider'='google' and coalesce(new.raw_user_meta_data->>'avatar_url',new.raw_user_meta_data->>'picture') ~ '^https://lh3\.googleusercontent\.com/'
      then coalesce(new.raw_user_meta_data->>'avatar_url',new.raw_user_meta_data->>'picture') else null end);
  return new;
end;
$$;
update public.usuarios u set foto_google=coalesce(a.raw_user_meta_data->>'avatar_url',a.raw_user_meta_data->>'picture')
from auth.users a where a.id=u.auth_user_id and u.foto_google is null
and a.raw_app_meta_data->>'provider'='google'
and coalesce(a.raw_user_meta_data->>'avatar_url',a.raw_user_meta_data->>'picture') ~ '^https://lh3\.googleusercontent\.com/';
commit;
