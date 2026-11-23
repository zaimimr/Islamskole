begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(24);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into auth.users (id, email, raw_app_meta_data)
values
  ('fa000000-0000-0000-0000-0000000000a1', 'zz-fa-parent@zztest.local', '{"role":"member"}'),
  ('fa000000-0000-0000-0000-0000000000a2', 'zz-fa-other@zztest.local', '{"role":"member"}');

insert into public.families (id, origin, display_name, address, postal_code, city)
values
  ('fa000000-0000-0000-0000-0000000000f1', 'test', 'ZZTEST Familie A', 'Gammel vei 1', '1300', 'Sandvika'),
  ('fa000000-0000-0000-0000-0000000000f2', 'test', 'ZZTEST Familie B', 'Annen vei 2', '1337', 'Sandvika');

insert into public.guardians (id, first_name, last_name, email, phone)
values
  ('fa000000-0000-0000-0000-000000000061', 'ZZTEST', 'Forelder A', 'zz-fa-parent@zztest.local', '11111111'),
  ('fa000000-0000-0000-0000-000000000062', 'ZZTEST', 'Forelder B', 'zz-fa-other@zztest.local', '22222222');

insert into public.family_guardians (family_id, guardian_id, is_primary_contact)
values
  ('fa000000-0000-0000-0000-0000000000f1', 'fa000000-0000-0000-0000-000000000061', true),
  ('fa000000-0000-0000-0000-0000000000f2', 'fa000000-0000-0000-0000-000000000062', true);

insert into public.students (id, family_id, child_first_name, child_last_name)
values
  ('fa000000-0000-0000-0000-000000000051', 'fa000000-0000-0000-0000-0000000000f1', 'ZZTEST', 'Barn A1'),
  ('fa000000-0000-0000-0000-000000000052', 'fa000000-0000-0000-0000-0000000000f1', 'ZZTEST', 'Barn A2'),
  ('fa000000-0000-0000-0000-000000000053', 'fa000000-0000-0000-0000-0000000000f2', 'ZZTEST', 'Barn B1');

insert into public.family_pickup_persons (id, family_id, name)
values ('fa000000-0000-0000-0000-0000000000b2', 'fa000000-0000-0000-0000-0000000000f2', 'ZZTEST Hentes B');

select set_config('request.jwt.claims', '{"sub":"fa000000-0000-0000-0000-0000000000a1","email":"zz-fa-parent@zztest.local","role":"authenticated"}', true);
set local role authenticated;

select is(
  jsonb_array_length(public.portal_my_families()),
  1,
  'parent sees only their own family'
);

select ok(
  (public.portal_my_families() -> 0 -> 'guardians' -> 0 ->> 'is_me')::boolean,
  'parent is marked as me'
);

select ok(
  public.portal_can_edit_guardian('fa000000-0000-0000-0000-000000000061')
  and not public.portal_can_edit_guardian('fa000000-0000-0000-0000-000000000062'),
  'parent can edit own guardian only'
);

select lives_ok(
  $$ select public.portal_update_family_address('fa000000-0000-0000-0000-0000000000f1', ' Ny vei 5 ', '1350', 'Lommedalen') $$,
  'parent can update own address'
);

select is(
  public.portal_my_families() -> 0 ->> 'address',
  'Ny vei 5',
  'address is trimmed and saved'
);

select throws_ok(
  $$ select public.portal_update_family_address('fa000000-0000-0000-0000-0000000000f2', 'Hack 1', '0001', 'Oslo') $$,
  '42501',
  null,
  'parent cannot update another family address'
);

select throws_ok(
  $$ select public.portal_update_family_address('fa000000-0000-0000-0000-0000000000f1', 'Ny vei 5', ' ', 'Lommedalen') $$,
  '22023',
  null,
  'incomplete address is rejected'
);

select lives_ok(
  $$ select public.portal_update_guardian('fa000000-0000-0000-0000-000000000061', 'ZZTEST', 'Forelder A', '99999999') $$,
  'parent can update own phone'
);

