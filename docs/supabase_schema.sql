-- ResearchX schema for Supabase.
-- Run once: Supabase dashboard -> SQL Editor -> New query -> paste -> Run.

create table if not exists public.projects (
    id          text primary key,
    user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
    title       text not null,
    idea_text   text not null default '',
    github_url  text not null default '',
    domain      text not null default '',
    stage       integer not null default 1,
    profile     jsonb,
    literature  jsonb,
    score       jsonb,
    refinement  jsonb,
    plan        jsonb,
    paper       jsonb,
    guidance    jsonb,
    history     jsonb,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

-- Added later (stages 6, 7, 8, 10 and version history): safe to run on an existing table
alter table public.projects add column if not exists refinement jsonb;
alter table public.projects add column if not exists plan jsonb;
alter table public.projects add column if not exists paper jsonb;
alter table public.projects add column if not exists guidance jsonb;
alter table public.projects add column if not exists history jsonb;

create index if not exists projects_user_updated_idx on public.projects (user_id, updated_at desc);

-- Row-Level Security: every user can only see and change their own projects.
alter table public.projects enable row level security;

drop policy if exists "projects_select_own" on public.projects;
drop policy if exists "projects_insert_own" on public.projects;
drop policy if exists "projects_update_own" on public.projects;
drop policy if exists "projects_delete_own" on public.projects;

create policy "projects_select_own" on public.projects
    for select using (auth.uid() = user_id);
create policy "projects_insert_own" on public.projects
    for insert with check (auth.uid() = user_id);
create policy "projects_update_own" on public.projects
    for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "projects_delete_own" on public.projects
    for delete using (auth.uid() = user_id);
