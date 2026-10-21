begin;
create policy usuarios_update_self on public.usuarios for update to authenticated
  using (auth_user_id=(select auth.uid())) with check (auth_user_id=(select auth.uid()));
grant update (nome,foto_upload,email_vendas,email_relatorios,alerta_estoque_zerado,alerta_vencimento_plano) on public.usuarios to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('profile-photos','profile-photos',false,5242880,array['image/png','image/jpeg','image/gif','image/webp']);
create policy profile_photos_select on storage.objects for select to authenticated
  using(bucket_id='profile-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy profile_photos_insert on storage.objects for insert to authenticated
  with check(bucket_id='profile-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy profile_photos_delete on storage.objects for delete to authenticated
  using(bucket_id='profile-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
commit;
