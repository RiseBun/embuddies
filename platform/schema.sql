create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.platform_admins where user_id = auth.uid()) $$;

create table if not exists public.published_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  data jsonb not null,
  published_at timestamptz not null default now(),
  hidden boolean not null default false
);

create table if not exists public.project_submissions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.published_projects(id),
  data jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'pending', 'rejected', 'approved')),
  review_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists public.project_events (
  id bigint generated always as identity primary key,
  project_id uuid references public.published_projects(id) on delete cascade,
  catalog_id text,
  event_type text not null check (event_type in ('detail_view', 'resource_click', 'materials_click', 'kit_click')),
  created_at timestamptz not null default now(),
  check ((project_id is null) <> (catalog_id is null))
);

create table if not exists public.project_reports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.published_projects(id) on delete cascade,
  catalog_id text,
  display_name text not null check (length(trim(display_name)) between 2 and 80),
  hardware_revision text not null default '',
  outcome text not null check (outcome in ('built', 'partial')),
  content text not null check (length(trim(content)) between 50 and 3000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text not null default '',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  check ((project_id is null) <> (catalog_id is null))
);

create table if not exists public.partner_kits (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.published_projects(id) on delete cascade,
  catalog_id text,
  name text not null,
  partner_name text not null,
  revision text not null,
  regions text[] not null,
  url text not null check (url ~ '^https://[^[:space:]]+$'),
  active boolean not null default false,
  created_at timestamptz not null default now(),
  check ((project_id is null) <> (catalog_id is null))
);

create table if not exists public.partner_orders (
  id uuid primary key default gen_random_uuid(),
  kit_id uuid not null references public.partner_kits(id),
  partner_reference text not null,
  ordered_at timestamptz not null,
  region text not null,
  currency text not null,
  order_amount numeric(12,2) not null check (order_amount >= 0),
  commission_amount numeric(12,2) not null check (commission_amount >= 0),
  fulfillment_status text not null check (fulfillment_status in ('open','shipped','delivered','refunded')),
  support_issue boolean not null default false,
  unique (kit_id, partner_reference)
);

create index if not exists project_submissions_owner_idx on public.project_submissions(owner_id, updated_at desc);
create index if not exists project_submissions_pending_idx on public.project_submissions(created_at) where status = 'pending';
create unique index if not exists project_submissions_one_active_revision on public.project_submissions(project_id)
  where project_id is not null and status in ('draft', 'pending', 'rejected');
create index if not exists project_events_project_idx on public.project_events(project_id, event_type);
create index if not exists project_reports_project_idx on public.project_reports(project_id, status, created_at desc);
create index if not exists project_reports_catalog_idx on public.project_reports(catalog_id, status, created_at desc);

alter table public.platform_admins enable row level security;
alter table public.published_projects enable row level security;
alter table public.project_submissions enable row level security;
alter table public.project_events enable row level security;
alter table public.project_reports enable row level security;
alter table public.partner_kits enable row level security;
alter table public.partner_orders enable row level security;

revoke all on public.platform_admins from anon, authenticated;
revoke all on public.published_projects from anon, authenticated;
revoke all on public.project_submissions from anon, authenticated;
revoke all on public.project_events from anon, authenticated;
revoke all on public.project_reports from anon, authenticated;
revoke all on public.partner_kits from anon, authenticated;
revoke all on public.partner_orders from anon, authenticated;
grant select on public.published_projects to anon, authenticated;
grant select, insert on public.project_submissions to authenticated;
grant update (data, status, updated_at) on public.project_submissions to authenticated;
grant insert (project_id, catalog_id, event_type) on public.project_events to anon, authenticated;
grant usage, select on sequence public.project_events_id_seq to anon, authenticated;
grant select on public.project_reports to anon, authenticated;
grant insert (owner_id, project_id, catalog_id, display_name, hardware_revision, outcome, content) on public.project_reports to authenticated;
grant select on public.partner_kits to anon, authenticated;

create policy "published projects visible" on public.published_projects for select to anon, authenticated
using (not hidden or owner_id = auth.uid() or public.is_platform_admin());

create policy "owners and admins see submissions" on public.project_submissions for select to authenticated
using (owner_id = auth.uid() or public.is_platform_admin());

create policy "owners create drafts" on public.project_submissions for insert to authenticated
with check (
  owner_id = auth.uid() and status = 'draft' and review_note = '' and reviewed_at is null
  and (project_id is null or exists (
    select 1 from public.published_projects where id = project_id and owner_id = auth.uid()
  ))
);

