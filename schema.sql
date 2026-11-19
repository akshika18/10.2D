create extension if not exists pgcrypto;

create table if not exists public.patients (
  patient_id text primary key check (patient_id in ('patient1','patient2')),
  name text not null default 'Patient',
  rfid_uid text unique,
  morning_start time not null default '05:00',
  morning_deadline time not null default '10:00',
  evening_start time not null default '17:00',
  evening_deadline time not null default '22:00',
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint morning_window_order check (morning_start < morning_deadline),
  constraint evening_window_order check (evening_start < evening_deadline)
);

insert into public.patients (patient_id, name)
values ('patient1','Patient 1'), ('patient2','Patient 2')
on conflict (patient_id) do nothing;

create table if not exists public.dose_events (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null references public.patients(patient_id),
  slot text not null check (slot in ('morning','evening')),
  dose_date date not null,
  status text not null check (status in ('authorized','dispensed','failed')),
  scanned_at timestamptz not null default now(),
  completed_at timestamptz,
  device_note text,
  unique (patient_id, slot, dose_date)
);

create table if not exists public.overdue_notifications (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null references public.patients(patient_id),
  slot text not null check (slot in ('morning','evening')),
  dose_date date not null,
  sent_at timestamptz not null default now(),
  unique (patient_id, slot, dose_date)
);

alter table public.patients enable row level security;
alter table public.dose_events enable row level security;
alter table public.overdue_notifications enable row level security;

drop policy if exists "authenticated manage patients" on public.patients;
create policy "authenticated manage patients" on public.patients
for all to authenticated using (true) with check (true);

drop policy if exists "authenticated read dose events" on public.dose_events;
create policy "authenticated read dose events" on public.dose_events
for select to authenticated using (true);

drop policy if exists "authenticated read notifications" on public.overdue_notifications;
create policy "authenticated read notifications" on public.overdue_notifications
for select to authenticated using (true);

grant select, insert, update, delete on public.patients to authenticated;
grant select on public.dose_events to authenticated;
grant select on public.overdue_notifications to authenticated;
