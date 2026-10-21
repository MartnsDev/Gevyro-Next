reset role;
do $$ begin
  if not public.documento_valido('12345678909') then raise exception 'CPF de teste rejeitado';end if;
  if not public.documento_valido('11222333000181') then raise exception 'CNPJ de teste rejeitado';end if;
  if public.documento_valido('00000000000') or public.documento_valido('12345678900') then raise exception 'Documento inválido aceito';end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
do $$ begin
  begin
    perform public.company_write(null,'Empresa Extra',null,null);
    raise exception 'Limite experimental ignorado';
  exception when sqlstate 'PT403' then null;end;
  begin
    perform public.company_write((select id from public.empresas limit 1),'A','123',true);
    raise exception 'Validação ausente';
  exception when sqlstate 'PT400' then null;end;
  begin
    perform public.company_write(2,'Empresa Invasão',null,true);
    raise exception 'IDOR autorizado';
  exception when sqlstate 'PT404' then null;end;
end $$;
reset role;
update public.usuarios set tipo_plano='PRO',data_vencimento=current_date+30 where auth_user_id='00000000-0000-0000-0000-000000000001';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select public.company_write(null,'Empresa Nova','12345678909',false,'{"cidade":"Cidade Teste"}');
do $$ begin
  if not exists(select 1 from public.empresas where nome_fantasia='Empresa Nova' and ativa and cidade='Cidade Teste') then raise exception 'Criação/enriquecimento incorretos';end if;
  begin
    perform public.company_delete(1,false);raise exception 'Arquivamento sem senha autorizado';
  exception when sqlstate 'PT401' then null;end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from now()))))::text,false);
select public.company_delete(1,false);
do $$ begin
  if exists(select 1 from public.empresas where id=1 and ativa) then raise exception 'Arquivamento falhou';end if;
  begin
    perform public.company_delete(2,true);raise exception 'Exclusão entre empresas autorizada';
  exception when sqlstate 'PT404' then null;end;
end $$;
-- Nome e preferências editáveis; plano e identidade continuam protegidos.
update public.usuarios set nome='Nome alterado' where auth_user_id=auth.uid();
insert into storage.objects(bucket_id,name) values('profile-photos','00000000-0000-0000-0000-000000000001/avatar.png');
do $$ begin
  begin
    insert into storage.objects(bucket_id,name) values('profile-photos','00000000-0000-0000-0000-000000000002/avatar.png');
    raise exception 'Upload cruzado autorizado';
  exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $$ begin
  if exists(select 1 from storage.objects) then raise exception 'Foto de outra conta acessível';end if;
  begin
    perform public.company_write(null,'Documento duplicado','12345678909',true);
    raise exception 'Documento duplicado aceito';
  exception when sqlstate 'PT403' then null; -- Empresa experimental já ocupa a cota.
  end;
end $$;
reset role;
\echo 'PASS: empresas, limite de plano, documento, IDOR, reautenticação e Storage privado.'
