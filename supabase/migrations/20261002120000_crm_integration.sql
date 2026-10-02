-- Espelho dos cards no CRM ContactIA (issue #91 do CRM). Aplicada no projeto
-- Schedule-button-v2 em 2026-10-02, pelo MCP (nome crm_integration).
--
-- Tudo é configurado no Setup do botão (Editar clínica / unidade):
-- clinics.crm_enabled: "Enviar ao CRM", liga o espelho por clínica
--   (desligado por padrão). A clínica do CRM é achada pelo
--   helena_account_id (companyId), que vai no cabeçalho X-Clinica.
-- clinics.crm_api_key: chave da API do CRM da clínica, com escrita.
--   Write-only como helena_token: entra pelo PUT, nunca volta no GET.
-- units.crm_unit_id: "Unidade no CRM" (GET /api/v1/unidades) para o card
--   novo. Vazio: o card nasce "Sem unidade".

alter table public.clinics
  add column if not exists crm_enabled boolean not null default false,
  add column if not exists crm_api_key text;

alter table public.units
  add column if not exists crm_unit_id uuid;

comment on column public.clinics.crm_enabled is 'Espelha os cards no CRM ContactIA além do painel nativo';
comment on column public.clinics.crm_api_key is 'Chave da API do CRM ContactIA (write-only no Setup)';
comment on column public.units.crm_unit_id is 'Id da unidade no CRM ContactIA (GET /api/v1/unidades)';
