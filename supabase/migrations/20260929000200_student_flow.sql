-- 0002 · Flujo del estudiante (Fase 2) y generación (Fase 3).

-- S5: límites de pedidos de código por correo (≤ 3/hora) y por IP (≤ 10/hora)
-- contados en la BD, sin un servicio de rate limit aparte (ver DECISIONS).
alter table email_otps add column client_ip inet;
create index email_otps_email_recent on email_otps (event_id, email, created_at desc);
create index email_otps_ip_recent on email_otps (client_ip, created_at desc) where client_ip is not null;

create index submissions_event_recent on submissions (event_id, created_at desc);
create index generated_documents_submission on generated_documents (submission_id);
-- Un solo formato en blanco cacheado por evento y plantilla.
create unique index generated_documents_blank on generated_documents (event_id, template_id) where purpose = 'blank';

-- Envío atómico (D5, D11 e idempotencia):
-- · la misma Idempotency-Key devuelve el envío ya creado (replayed = true);
-- · el envío activo del mismo correo queda reemplazado (supersedes_id);
-- · el mismo documento con otro correo no se bloquea: se marcan ambos con
--   document_conflict para revisión del admin.
create function submit_submission(p jsonb) returns table (submission_id uuid, replayed boolean)
language plpgsql set search_path = public as $$
declare
  v_event uuid := (p->>'event_id')::uuid;
  v_email text := p->>'email';
  v_key text := p->>'idempotency_key';
  v_prev uuid;
  v_id uuid;
  v_conflict boolean;
begin
  -- Serializa los envíos de un mismo correo en un mismo evento.
  perform pg_advisory_xact_lock(hashtextextended(v_event::text || ':' || v_email, 0));

  select s.id into v_id from submissions s where s.event_id = v_event and s.idempotency_key = v_key;
  if found then
    return query select v_id, true;
    return;
  end if;

  update submissions s set superseded_at = now()
   where s.event_id = v_event and s.email = v_email and s.superseded_at is null
  returning s.id into v_prev;

  select exists (
    select 1 from submissions s
     where s.event_id = v_event and s.superseded_at is null and s.email <> v_email
       and s.id_type = p->>'id_type' and s.id_number = p->>'id_number'
  ) into v_conflict;

  insert into submissions (
    event_id, email, full_name, id_type, id_number, student_code, program, is_minor,
    eps_name, allergies, medical_condition, emergency_name, emergency_relationship, emergency_phone,
    signature_path, acceptance, client_ip, user_agent, document_conflict, idempotency_key, supersedes_id
  ) values (
    v_event, v_email, p->>'full_name', p->>'id_type', p->>'id_number', p->>'student_code', p->>'program',
    (p->>'is_minor')::boolean,
    p->>'eps_name', p->>'allergies', p->>'medical_condition', p->>'emergency_name', p->>'emergency_relationship', p->>'emergency_phone',
    p->>'signature_path', p->'acceptance', (p->>'client_ip')::inet, p->>'user_agent', v_conflict, v_key, v_prev
  ) returning id into v_id;

  if v_conflict then
    update submissions s set document_conflict = true
     where s.event_id = v_event and s.superseded_at is null and s.email <> v_email
       and s.id_type = p->>'id_type' and s.id_number = p->>'id_number';
  end if;

  return query select v_id, false;
end $$;
revoke execute on function submit_submission(jsonb) from public, anon, authenticated;
grant execute on function submit_submission(jsonb) to service_role;
