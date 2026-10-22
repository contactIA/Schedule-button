-- A unidade que agenda na agenda do CRM (CRM#302, ADR 0022 do CRM). APLICADA
-- no projeto Schedule-button-v2 em 2026-10-22 (unidade_da_agenda), antes do
-- deploy do botão: sem estas colunas, POST /api/provisionamento falha ao gravar
-- qualquer unidade. O CRM só manda a unidade com agenda: true depois do deploy.
--
-- units.agenda: true = a unidade não tem o Clinicorp e marca pela API da agenda
--   do CRM, com a chave da clínica (clinics.crm_api_key). Os dias, os horários e
--   os profissionais vêm de lá, e as colunas do Clinicorp ficam vazias. Por isso
--   elas deixam de ser obrigatórias, e o check exige as quatro na unidade que
--   agenda no Clinicorp, como antes.
-- clinics.fuso_horario: o fuso da clínica no CRM (fusoHorario do retrato). Os
--   horários da agenda do CRM chegam como instantes e são mostrados nele.

alter table public.units
  add column if not exists agenda boolean not null default false;

alter table public.units
  alter column clinicorp_user drop not null,
  alter column clinicorp_token drop not null,
  alter column clinicorp_subscriber_id drop not null,
  alter column clinicorp_business_id drop not null,
  alter column clinicorp_code_link drop not null;

alter table public.units drop constraint if exists units_clinicorp_ou_agenda;
alter table public.units
  add constraint units_clinicorp_ou_agenda check (
    agenda or (
      clinicorp_user is not null and clinicorp_token is not null
      and clinicorp_subscriber_id is not null and clinicorp_business_id is not null
    )
  );

alter table public.clinics
  add column if not exists fuso_horario text;

comment on column public.units.agenda is 'A unidade marca na agenda do CRM, sem o Clinicorp (CRM#302)';
comment on column public.clinics.fuso_horario is 'fusoHorario do retrato do CRM; mostra os horários da agenda do CRM';
