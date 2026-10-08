-- Configuração do servidor que não é segredo (CRM#217 e CRM#219). NÃO APLICADA:
-- aplicar no projeto Schedule-button-v2 só com OK da equipe.
--
-- O botão deixa de depender de variável nova na Vercel para o provisionamento e
-- para o link de setup do CRM. Os valores ficam aqui, e nenhum deles é segredo:
--   provisionamento_sha256    sha256 em hex da chave do POST /api/provisionamento
--                             (a chave aberta fica só no CRM, BOTAO_CHAVE_DE_PROVISIONAMENTO)
--   setup_link_chave_publica  chave pública Ed25519 do link de setup v 2, SPKI em
--                             DER codificado em base64 (a privada fica só no CRM,
--                             BOTAO_SETUP_CHAVE_PRIVADA)
--
-- RLS ligado e nenhuma política: o anon e o authenticated não leem nem gravam.
-- Só a service role, que o servidor do botão já usa, passa pelo RLS.
-- O servidor lê com cache de 60 s: uma troca vale em até um minuto.

create table if not exists public.configuracao_do_servidor (
  chave text primary key,
  valor text not null,
  atualizado_em timestamptz default now()
);

alter table public.configuracao_do_servidor enable row level security;

revoke all on table public.configuracao_do_servidor from anon, authenticated;

comment on table public.configuracao_do_servidor is 'Configuração do servidor do botão que não é segredo (CRM#217, CRM#219). Só a service role lê e grava.';
comment on column public.configuracao_do_servidor.chave is 'provisionamento_sha256 | setup_link_chave_publica';