create policy "owners edit drafts" on public.project_submissions for update to authenticated
using (owner_id = auth.uid() and status in ('draft', 'rejected'))
with check (owner_id = auth.uid() and status in ('draft', 'pending'));

create policy "record public project activity" on public.project_events for insert to anon, authenticated
with check (
  (project_id is not null and exists (select 1 from public.published_projects where id = project_id and not hidden))
  or (catalog_id ~ '^[a-z0-9-]{1,60}$')
);

create policy "view approved or own reports" on public.project_reports for select to anon, authenticated
using (
  (status = 'approved' and (catalog_id is not null or exists (
    select 1 from public.published_projects where id = project_id and not hidden
  ))) or owner_id = auth.uid() or public.is_platform_admin()
);

create policy "submit own build report" on public.project_reports for insert to authenticated
with check (
  owner_id = auth.uid() and status = 'pending' and review_note = '' and reviewed_at is null
  and (catalog_id ~ '^[a-z0-9-]{1,60}$' or exists (
    select 1 from public.published_projects where id = project_id and not hidden
  ))
);

create policy "view active partner kits" on public.partner_kits for select to anon, authenticated
using (
  (active and (catalog_id is not null or exists (
    select 1 from public.published_projects where id = project_id and not hidden
  ))) or public.is_platform_admin()
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-media', 'project-media', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = excluded.allowed_mime_types;

create policy "view own or published media" on storage.objects for select to anon, authenticated
using (
  bucket_id = 'project-media' and (
    owner_id = (select auth.uid()::text)
    or public.is_platform_admin()
    or exists (select 1 from public.published_projects where not hidden and data->>'imagePath' = name)
  )
);

create policy "upload own project media" on storage.objects for insert to authenticated
with check (bucket_id = 'project-media' and split_part(name, '/', 1) = (select auth.uid()::text));

create or replace function public.review_project_submission(target_id uuid, approve boolean, note text default '')
returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  submission public.project_submissions%rowtype;
  published_id uuid;
  resource jsonb;
  approved_data jsonb;
begin
  if not public.is_platform_admin() then raise exception 'Not authorized'; end if;
  select * into submission from public.project_submissions where id = target_id for update;
  if not found or submission.status <> 'pending' then raise exception 'Submission is not pending'; end if;
  if approve then
    if length(coalesce(trim(submission.data->>'title'), '')) not between 2 and 100
      or length(coalesce(trim(submission.data->>'author'), '')) not between 2 and 100
      or coalesce(submission.data->>'category', '') not in ('robotics','desktop','input','home','wearable','art','tools','other')
      or coalesce(submission.data->>'openness', '') not in ('open','partial','restricted','showcase')
      or coalesce(submission.data->>'readiness', '') not in ('documented','reference','showcase')
      or coalesce(jsonb_typeof(submission.data->'description'), '') <> 'object'
      or greatest(
        length(trim(coalesce(submission.data#>>'{description,zh}', ''))),
        length(trim(coalesce(submission.data#>>'{description,en}', '')))
      ) < 20
      or coalesce(jsonb_typeof(submission.data->'resources'), '') <> 'array'
      or coalesce(jsonb_typeof(submission.data->'materials'), '') <> 'array'
      or coalesce((submission.data->>'rightsConfirmed')::boolean, false) is not true
      or coalesce(submission.data->>'imagePath', '') = ''
    then raise exception 'Project data is incomplete'; end if;
    if jsonb_array_length(submission.data->'resources') > 8 or jsonb_array_length(submission.data->'materials') > 60 then
      raise exception 'Too many resources or parts';
    end if;
    if submission.data->>'openness' in ('open', 'restricted')
      and coalesce(submission.data->>'licenseUrl', '') !~ '^https://[^[:space:]]+$' then
      raise exception 'License link required';
    end if;
    if submission.data->>'openness' = 'open' and jsonb_array_length(submission.data->'resources') = 0 then
      raise exception 'Open projects need a source link';
    end if;
    if submission.data->>'readiness' = 'documented' and (
      jsonb_array_length(submission.data->'materials') = 0
      or not exists (select 1 from jsonb_array_elements(submission.data->'resources') item where item->>'type' in ('guide','bom'))
    ) then raise exception 'Build documentation is incomplete'; end if;
    for resource in select value from jsonb_array_elements(submission.data->'resources') loop
      if coalesce(resource->>'type','') not in ('code','hardware','cad','model','bom','guide','demo')
        or coalesce(resource->>'url','') !~ '^https://[^[:space:]]+$' then
        raise exception 'Invalid project resource';
      end if;
    end loop;
    if coalesce(submission.data->>'imagePath', '') <> '' and submission.data->>'imagePath' not like submission.owner_id::text || '/%' then
      raise exception 'Invalid image path';
    end if;
    if not exists (select 1 from storage.objects where bucket_id = 'project-media' and name = submission.data->>'imagePath') then
      raise exception 'Project image not found';
    end if;
    if submission.project_id is not null and not exists (
      select 1 from public.published_projects where id = submission.project_id and owner_id = submission.owner_id
    ) then raise exception 'Project owner mismatch'; end if;
    approved_data := jsonb_build_object(
      'title', submission.data->>'title',
      'author', submission.data->>'author',
      'category', submission.data->>'category',
      'openness', submission.data->>'openness',
      'readiness', submission.data->>'readiness',
      'licenseUrl', coalesce(submission.data->>'licenseUrl',''),
      'description', submission.data->'description',
      'buildNotes', coalesce(submission.data->'buildNotes', '{}'::jsonb),
      'materials', submission.data->'materials',
      'resources', submission.data->'resources',
      'imagePath', submission.data->>'imagePath'
    );
    published_id := coalesce(submission.project_id, gen_random_uuid());
    insert into public.published_projects (id, owner_id, data)
    values (published_id, submission.owner_id, approved_data)
    on conflict (id) do update set data = excluded.data, published_at = now();
    update public.project_submissions set status = 'approved', project_id = published_id,
      review_note = coalesce(note,''), reviewed_at = now(), updated_at = now() where id = target_id;
  else
    update public.project_submissions set status = 'rejected', review_note = coalesce(note,''),
      reviewed_at = now(), updated_at = now() where id = target_id;
  end if;
  return published_id;
end $$;

create or replace function public.set_project_visibility(target_id uuid, make_hidden boolean)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.is_platform_admin() then raise exception 'Not authorized'; end if;
  update public.published_projects set hidden = make_hidden where id = target_id;
end $$;

create or replace function public.review_project_report(target_id uuid, approve boolean, note text default '')
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.is_platform_admin() then raise exception 'Not authorized'; end if;
  update public.project_reports set status = case when approve then 'approved' else 'rejected' end,
    review_note = coalesce(note,''), reviewed_at = now()
  where id = target_id and status = 'pending';
  if not found then raise exception 'Report is not pending'; end if;
end $$;

create or replace function public.my_project_stats()
returns table(project_id uuid, detail_views bigint, resource_clicks bigint, materials_clicks bigint, kit_clicks bigint)
language sql stable security definer set search_path = public
as $$
  select project.id,
    count(event.id) filter (where event.event_type = 'detail_view'),
    count(event.id) filter (where event.event_type = 'resource_click'),
    count(event.id) filter (where event.event_type = 'materials_click'),
    count(event.id) filter (where event.event_type = 'kit_click')
  from public.published_projects project
  left join public.project_events event on event.project_id = project.id
  where project.owner_id = auth.uid()
  group by project.id
$$;

create or replace function public.platform_metrics()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if not public.is_platform_admin() then raise exception 'Not authorized'; end if;
  return jsonb_build_object(
    'pending_projects', (select count(*) from public.project_submissions where status = 'pending'),
    'published_projects', (select count(*) from public.published_projects where not hidden),
    'published_reports', (select count(*) from public.project_reports where status = 'approved'),
    'detail_views', (select count(*) from public.project_events where event_type = 'detail_view'),
    'materials_clicks', (select count(*) from public.project_events where event_type = 'materials_click'),
    'kit_clicks', (select count(*) from public.project_events where event_type = 'kit_click'),
    'confirmed_orders', (select count(*) from public.partner_orders where fulfillment_status <> 'refunded'),
    'support_issues', (select count(*) from public.partner_orders where support_issue),
    'commission_by_currency', (
      select coalesce(jsonb_object_agg(currency, total), '{}'::jsonb)
      from (
        select currency, sum(commission_amount) as total from public.partner_orders
        where fulfillment_status <> 'refunded' group by currency
      ) totals
    )
  );
end $$;

revoke all on function public.review_project_submission(uuid, boolean, text) from public;
revoke all on function public.set_project_visibility(uuid, boolean) from public;
revoke all on function public.review_project_report(uuid, boolean, text) from public;
revoke all on function public.my_project_stats() from public;
revoke all on function public.platform_metrics() from public;
grant execute on function public.review_project_submission(uuid, boolean, text) to authenticated;
grant execute on function public.set_project_visibility(uuid, boolean) to authenticated;
grant execute on function public.review_project_report(uuid, boolean, text) to authenticated;
grant execute on function public.my_project_stats() to authenticated;
grant execute on function public.platform_metrics() to authenticated;
