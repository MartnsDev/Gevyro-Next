begin;
update public.usuarios set nome='Usuário' where trim(nome)='';
alter table public.usuarios add constraint usuarios_nome_not_blank check(length(trim(nome))>0);
-- A Data API também deve respeitar o bloqueio de plano do antigo PlanAccessFilter.
-- O perfil continua legível para o usuário saber que precisa regularizar o plano.
alter policy empresas_select_dono on public.empresas using(dono_id=(select auth.uid()) and public.has_active_plan());
alter policy usuarios_update_self on public.usuarios using(auth_user_id=(select auth.uid()) and public.has_active_plan())
 with check(auth_user_id=(select auth.uid()) and public.has_active_plan());
alter policy produto_owner on public.produto using(public.has_active_plan() and exists(select 1 from public.empresas e where e.id=empresa_id and e.dono_id=(select auth.uid())));
alter policy clientes_owner on public.clientes using(public.has_active_plan() and exists(select 1 from public.empresas e where e.id=empresa_id and e.dono_id=(select auth.uid())));
alter policy estoque_owner on public.estoque_movimentacoes using(public.has_active_plan() and exists(select 1 from public.empresas e where e.id=empresa_id and e.dono_id=(select auth.uid())));
alter policy caixas_owner on public.caixas using(public.has_active_plan() and exists(select 1 from public.usuarios u where u.id=usuario_id and u.auth_user_id=(select auth.uid())));
alter policy vendas_owner on public.vendas using(public.has_active_plan() and exists(select 1 from public.usuarios u where u.id=usuario_id and u.auth_user_id=(select auth.uid())));
alter policy itens_owner on public.itens_venda using(public.has_active_plan() and exists(select 1 from public.empresas e where e.id=empresa_id and e.dono_id=(select auth.uid())));
alter policy profile_photos_insert on storage.objects with check(bucket_id='profile-photos' and (storage.foldername(name))[1]=(select auth.uid())::text and public.has_active_plan());
alter policy profile_photos_delete on storage.objects using(bucket_id='profile-photos' and (storage.foldername(name))[1]=(select auth.uid())::text and public.has_active_plan());
commit;
