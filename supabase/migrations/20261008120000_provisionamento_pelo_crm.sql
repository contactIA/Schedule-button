-- Provisionamento pelo setup do CRM (CRM#217 e CRM#218). NÃO APLICADA: aplicar no
-- projeto Schedule-button-v2 só com OK da equipe, antes de ligar o envio no CRM
-- (sem estas colunas, POST /api/provisionamento falha ao gravar).
--
-- clinics.provisionado_em: preenchida = a clínica vem do CRM (POST
--   /api/provisionamento), e o setup daqui mostra os campos do cadastro só para
--   leitura. Guarda o "enviadoEm" do último retrato aplicado: um retrato mais
--   velho que chegue depois (nova tentativa do worker) é ignorado.
-- clinics.envia_lembrete_de_consulta: na clínica provisionada, o
--   scheduled_message só agenda com true (o CRM escolheu o botão como remetente
--   do lembrete de consulta). Na não provisionada fica null e nada muda.
-- units.provisionado_em: a unidade veio do CRM (casada pelo crm_unit_id). A
--   unidade provisionada que deixa de vir é desativada, nunca apagada.
--
-- A clínica nova que chega pelo CRM ainda não tem painel nem, às vezes, token
-- da plataforma: o painel se escolhe no setup daqui (decisão #212 em aberto).
-- Por isso estas três colunas deixam de ser obrigatórias. A clínica sem painel
-- não carrega no botão (o /api/clinic responde not_registered).

alter table public.clinics
  add column if not exists provisionado_em timestamptz,
  add column if not exists envia_lembrete_de_consulta boolean;

alter table public.clinics
  alter column helena_token drop not null,
  alter column helena_panel_id drop not null,
  alter column helena_agendado_step_id drop not null;

alter table public.units
  add column if not exists provisionado_em timestamptz;

create index if not exists units_clinic_crm_unit_idx
  on public.units (clinic_id, crm_unit_id)
  where crm_unit_id is not null;

comment on column public.clinics.provisionado_em is 'enviadoEm do último retrato do CRM aplicado; preenchida = clínica provisionada pelo CRM';
comment on column public.clinics.envia_lembrete_de_consulta is 'Clínica provisionada: o botão é o remetente do lembrete de consulta (CRM#218)';
comment on column public.units.provisionado_em is 'Unidade provisionada pelo CRM (casada pelo crm_unit_id)';
