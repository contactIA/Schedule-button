-- Espelho dos cards no CRM ContactIA (issue #91 do CRM). NÃO aplicada:
-- aplicar no projeto Schedule-button-v2 só com OK da equipe.
--
-- clinics.crm_enabled: liga o espelho por clínica (desligado por padrão).
--   A clínica do CRM é achada pelo helena_account_id (companyId), que vai no
--   cabeçalho X-Clinica; não precisa de outro id.
-- units.crm_unit_id: a unidade do CRM (GET /api/v1/unidades) para o card novo.
--   Vazio: o card nasce "Sem unidade".

alter table public.clinics
  add column if not exists crm_enabled boolean not null default false;

alter table public.units
  add column if not exists crm_unit_id uuid;

comment on column public.clinics.crm_enabled is 'Espelha os cards no CRM ContactIA além do painel nativo';
comment on column public.units.crm_unit_id is 'Id da unidade no CRM ContactIA (GET /api/v1/unidades)';
