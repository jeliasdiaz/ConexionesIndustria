-- 0004 · Conservación (ver DECISIONS 2026-10-05): los PDF, la firma y los
-- datos sensibles del envío viven 30 minutos después de generarse los PDF.
-- Solo expande: el código anterior sigue funcionando (no manda `id_hash` y
-- nunca ve un null, porque la purga la hace el código nuevo), así la
-- migración se aplica antes del deploy.

-- Lápida del PDF: al vencer se borra el archivo (por la API de Storage, no
-- por SQL: un delete en storage.objects deja el archivo en el almacenamiento)
-- y quedan el sha256 y las fechas, sin datos personales.
alter table generated_documents alter column storage_path drop not null;
alter table generated_documents add column purged_at timestamptz;
create index generated_documents_expiring on generated_documents (created_at)
  where purpose = 'submission' and purged_at is null;

-- Datos sensibles del envío: quedan en null al purgar. `id_hash` es un HMAC
-- del documento (clave del servidor, por evento) que mantiene la detección de
-- "Documento repetido" (D11) sin guardar el número.
alter table submissions
  alter column id_number drop not null,
  alter column eps_name drop not null,
  alter column allergies drop not null,
  alter column medical_condition drop not null,
  alter column emergency_name drop not null,
  alter column emergency_relationship drop not null,
  alter column emergency_phone drop not null,
  add column data_purged_at timestamptz,
  add column id_hash text;
-- Un null solo es posible después de la purga.
alter table submissions add constraint submissions_data_or_purged check (
  data_purged_at is not null
  or (id_number is not null and eps_name is not null and allergies is not null and medical_condition is not null
      and emergency_name is not null and emergency_relationship is not null and emergency_phone is not null)
);
create index submissions_active_hash on submissions (event_id, id_hash) where superseded_at is null;
create index submissions_signature_path on submissions (signature_path) where signature_path is not null;

-- Igual que en 0003, y además guarda `id_hash` y lo usa para el conflicto de
-- documento. Se sigue comparando el número mientras exista: cubre las filas
-- anteriores (sin hash) y el código anterior (que no lo manda).
create or replace function submit_submission(p jsonb) returns table (submission_id uuid, replayed boolean)
language plpgsql set search_path = public as $$
declare
  v_event uuid := (p->>'event_id')::uuid;
  v_email text := nullif(p->>'email', '');
  v_owner text := coalesce(nullif(p->>'owner_key', ''), v_email);
  v_key text := p->>'idempotency_key';
  v_hash text := nullif(p->>'id_hash', '');
  v_prev uuid;
  v_id uuid;
  v_conflict boolean;
begin
  if v_owner is null then
    raise exception 'submit_submission: falta owner_key' using errcode = '22023';
  end if;
  -- Serializa los envíos de un mismo dueño en un mismo evento.
  perform pg_advisory_xact_lock(hashtextextended(v_event::text || ':' || v_owner, 0));

  select s.id into v_id from submissions s where s.event_id = v_event and s.idempotency_key = v_key;
  if found then
    return query select v_id, true;
    return;
  end if;

  update submissions s set superseded_at = now()
   where s.event_id = v_event and s.owner_key = v_owner and s.superseded_at is null
  returning s.id into v_prev;

  select exists (
    select 1 from submissions s
     where s.event_id = v_event and s.superseded_at is null and s.owner_key <> v_owner
       and ((v_hash is not null and s.id_hash = v_hash)
            or (s.id_type = p->>'id_type' and s.id_number = p->>'id_number'))
  ) into v_conflict;

  insert into submissions (
    event_id, owner_key, email, full_name, id_type, id_number, id_hash, student_code, program, is_minor,
    eps_name, allergies, medical_condition, emergency_name, emergency_relationship, emergency_phone,
    signature_path, acceptance, client_ip, user_agent, document_conflict, idempotency_key, supersedes_id
  ) values (
    v_event, v_owner, v_email, p->>'full_name', p->>'id_type', p->>'id_number', v_hash, p->>'student_code', p->>'program',
    (p->>'is_minor')::boolean,
    p->>'eps_name', p->>'allergies', p->>'medical_condition', p->>'emergency_name', p->>'emergency_relationship', p->>'emergency_phone',
    p->>'signature_path', p->'acceptance', (p->>'client_ip')::inet, p->>'user_agent', v_conflict, v_key, v_prev
  ) returning id into v_id;

  if v_conflict then
    update submissions s set document_conflict = true
     where s.event_id = v_event and s.superseded_at is null and s.owner_key <> v_owner
       and ((v_hash is not null and s.id_hash = v_hash)
            or (s.id_type = p->>'id_type' and s.id_number = p->>'id_number'));
  end if;

  return query select v_id, false;
