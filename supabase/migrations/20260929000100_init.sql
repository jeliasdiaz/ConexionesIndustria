-- 0001_init (PLAN §6). Modelo de datos, RLS deny-all y reclamo atómico.
-- D3/S2: todo acceso a datos pasa por el servidor con service role. RLS
-- activado SIN políticas y sin GRANT para anon/authenticated: la anon key no
-- lee ninguna tabla, secuencia ni función.

create table admins (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);

create table templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  kind text not null check (kind in ('per_submission','per_event')),
  audience text not null default 'all' check (audience in ('all','adult','minor')),
                                         -- Anexo 1: all · Anexo 2 mayores: adult · Anexo 2 menores y Anexo 3: minor
  version int not null check (version > 0),
  storage_path text not null unique,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  tags text[] not null,                  -- marcadores detectados
  legal_html_raw text,                   -- clausulado (mammoth), con marcadores sin sustituir
  created_by text not null,
  created_at timestamptz not null default now(),
  unique (name, version)
);

create table events (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,             -- con sufijo aleatorio: visita-2026-10-27-k7x2
  name text not null,
  place text not null,
  event_date date not null,
  responsible_teacher text not null,
  description text not null,             -- Anexo 1 "Descripción de la actividad" y Anexos 2/3 "objetivos": mismo campo
  transport text not null,               -- Anexo 1 "Transporte" (ADMIN LO DEJA CARGADO)
  approved_by text not null,             -- Anexo 1 "Aprobado por" (ADMIN LO DEJA CARGADO)
  minors_digital_enabled boolean not null default false,   -- Q4: apagado hasta aprobación escrita
  default_program text,
  signature_mode text not null default 'photo' check (signature_mode in ('photo','none')),
  allowed_email_domains text[] not null default '{uninorte.edu.co}',
  extra_allowed_emails text[] not null default '{}',
  enforce_roster boolean not null default false,
  opens_at timestamptz,
  deadline timestamptz not null,
  status text not null default 'draft' check (status in ('draft','open','closed','archived')),
  retention_until date not null,
  purge_approved_at timestamptz,         -- la purga automática solo corre si un admin la aprobó para este evento (Q6)
  purged_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now()
);
-- "cerrado" se deriva al leer: status='open' and now() > deadline

create table event_templates (
  event_id uuid references events on delete cascade,
  template_id uuid references templates,
  primary key (event_id, template_id)
);

create table roster (
  event_id uuid references events on delete cascade,
  student_code text not null,
  full_name text not null,
  program text,
  email text,
  primary key (event_id, student_code)
);

create table submissions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events on delete cascade,
  email text not null check (email = lower(email)),
  full_name text not null,
  id_type text not null check (id_type in ('CC','CE','TI','PAS')),
  id_number text not null,
  student_code text not null,
  program text not null,
  is_minor boolean not null default false,   -- calculado en el servidor; la fecha de nacimiento NO se guarda (D13)
  eps_name text not null,
  allergies text not null,               -- "Ninguna" es respuesta válida; dato sensible (D12)
  medical_condition text not null,       -- condición médica física o mental (Anexo 1); dato sensible (D12)
  emergency_name text not null,
  emergency_relationship text not null,
  emergency_phone text not null,
  signature_path text,                   -- PNG procesado; null si signature_mode='none'. Nunca se guarda la foto original
  acceptance jsonb not null,             -- {templates:[{id,version,legal_sha256}], privacy_notice_version,
                                         --  consents:{content,data_processing,emergency_contact_authorization}, is_minor, at}
  client_ip inet,
  user_agent text,
  roster_mismatch boolean not null default false,
  document_conflict boolean not null default false,   -- mismo documento usado con otro correo (D11)
  idempotency_key text not null,         -- header Idempotency-Key: evita duplicados por doble toque
  supersedes_id uuid references submissions,
  superseded_at timestamptz,
  status text not null default 'pending' check (status in ('pending','generating','ready','failed')),
  attempts int not null default 0,
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index submissions_active_doc      -- NO única (D11): se marca document_conflict en vez de bloquear
  on submissions(event_id, id_type, id_number) where superseded_at is null;
