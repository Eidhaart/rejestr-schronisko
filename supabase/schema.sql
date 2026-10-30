-- ============================================================
--  Rejestr schroniska — tables, security, storage, sample data
--  Paste the whole thing into Supabase -> SQL editor -> Run.
--  Safe to re-run (everything is "if not exists").
-- ============================================================

-- Gminy -------------------------------------------------------
-- same idea as the old register: each gmina logs in with its own code
-- and sees only its own animals
create table if not exists public.gminas (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  code       text not null unique,
  created_at timestamptz not null default now()
);

-- Animals (one row = one dog/cat in the register) -------------
create table if not exists public.animals (
  id                 uuid primary key default gen_random_uuid(),
  data_przyjecia     date,
  gmina_id           uuid references public.gminas(id) on delete restrict,
  gmina_name         text,                -- copy of the name, handy for exports
  chip               text,                -- nadany mikrochip
  opis               text not null,       -- opis psa
  imie               text,
  plec               text not null default 'nieznana',  -- samiec | samica | nieznana
  status             text not null default 'schronisko', -- schronisko | adopcja | zwrocony | inny
  data_adopcji       date,
  adoptujacy         text,                -- dane osoby adoptującej (RODO!)
  notatka            text,
  notatka_publiczna  boolean not null default false,
  zdjecie            text,                -- public URL
  photo_path         text,                -- storage path, for replace/delete
  created_at         timestamptz not null default now()
);

create index if not exists animals_gmina_idx on public.animals (gmina_id);
create index if not exists animals_data_idx  on public.animals (data_przyjecia desc);

-- Vet history -------------------------------------------------
-- One table for everything that happens to an animal over time:
--   zabieg       – zabieg weterynaryjny (data + jaki)
--   wscieklizna  – szczepienie przeciw wściekliźnie      (co rok)
--   zakazne      – szczepienie na choroby zakaźne        (co rok)
--   pchly        – profilaktyka pchły/kleszcze           (co miesiąc)
--   pasozyty     – profilaktyka pasożyty wewnętrzne      (co 6 mies.)
--   waga         – samo ważenie
-- Any row can carry a weight, so the weight history builds itself from vet
-- visits. `nastepny` = next due date (filled in automatically, editable).
create table if not exists public.animal_events (
  id           uuid primary key default gen_random_uuid(),
  animal_id    uuid not null references public.animals(id) on delete cascade,
  typ          text not null check (typ in ('zabieg','wscieklizna','zakazne','pchly','pasozyty','waga')),
  data         date not null,
  opis         text,                 -- jaki zabieg / preparat / szczepionka
  waga         numeric(5,2),         -- kg
  nastepny     date,
  reminded_at  timestamptz,          -- set when the reminder email went out
  created_at   timestamptz not null default now()
);

create index if not exists animal_events_animal_idx on public.animal_events (animal_id, data desc);

-- App state / settings (single row) ---------------------------
create table if not exists public.app_state (
  id                           int primary key default 1,
  org_name                     text,     -- nazwa schroniska / organizacji, shown everywhere
  gmina_widzi_adoptujacych     boolean not null default false,
  last_export_sent_at          timestamptz,
  last_export_acknowledged_at  timestamptz,
  constraint app_state_singleton check (id = 1)
);
insert into public.app_state (id) values (1) on conflict (id) do nothing;

-- Row Level Security ------------------------------------------
-- The app talks to the DB only from the server with the service_role key
-- (which skips RLS). RLS on + zero policies = the public anon key gets nothing.
alter table public.gminas        enable row level security;
alter table public.animals       enable row level security;
alter table public.animal_events enable row level security;
alter table public.app_state     enable row level security;

-- Storage bucket for photos -----------------------------------
insert into storage.buckets (id, name, public)
values ('animal-photos', 'animal-photos', true)
on conflict (id) do nothing;

drop policy if exists "Public read animal photos" on storage.objects;
create policy "Public read animal photos"
  on storage.objects for select
  using ( bucket_id = 'animal-photos' );

-- ============================================================
--  Sample data — delete this block for an empty start
-- ============================================================

insert into public.gminas (id, name, code) values
  ('11111111-1111-1111-1111-111111111111', 'Legionowo', 'LEG1'),
  ('22222222-2222-2222-2222-222222222222', 'Jabłonna',  'JAB1'),
  ('33333333-3333-3333-3333-333333333333', 'Nieporęt',  'NIE1')
on conflict (id) do nothing;

insert into public.animals (id, data_przyjecia, gmina_id, gmina_name, chip, opis, imie, plec, status, data_adopcji, adoptujacy) values
  ('aaaaaaaa-0000-0000-0000-000000000001', current_date - 200, '11111111-1111-1111-1111-111111111111', 'Legionowo',
   '616093900146358', 'Mix amstaff, łaciaty, ok. 2 lata, przyjazny', 'Burek', 'samiec', 'schronisko', null, null),
  ('aaaaaaaa-0000-0000-0000-000000000002', current_date - 90,  '11111111-1111-1111-1111-111111111111', 'Legionowo',
   '616093902295529', 'Suczka średnia, ruda, ok. 5 lat', 'Fuks', 'samica', 'adopcja', current_date - 10,
   'Jan Kowalski, ul. Przykładowa 1, 05-120 Legionowo, tel. 500 000 000'),
  ('aaaaaaaa-0000-0000-0000-000000000003', current_date - 40,  '22222222-2222-2222-2222-222222222222', 'Jabłonna',
   null, 'Szczeniak mix, czarny z białą łatą na piersi', 'Kropka', 'samica', 'schronisko', null, null)
on conflict (id) do nothing;

insert into public.animal_events (animal_id, typ, data, opis, waga, nastepny) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'zabieg',      current_date - 198, 'Badanie ogólne, odrobaczenie, czipowanie', 21.4, null),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'wscieklizna', current_date - 350, 'Nobivac Rabies',  null, current_date + 15),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'zakazne',     current_date - 180, 'Nobivac DHPPi+L4', 22.0, current_date + 185),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'pchly',       current_date - 35,  'Bravecto',        null, current_date - 5),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'pasozyty',    current_date - 100, 'Milbemax',        22.6, current_date + 82),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'zabieg',      current_date - 60,  'Kastracja',       23.1, null),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'zabieg',      current_date - 88,  'Sterylizacja',    14.2, null),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'wscieklizna', current_date - 80,  'Nobivac Rabies',  14.5, current_date + 285),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'zabieg',      current_date - 39,  'Badanie przy przyjęciu', 4.1, null),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'pchly',       current_date - 28,  'Simparica',       4.6, current_date + 2),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'waga',        current_date - 7,   null,              5.8, null);
