-- 0003 · Correo del estudiante opcional por evento (ver DECISIONS 2026-09-29).
-- Compatible hacia atrás: el código anterior (que manda `email` y no
-- `owner_key`) sigue funcionando, así la migración se aplica antes del deploy.

-- Por defecto no se pide correo: sin dominio verificado (H6) los códigos no
-- llegan a correos institucionales.
alter table events add column require_email boolean not null default false;

-- Dueño del envío: el correo verificado o, sin correo, la sesión del navegador
-- ("sesion:<uuid>"). Propiedad (anti-IDOR, S4) y correcciones (D5) se atan a él.
alter table submissions add column owner_key text;
update submissions set owner_key = email where owner_key is null;
alter table submissions alter column owner_key set not null;
alter table submissions alter column email drop not null;

drop index submissions_active_email;
create unique index submissions_active_owner on submissions (event_id, owner_key) where superseded_at is null;

-- Igual que en 0002, con el dueño en vez del correo:
-- · la misma Idempotency-Key devuelve el envío ya creado (replayed = true);
-- · el envío activo del mismo dueño queda reemplazado (supersedes_id);
-- · el mismo documento con otro dueño no reemplaza a nadie (si no, quien sepa
--   la cédula de otro podría pisarle su formato): se marcan ambos con
--   document_conflict para revisión del admin (D11).
create or replace function submit_submission(p jsonb) returns table (submission_id uuid, replayed boolean)
language plpgsql set search_path = public as $$
declare
  v_event uuid := (p->>'event_id')::uuid;
  v_email text := nullif(p->>'email', '');
  v_owner text := coalesce(nullif(p->>'owner_key', ''), v_email);
  v_key text := p->>'idempotency_key';
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
       and s.id_type = p->>'id_type' and s.id_number = p->>'id_number'
  ) into v_conflict;

  insert into submissions (
    event_id, owner_key, email, full_name, id_type, id_number, student_code, program, is_minor,
    eps_name, allergies, medical_condition, emergency_name, emergency_relationship, emergency_phone,
    signature_path, acceptance, client_ip, user_agent, document_conflict, idempotency_key, supersedes_id
  ) values (
    v_event, v_owner, v_email, p->>'full_name', p->>'id_type', p->>'id_number', p->>'student_code', p->>'program',
    (p->>'is_minor')::boolean,
    p->>'eps_name', p->>'allergies', p->>'medical_condition', p->>'emergency_name', p->>'emergency_relationship', p->>'emergency_phone',
    p->>'signature_path', p->'acceptance', (p->>'client_ip')::inet, p->>'user_agent', v_conflict, v_key, v_prev
  ) returning id into v_id;

  if v_conflict then
    update submissions s set document_conflict = true
     where s.event_id = v_event and s.superseded_at is null and s.owner_key <> v_owner
       and s.id_type = p->>'id_type' and s.id_number = p->>'id_number';
  end if;

  return query select v_id, false;
end $$;
revoke execute on function submit_submission(jsonb) from public, anon, authenticated;
grant execute on function submit_submission(jsonb) to service_role;