end $$;
revoke execute on function submit_submission(jsonb) from public, anon, authenticated;
grant execute on function submit_submission(jsonb) to service_role;

-- Un envío con los datos ya borrados no se vuelve a generar.
create or replace function claim_submission(p_id uuid) returns boolean
language plpgsql set search_path = public as $$
declare v_ok boolean;
begin
  update submissions
     set status = 'generating', locked_at = now(), attempts = attempts + 1
   where id = p_id
     and attempts < 5
     and data_purged_at is null
     and (
       (status in ('pending','failed') and (locked_at is null or locked_at < now() - interval '30 seconds'))
       or (status = 'generating' and locked_at < now() - interval '3 minutes')
     )
  returning true into v_ok;
  return coalesce(v_ok, false);
end $$;
revoke execute on function claim_submission(uuid) from public, anon, authenticated;
grant execute on function claim_submission(uuid) to service_role;

-- Firmas que ningún envío referencia (se subieron y nunca se enviaron).
create function expired_orphan_signatures(p_before timestamptz, p_limit int default 100) returns setof text
language sql stable set search_path = public as $$
  select o.name
    from storage.objects o
   where o.bucket_id = 'signatures' and o.created_at < p_before
     and not exists (select 1 from submissions s where s.signature_path = o.name)
   order by o.created_at
   limit p_limit;
$$;

-- Envíos cuyos datos sensibles ya no hacen falta:
-- · listos y con todos sus PDF ya borrados;
-- · sin terminar y anteriores a p_unfinished_before (uno que se está
--   generando ahora mismo se deja).
create function submissions_to_purge(p_unfinished_before timestamptz, p_limit int default 100)
returns table (id uuid, event_id uuid, id_type text, id_number text, id_hash text, signature_path text)
language sql stable set search_path = public as $$
  select s.id, s.event_id, s.id_type, s.id_number, s.id_hash, s.signature_path
    from submissions s
   where s.data_purged_at is null
     and (
       (s.status = 'ready'
         and exists (select 1 from generated_documents d where d.submission_id = s.id)
         and not exists (select 1 from generated_documents d where d.submission_id = s.id and d.purged_at is null))
       or (s.created_at < p_unfinished_before
         and (s.status in ('pending','failed') or (s.status = 'generating' and s.locked_at < now() - interval '3 minutes')))
     )
   order by s.created_at
   limit p_limit;
$$;

-- ¿Hay algo vencido? Filtro previo del cron: los plazos repiten los de
-- lib/shared/retention.ts y tienen que ser iguales o menores (el endpoint es
-- el que decide qué se borra; esto solo evita llamarlo sin motivo).
create function purge_due() returns boolean
language sql stable set search_path = public as $$
  select exists (select 1 from generated_documents
                  where purpose = 'submission' and purged_at is null and created_at < now() - interval '30 minutes')
      or exists (select 1 from submissions_to_purge(now() - interval '72 hours', 1))
      or exists (select 1 from expired_orphan_signatures(now() - interval '2 hours', 1))
      or exists (select 1 from email_otps where created_at < now() - interval '24 hours');
$$;

revoke execute on function expired_orphan_signatures(timestamptz, int) from public, anon, authenticated;
revoke execute on function submissions_to_purge(timestamptz, int) from public, anon, authenticated;
revoke execute on function purge_due() from public, anon, authenticated;
grant execute on function expired_orphan_signatures(timestamptz, int) to service_role;
grant execute on function submissions_to_purge(timestamptz, int) to service_role;
grant execute on function purge_due() to service_role;

-- Reloj: pg_cron llama cada minuto a la app (pg_net), que es la que borra.
-- La URL y la clave viven en Vault y las carga el workflow de Producción
-- (scripts/deploy/purge.ts); sin ellas no hace nada (local y CI).
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create function request_document_purge() returns void
language plpgsql set search_path = '' as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'purge_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'purge_secret';
  if v_url is null or v_secret is null or not public.purge_due() then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    timeout_milliseconds := 60000
  );
end $$;
revoke execute on function request_document_purge() from public, anon, authenticated;

select cron.schedule('purge-documents', '* * * * *', 'select public.request_document_purge()');
