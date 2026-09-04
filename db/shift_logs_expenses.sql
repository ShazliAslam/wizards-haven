-- WeActive9: per-engineer shift logs and expense claims.
-- Run once in the Supabase SQL editor (project ebgtoagautczzfyurvvp).

create table if not exists public.shift_logs (
  id uuid primary key default gen_random_uuid(),
  engineer_id uuid not null references public.engineers(id) on delete cascade,
  date date not null,
  site text not null default '',
  shift_type text not null default 'Day',
  shift_count numeric not null default 1,
  own_vehicle boolean not null default false,
  status text not null default 'Pending',
  comment text,
  comment_at timestamptz,
  source text not null default 'app',
  created_at timestamptz not null default now()
);
create index if not exists shift_logs_engineer_id_idx on public.shift_logs (engineer_id);
create unique index if not exists shift_logs_sheet_unique_idx
  on public.shift_logs (engineer_id, date, site, shift_type) where source = 'sheet';

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  engineer_id uuid not null references public.engineers(id) on delete cascade,
  date date not null,
  site text not null default '',
  fuel numeric not null default 0,
  meals numeric not null default 0,
  card numeric not null default 0,
  receipt_name text,
  status text not null default 'Pending',
  source text not null default 'app',
  created_at timestamptz not null default now()
);
create index if not exists expenses_engineer_id_idx on public.expenses (engineer_id);
create unique index if not exists expenses_sheet_unique_idx
  on public.expenses (engineer_id, date, site, fuel, meals, card) where source = 'sheet';

grant select, insert, update, delete on public.shift_logs to anon, authenticated;
grant all on public.shift_logs to service_role;
grant select, insert, update, delete on public.expenses to anon, authenticated;
grant all on public.expenses to service_role;

alter table public.shift_logs enable row level security;
alter table public.expenses enable row level security;

drop policy if exists "shift_logs open access" on public.shift_logs;
create policy "shift_logs open access" on public.shift_logs
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "expenses open access" on public.expenses;
create policy "expenses open access" on public.expenses
  for all to anon, authenticated using (true) with check (true);