select is(
  public.portal_my_families() -> 0 -> 'guardians' -> 0 ->> 'phone',
  '+47 99999999',
  'phone is saved'
);

select throws_ok(
  $$ select public.portal_update_guardian('fa000000-0000-0000-0000-000000000062', 'ZZTEST', 'Hack', '0') $$,
  '42501',
  null,
  'parent cannot update a guardian in another family'
);

select isnt(
  public.portal_add_guardian('fa000000-0000-0000-0000-0000000000f1', 'ZZTEST', 'Ny Foresatt', '33333333', 'mor'),
  null,
  'parent can add a guardian'
);

select throws_ok(
  $$ select public.portal_add_guardian('fa000000-0000-0000-0000-0000000000f1', 'ZZTEST', 'Feil', null, 'onkel') $$,
  '22023',
  null,
  'unknown relationship label is rejected'
);

select throws_ok(
  $$ select public.portal_add_guardian('fa000000-0000-0000-0000-0000000000f2', 'ZZTEST', 'Hack', null, 'far') $$,
  '42501',
  null,
  'parent cannot add a guardian to another family'
);

select lives_ok(
  $$ select public.portal_update_child_health('fa000000-0000-0000-0000-000000000051', ' Nøtter ', '', true) $$,
  'parent can update child health'
);

select is(
  (
    select child ->> 'allergies' || '|' || coalesce(child ->> 'medical_notes', 'null') || '|' || (child ->> 'photo_consent')
    from jsonb_array_elements(public.portal_my_families() -> 0 -> 'children') child
    where child ->> 'id' = 'fa000000-0000-0000-0000-000000000051'
  ),
  'Nøtter|null|true',
  'health values are trimmed and saved'
);

select throws_ok(
  $$ select public.portal_update_child_health('fa000000-0000-0000-0000-000000000053', 'Hack', null, false) $$,
  '42501',
  null,
  'parent cannot update health for a child in another family'
);

select isnt(
  public.portal_add_pickup('fa000000-0000-0000-0000-0000000000f1', ' ZZTEST Bestemor ', '44444444', 'bestemor'),
  null,
  'parent can add a pickup person'
);

select is(
  public.portal_my_families() -> 0 -> 'pickup' -> 0 ->> 'name',
  'ZZTEST Bestemor',
  'pickup person is listed'
);

select lives_ok(
  $$ select public.portal_remove_pickup((public.portal_my_families() -> 0 -> 'pickup' -> 0 ->> 'id')::uuid) $$,
  'parent can remove own pickup person'
);

select throws_ok(
  $$ select public.portal_remove_pickup('fa000000-0000-0000-0000-0000000000b2') $$,
  '42501',
  null,
  'parent cannot remove another family pickup person'
);

select throws_ok(
  $$ select public.portal_add_pickup('fa000000-0000-0000-0000-0000000000f2', 'ZZTEST Hack', null, null) $$,
  '42501',
  null,
  'parent cannot add a pickup person to another family'
);

select throws_ok(
  $$ select id from public.guardian_email_changes $$,
  '42501',
  null,
  'parents cannot read email change tokens'
);

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select is(
  (
    select count(*)
    from public.student_guardians sg
    join public.guardians g on g.id = sg.guardian_id
    join public.family_guardians fg on fg.guardian_id = g.id and fg.family_id = 'fa000000-0000-0000-0000-0000000000f1'
    where g.last_name = 'Ny Foresatt' and fg.relationship_label = 'mor'
  ),
  2::bigint,
  'new guardian is linked to the family and both children'
);

select is(
  (select count(*) from public.family_pickup_persons where family_id in ('fa000000-0000-0000-0000-0000000000f1', 'fa000000-0000-0000-0000-0000000000f2')),
  1::bigint,
  'only the other family pickup person remains'
);

select * from finish();
rollback;