create unique index submissions_idempotency
  on submissions(event_id, idempotency_key);
create unique index submissions_active_email
  on submissions(event_id, email) where superseded_at is null;

create table generated_documents (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events on delete cascade,
  submission_id uuid references submissions on delete cascade,   -- null para blank / per_event
  template_id uuid not null references templates,
  purpose text not null check (purpose in ('submission','blank','event_summary')),
  storage_path text not null,            -- documents/{event_id}/{uuid}.pdf  (sin cédula en el nombre)
  sha256 text not null,
  created_at timestamptz not null default now()
);

create table email_otps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events on delete cascade,
  email text not null,
  code_hash text not null,               -- HMAC-SHA256(code, OTP_PEPPER)
  expires_at timestamptz not null,
  attempts int not null default 0,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor text not null,                   -- email admin | 'system' | 'student:<submission_id>'
  action text not null,                  -- download_pdf, export_zip, template_upload, event_publish, purge...
  event_id uuid,
  submission_id uuid,
  meta jsonb not null default '{}'       -- sin PII
);

-- §8 regla 3: una plantilla no se edita; un cambio es una versión nueva.
-- Se aplica a todas (no solo a las ya usadas): así una plantilla nunca cambia
-- por debajo de un evento, y no hay que decidir cuándo "ya se usó".
create function templates_immutable() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'templates es inmutable: suba una versión nueva' using errcode = 'P0001';
end $$;
create trigger templates_no_update before update on templates
  for each row execute function templates_immutable();

-- S16: la auditoría es de solo inserción. La purga (S17) borra datos, no
-- auditoría (que no lleva PII).
create function audit_log_append_only() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'audit_log es de solo inserción' using errcode = 'P0001';
end $$;
create trigger audit_log_no_update before update or delete on audit_log
  for each row execute function audit_log_append_only();
create trigger audit_log_no_truncate before truncate on audit_log
  for each statement execute function audit_log_append_only();

-- Seguridad por defecto
alter table admins enable row level security;
alter table templates enable row level security;
alter table events enable row level security;
alter table event_templates enable row level security;
alter table roster enable row level security;
alter table submissions enable row level security;
alter table generated_documents enable row level security;
alter table email_otps enable row level security;
alter table audit_log enable row level security;
revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- Reclamo atómico para generación (evita doble proceso y permite reintentos)
create or replace function claim_submission(p_id uuid) returns boolean
language plpgsql set search_path = public as $$
declare v_ok boolean;
begin
  update submissions
     set status = 'generating', locked_at = now(), attempts = attempts + 1
   where id = p_id
     and attempts < 5
     and (
       (status in ('pending','failed') and (locked_at is null or locked_at < now() - interval '30 seconds'))
       or (status = 'generating' and locked_at < now() - interval '3 minutes')
     )
  returning true into v_ok;
  return coalesce(v_ok, false);
end $$;
revoke execute on function claim_submission(uuid) from public, anon, authenticated;
revoke execute on function templates_immutable() from public, anon, authenticated;
revoke execute on function audit_log_append_only() from public, anon, authenticated;

-- El servidor (service role) sí necesita acceso. Explícito: no depende de que
-- el proyecto exponga tablas nuevas por defecto (auto_expose_new_tables).
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on function claim_submission(uuid) to service_role;

-- Buckets privados (§5), sin políticas en storage.objects: solo service role.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('templates',  'templates',  false, 10485760, array['application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/pdf']),
  ('signatures', 'signatures', false,  2097152, array['image/png']),
  ('documents',  'documents',  false, 10485760, array['application/pdf']),
  ('exports',    'exports',    false, 524288000, array['application/zip'])
on conflict (id) do nothing;
