# Schedule Button — Botão de Agendamento

Plataforma **white-label multi-tenant** para criação rápida de cards no CRM Helena (WTS.chat) e agendamentos no Clinicorp. Projetada para operadores de CRC (Central de Relacionamento com o Cliente) de clínicas odontológicas.

Um único deploy atende N clínicas — cada uma com suas próprias credenciais, painéis, etapas, etiquetas e unidades. Nenhuma clínica enxerga os dados de outra.

---

## O que faz

O operador abre a tela a partir de um contato no WhatsApp (via URL com `?idconta=...&contactId=...`) e resolve duas coisas num único fluxo de 2 etapas:

1. **Cria ou move o card** do paciente no funil CRM (Helena/WTS.chat), com etiquetas do painel aplicadas direto na mesma tela
2. **Cria o agendamento** na agenda do Clinicorp (busca o paciente pelo telefone; cria se não existir)

### Fluxo do operador

```
Etapa 1 — Formulário
  • Nome e telefone pré-preenchidos via API Helena (DDI +55 removido)
  • Sem contactId na URL → busca manual de contato por telefone
    (vincula/desvincula o contato encontrado no CRM)
  • Histórico do paciente no Clinicorp ao digitar o telefone
    (últimos agendamentos com data, hora, dentista e status)
  • Números privados/mascarados (@lid) exigem preenchimento manual
  • Se o contato já tem card aberto → fluxo vira "Mover Card"
  • Seletor de unidade (visível apenas com 2+ unidades)
  • Campo livre de observações

Etapa 2 — Calendário
  • Dias sem agenda aberta no Clinicorp aparecem desabilitados
  • Navegação por mês; clique no dia busca horários no Clinicorp em tempo real
  • Filtro por dentista quando há 2+ profissionais no dia
    ("Qualquer disponível" + primeiro nome de cada um)
  • Slots exibidos por dentista (ex: 08:00 → 09:00 · Alex)
  • Etiquetas do painel como chips clicáveis (cores reais do Helena)
  • Confirma com ou sem horário:
      "Criar Card + Agendar" / "Mover Card sem Horário" etc.
```

### O que acontece no submit

1. Busca card existente do contato → **cria** (com `tagIds`) ou **move** para a etapa "Agendado" configurada
2. Etiquetas selecionadas são **mescladas** com as que o card já tem — nada é removido
3. Se houver slot: busca paciente no Clinicorp pelo telefone → cria se não existir → cria o agendamento (sem categoria/cor — `CategoryDescription` não é confiável em todas as contas Clinicorp, ver débitos técnicos)
4. Com o Clinicorp confirmado e o lembrete ativado na clínica: agenda mensagem de template por WhatsApp via app "Mensagens agendadas" do Helena — na véspera às HH:MM, X horas antes ou logo após o agendamento. **Falha no lembrete nunca desfaz card/agendamento** (aviso amarelo ao operador)
5. Nas clínicas com "Enviar ao CRM" ligado no Setup: espelha o card no CRM ContactIA (cria pelo telefone e move para Agendados), com a chave do CRM da própria clínica. Falha no CRM nunca afeta o painel nativo nem o agendamento (ver `CLAUDE.md`)

---

## Stack

| Camada | Tecnologia | Motivo |
|---|---|---|
| Frontend | React 19 + Vite | Componentes reativos, build rápido |
| Estilo | CSS customizado | Sem dependência de framework externo |
| Backend | Vercel Functions (Node.js) | Serverless, zero infra |
| Banco de dados | Supabase (PostgreSQL) | Config multi-tenant por clínica |
| Deploy | Vercel | Deploy automático via git push na `main` |

Sem TypeScript — projeto em JavaScript puro.

---

## Identidade visual

O botão segue o sistema visual do CRM ContactIA, para parecer parte dele dentro do atendimento. Os tokens vivem no `:root` de `src/index.css`, com os valores do CRM (`src/app/globals.css` do repo do CRM); `App.css` e `Setup.css` só usam as variáveis.

| Token | Valor | Uso |
|---|---|---|
| `--marca-1/2/3` (e `--brand`) | `#4c0c94`, `#9e1b57`, `#e8341a` em degradê de 95deg | Botão principal e selo da marca |
| `--acento`, `--acento-forte` | `#4a0e8a`, `#5a14a3` | O que está ativo: dia, horário, chip, interruptor |
| `--acento-suave`, `--acento-borda`, `--acento-anel` | `#f5edfb`, `#d4b6ee`, roxo a 15% | Hover, bordas e anel de foco |
| `--fundo`, `--superficie`, `--campo`, `--painel` | `#f4f5f8`, `#fff`, `#fafafb`, `#f7f8fa` | Fundo da tela, cartões, campos e blocos |
| `--linha*`, `--tinta*`, `--apagado*` | cinzas do CRM | Bordas e textos |
| `--ok*`, `--atencao*`, `--alerta*` | verde, âmbar e vermelho do CRM | Situação (sucesso, aviso, erro), separada da marca |
| `--raio`, `--raio-cartao`, `--raio-chip` | 10px, 14px, 8px | Controles, cartões, chips e dias |

Letra: Geist e Geist Mono (rótulos de seção), pelos pacotes `@fontsource-variable/geist` e `@fontsource-variable/geist-mono`, que vêm no build (nenhum pedido a outro servidor ao abrir o iframe). Tema claro só, como no CRM. As classes `.botao-marca` e `.fundo-marca` são as mesmas do CRM.

---

## Arquitetura white-label

A clínica é identificada pelo `idconta` na URL — o `companyId` da conta Helena:

```
https://schedule-button-xi.vercel.app/?idconta=XXXX&contactId=UUID
```

### Fluxo de identificação

```
URL ?idconta=XXXX
  → GET /api/clinic?idconta=XXXX
  → Supabase: clinics WHERE helena_account_id = XXXX
  → Retorna config pública (sem tokens): nome, painéis, etapas, unidades, profissionais
```

Se o `idconta` não estiver cadastrado → tela "Clínica não encontrada" com botão "Sou administrador →".

### Segurança das credenciais

O frontend **nunca recebe tokens**. Todas as chamadas externas passam por Vercel Functions que carregam as credenciais do Supabase:

```
Frontend (browser)
  → /api/proxy      ← injeta token Helena da clínica       → api.wts.chat
  → /api/clinicorp  ← injeta credenciais Clinicorp da unit → api.clinicorp.com
```

As variáveis de ambiente na Vercel são `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` e `ADMIN_PASSWORD` — esta última validada **no servidor** (header `x-admin-key`, fail-closed) em todas as rotas admin. Tokens Helena/Clinicorp são write-only nas rotas admin: entram via POST/PUT, nunca voltam em GET.

### Rotas do operador (sem senha)

O `idconta` da URL não é segredo: aparece no item de menu de cada clínica. Por isso as rotas que o botão chama sem senha se protegem de dois jeitos:

1. **Prova de origem** (`api/_origin.js`), em `/api/clinic`, `/api/proxy`, `/api/clinicorp`, `/api/crm` e `/api/reminder-log`. O pedido só passa quando o `Origin` (ou o `Referer`, quando não há `Origin`, como no GET do próprio app) é:
   - do próprio app: o host que serviu o pedido, seja o domínio da Vercel, seja um domínio próprio, sem configurar nada (o front chama `/api/*` do mesmo endereço), ou um dos endereços que a Vercel dá ao deploy (`VERCEL_URL`, `VERCEL_BRANCH_URL`, `VERCEL_PROJECT_PRODUCTION_URL`);
   - ou de um host da variável `EMBED_HOSTS` (o host da plataforma onde o botão abre), com os subdomínios.

   Sem `Origin` nem `Referer`, só passa o pedido que o navegador marca com `Sec-Fetch-Site: same-origin`. O resto volta `403 { error: 'origin_not_allowed' }`, antes de ir ao banco. É barreira contra outro site usar o navegador do operador, não garantia: quem monta o pedido à mão forja esses cabeçalhos. O `/setup` e as rotas admin não mudam (senha).
2. **Lista de caminhos no proxy** (`api/proxy.js`): só os caminhos e métodos da tabela em "Endpoints consumidos", abaixo, com os ids conferidos (sem `.`, `/` ou `%`) e a query remontada. O resto volta `403 { error: 'path_not_allowed' }`. Além disso:
   - a busca de card exige `ContactId` e `PageSize=1`, `PageNumber=1` (não lista o painel);
   - mover card (`PUT`) exige `fields` com pelo menos um entre `stepId`, `customFields` e `tagIds`, e nada fora deles;
   - o lembrete só sai com um modelo ativo do Setup, pelo canal configurado nele;
   - nesses dois, o corpo só leva as chaves que o front manda, na grafia exata, e vai à plataforma o corpo conferido (`403 { error: 'body_not_allowed' }` no resto).

   Chamada nova à plataforma no front entra na lista e no teste de contrato (`api/_proxy.test.js`, que roda as funções de `src/services/helena.js`).

O `/api/clinic` devolve só a config da tela (nome, painéis, etapas, etiquetas, unidades, lembrete), sem token nem credencial; `api/_clinic.test.js` confere.

### Schema do banco (Supabase)

```sql
-- Dados Helena por clínica
clinics (
  id uuid PRIMARY KEY,
  slug text UNIQUE,                -- identificador interno
  name text,
  helena_account_id text,          -- companyId da conta Helena (= idconta da URL)
  helena_token text,               -- Bearer token WTS.chat
  helena_panel_id text,            -- painel principal (fallback)
  helena_agendado_step_id text,    -- etapa que representa "Agendado"
  helena_steps jsonb,              -- cache das etapas [{ id, name }]
  helena_tags jsonb,               -- cache de etiquetas
  helena_panels jsonb,             -- painéis escolhidos no onboarding
  scheduled_message jsonb,         -- config do lembrete de agendamento (opcional)
  crm_enabled boolean, crm_api_key text,       -- espelho no CRM ContactIA
  provisionado_em timestamptz,     -- preenchida = veio do setup do CRM (enviadoEm do último retrato)
  envia_lembrete_de_consulta boolean, -- provisionada: o botão envia o lembrete de consulta
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
)

-- Credenciais Clinicorp por unidade (cada unidade pode ter painel/etapas próprios)
units (
  id uuid PRIMARY KEY,
  clinic_id uuid REFERENCES clinics(id),
  name text,                       -- ex: "Unidade Centro"
  position int,
  helena_panel_id text,            -- painel próprio (opcional; fallback = clínica)
  helena_agendado_step_id text,
  helena_steps jsonb,
  clinicorp_user text,
  clinicorp_token text,
  clinicorp_subscriber_id text,
  clinicorp_business_id bigint,
  clinicorp_code_link int,
  bookable_professional_ids jsonb, -- ids do Clinicorp agendáveis; null = todos
  crm_unit_id uuid,                -- unidade no CRM ContactIA
  provisionado_em timestamptz,     -- preenchida = veio do setup do CRM
  active boolean DEFAULT true
)

-- Dentistas (nome exibido no resumo do slot)
professionals (
  id uuid PRIMARY KEY,
  clinic_id uuid REFERENCES clinics(id),
  clinicorp_id text,
  name text,
  is_evaluator boolean,
  active boolean DEFAULT true
)
```

---

## Setup unificado: o cadastro vem do CRM

Desde a Etapa 15 do CRM ContactIA (ADR 0014 de lá, `Docs/ARCHITECTURE.md` seção 6), o setup do CRM é o único setup dos produtos. O botão recebe uma cópia do cadastro e continua agendando sozinho, sem chamar o CRM.

### Provisionamento (`POST /api/provisionamento`, CRM#217)

O worker do CRM manda o retrato inteiro da clínica ao salvar o cadastro com o produto ligado (e ao ligar ou desligar), e tenta de novo se falhar.

- **Autenticação:** `Authorization: Bearer <chave>`, a `BOTAO_CHAVE_DE_PROVISIONAMENTO` do CRM, comparada em tempo constante. Com a variável `CHAVE_DE_PROVISIONAMENTO` aqui, vale ela; sem ela, o sha256 do Bearer é comparado com a linha `provisionamento_sha256` da tabela `configuracao_do_servidor` (abaixo). Sem a variável e sem a linha: `503`. Chave errada: `401`.
- **Corpo:** `versao: 1`, `enviadoEm`, `companyId`, `nome`, `fusoHorario`, `ligado`, `tokenPlataforma`, `enviaLembreteDeConsulta`, `crm: { chaveDaApi, urlDaApi }` e `unidades[]` (`crmUnitId`, `nome`, `principal`, `ativa`, `clinicorp: { usuario, token, subscriberId, baseUrl, businessId, codeLink }`, `profissionaisAgendaveis: [{ id, nome }]`). Corpo fora disso: `400 { erro, codigo }`.
- **Resposta:** `200 { ok: true, clinicaId }` (`clinicaId: null` quando chega `ligado: false` de uma clínica que nunca esteve aqui; `ignorado: true` quando o retrato é mais velho que o aplicado).
- **O que grava,** de forma idempotente:
  - `clinics` pelo `helena_account_id`: `name`, `active` (= `ligado`, nunca apaga), `helena_token` (null não apaga o que existe), `envia_lembrete_de_consulta` e `provisionado_em` (= `enviadoEm`). A clínica que falta é criada, sem painel;
  - `crm.chaveDaApi` liga o espelho (`crm_enabled = true`, `crm_api_key`). Sem ela (`null`), fica a configuração que já está aqui, porque a chave só vem aberta no envio em que o CRM a criou;
  - `units` pelo `crm_unit_id`. Na primeira vez, adota a unidade cadastrada aqui que é o mesmo negócio do Clinicorp (`clinicorp_business_id`) ou tem o mesmo nome. Grava a credencial, o `business_id`, o `code_link`, `active` (= `ativa`) e os profissionais em `bookable_professional_ids` (lista vazia = `null` = todos). A unidade provisionada que não vem mais é desativada;
  - `fusoHorario`, `clinicorp.baseUrl`, `crm.urlDaApi` e o nome dos profissionais não são gravados: o botão usa o fuso fixo, a URL fixa do Clinicorp, a `CRM_API_URL` e os nomes ao vivo do Clinicorp.
- **No setup daqui,** a clínica e as unidades provisionadas têm o selo "do setup do CRM": o nome, o token, o status, a ligação com o CRM e as unidades só se leem, e as rotas admin recusam mudá-los. Os painéis, as etapas, as etiquetas e as mensagens do lembrete continuam aqui (decisão #212 do CRM em aberto).
- A clínica que chegou pelo CRM e ainda não teve o painel escolhido aqui não carrega no botão (`/api/clinic` responde `not_registered`).
- Precisa da migração `supabase/migrations/20261008120000_provisionamento_pelo_crm.sql` (ainda não aplicada).
- Teste: `api/_provisionamento.test.js` e, para a chave pela tabela, `api/_configuracao.test.js`.

### Um remetente do lembrete de consulta (CRM#218)

O setup do CRM escolhe quem envia o lembrete de consulta de cada clínica (o app de Lembretes, o CRM, o botão ou ninguém). Na clínica provisionada, o `scheduled_message` só agenda com `enviaLembreteDeConsulta: true`: sem isso, o `/api/clinic` não manda o lembrete à tela e o proxy recusa o `POST /chat/v1/scheduled-message`. A clínica que não veio do CRM segue como antes. Teste: `api/_scheduled-message.test.js`.

### Uma senha só (`GET /api/setup/entrar?t=`, CRM#219)

O setup do CRM gera, na hora do clique, um link curto e assinado para o setup daqui:

- **Token v 2 (Ed25519, o padrão quando o CRM tem `BOTAO_SETUP_CHAVE_PRIVADA`):** `base64url(JSON do payload) + "." + base64url(assinatura Ed25519 sobre o payload já codificado)`, com o payload `{ "v": 2, "tipo": "setup", "companyId": "<uuid>" | null, "exp": <unix segundos> }` e 120 segundos de validade. O CRM assina com a chave privada; aqui só mora a chave pública, na linha `setup_link_chave_publica` da tabela `configuracao_do_servidor`, conferida com `crypto.verify` do Node.
- **Token v 1 (HMAC, enquanto `SETUP_LINK_SEGREDO` existir):** `base64url(JSON do payload) + "." + base64url(HMAC-SHA256(SETUP_LINK_SEGREDO, payload já codificado))`, com `"v": 1` no mesmo payload. No CRM, o segredo é o `BOTAO_SETUP_SEGREDO`.
- **A rota** confere a assinatura em tempo constante, o `v`, o `tipo` e a validade, grava o cookie `sb_setup_sessao` (8 horas, `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/api`) e leva ao `/setup`, já na clínica do `companyId` (`/setup?clinica=<companyId>`). Link inválido ou vencido: `/setup?aviso=link_invalido`, sem dizer o motivo. Sem `SETUP_LINK_SEGREDO` e sem a chave pública na tabela: `503`.
- **O cookie da sessão** é assinado com o `SETUP_LINK_SEGREDO`; sem ele, com uma chave derivada da `SUPABASE_SERVICE_KEY` (HMAC-SHA256 com um rótulo fixo), que o servidor já tem. Trocar a service key só encerra as sessões abertas.
- **As rotas admin** aceitam a senha (`x-admin-key`) ou o cookie. `SETUP_SENHA_DESLIGADA=1` (ou `true`) desliga a senha, e a tela de entrar diz para abrir pelo setup do CRM. Desligar em produção só com OK da equipe.
- Teste: `api/_setup-token.test.js` (v 1) e `api/_setup-link-v2.test.js` (v 2).

### Configuração sem segredo na Vercel (`configuracao_do_servidor`, CRM#217 e CRM#219)

Ninguém precisa criar variável nova na Vercel para o provisionamento nem para o link do setup. O que o botão precisa saber fica na tabela `public.configuracao_do_servidor` (`chave`, `valor`, `atualizado_em`), com RLS ligado e nenhuma política: só a service role, que o servidor daqui já usa, lê e grava. Nenhum valor dela é segredo:

| `chave` | `valor` | Para quê |
|---|---|---|
| `provisionamento_sha256` | sha256 em hex (64 caracteres) da chave do provisionamento | sem `CHAVE_DE_PROVISIONAMENTO`, o `POST /api/provisionamento` compara o sha256 do Bearer com ele, em tempo constante |
| `setup_link_chave_publica` | chave pública Ed25519, SPKI em DER codificado em base64, numa linha (PEM também é aceito) | confere o link de setup v 2, que o CRM assina com a `BOTAO_SETUP_CHAVE_PRIVADA` |

O servidor guarda cada leitura por 60 segundos em memória: uma troca na tabela vale em até um minuto. As variáveis, quando existem, continuam valendo: `CHAVE_DE_PROVISIONAMENTO` ganha da linha `provisionamento_sha256`, e `SETUP_LINK_SEGREDO` mantém o link v 1 ao lado do v 2.

**A ordem para ligar** (cada passo em produção só com OK da equipe):

1. Aplicar `supabase/migrations/20261008180000_configuracao_do_servidor.sql` no projeto Schedule-button-v2 (e a `20261008120000_provisionamento_pelo_crm.sql`, se ainda não estiver).
2. No CRM, gerar o par Ed25519 e a chave do provisionamento (os comandos estão no `docs/deploy-vps.md` do CRM). A chave privada e a chave do provisionamento ficam só no `.env` do CRM.
3. Gravar a chave pública e o sha256 da chave do provisionamento aqui, pelo SQL editor do Supabase (como service role):

```sql
insert into public.configuracao_do_servidor (chave, valor) values
  ('setup_link_chave_publica', '<a chave pública: SPKI em DER, em base64, uma linha>'),
  ('provisionamento_sha256', '<sha256 em hex da BOTAO_CHAVE_DE_PROVISIONAMENTO do CRM>')
on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();
```

4. Só então pôr `BOTAO_SETUP_CHAVE_PRIVADA` e `BOTAO_CHAVE_DE_PROVISIONAMENTO` no `.env` do CRM e recriar os containers dele. Antes da linha aqui, o link v 2 cairia em "link inválido" e o provisionamento em `503`.
5. Conferir: o "Abrir o setup do Schedule Button" no setup do CRM abre o `/setup` daqui, e o estado do último envio ao botão fica "em dia".

O sha256 é o da chave exata, sem quebra de linha no fim: `printf %s "$BOTAO_CHAVE_DE_PROVISIONAMENTO" | sha256sum`.

---

## Painel admin (`/setup`)

Página protegida por senha server-side, ou aberta pelo link assinado do setup do CRM (acima). Abre na **lista de clínicas cadastradas**, com edição completa e cadastro de novas.

### Cadastro — wizard de 3 passos

```
1. Dados da clínica
   → nome + slug (gerado automaticamente, editável)

2. Helena / WTS.chat
   → cola o token → "Verificar" lista os painéis da conta
   → admin seleciona os painéis e, em cada um, a etapa que aciona o Clinicorp
     e as etiquetas que o operador pode aplicar
   → companyId (idconta) e etiquetas são detectados automaticamente
   → opcional: lembrete de agendamento (canal, modelo aprovado,
     variáveis e regra de envio)

3. Unidades Clinicorp (1 ou mais)
   → usuário + token da API por unidade
   → businessId e codeLink buscados automaticamente
   → opcional: painel Helena e etapa próprios da unidade
   → profissionais importados automaticamente
```

### Edição de clínica

- Nome, slug, token Helena (write-only), painéis/etapas/etiquetas, lembrete
- **Status da clínica**: ativar/desativar (inativa não carrega no botão)
- **Unidades**: criar, editar credenciais (token write-only), ativar/desativar;
  trocar credencial revalida businessId/codeLink no Clinicorp automaticamente;
  a última unidade ativa não pode ser desativada
- **Profissionais**: sincronizar novos com o Clinicorp e marcar dentistas avaliadores

Ao salvar, exibe a URL final:

```
https://schedule-button-xi.vercel.app/?idconta=XXXX&contactId=
```

O Helena substitui o `contactId` automaticamente ao abrir o botão a partir de uma conversa.

---

## Estrutura de pastas

```
src/
  components/
    Calendar.jsx      — Calendário mensal com navegação
    SlotPicker.jsx    — Lista de horários disponíveis do Clinicorp
    TagChips.jsx      — Chips de etiquetas do painel (cores reais do Helena)
  pages/
    Setup.jsx         — Painel admin (/setup): lista, edição e wizard de cadastro
    Setup.css
  services/
    helena.js         — Chamadas à API WTS.chat via /api/proxy
    clinicorp.js      — Chamadas ao handler /api/clinicorp
  utils/
    date.js           — Helpers toDateStr/toBrDate compartilhados
  App.jsx             — Fluxo do operador (2 etapas)
  App.css
  main.jsx            — Entry point (rota /setup vs app)

api/
  _supabase.js        — Client Supabase + queries de clínica/unidade
  _auth.js            — requireAdmin (x-admin-key vs ADMIN_PASSWORD, ou a sessão do link do CRM)
  _setup-token.js     — link assinado e sessão do setup (CRM#219)
  _provisionamento.js — conferência e gravação do retrato do CRM (CRM#217)
  _clinicorp.js       — fetchBusinessId/fetchProfessionals compartilhados
  _origin.js          — requireAllowedOrigin (prova de origem das rotas sem senha)
  _scheduled-message.js — normalizeScheduledMessage e clinicScheduledMessage (clinic.js e proxy.js)
  provisionamento.js  — POST /api/provisionamento, o worker do CRM entrega o cadastro
  setup/entrar.js     — GET /api/setup/entrar?t=, o setup do CRM abre o setup daqui
  clinic.js           — Config pública da clínica por idconta (sem tokens)
  proxy.js            — Proxy Helena (lista de caminhos, injeta token da clínica, resolve CORS)
  clinicorp.js        — Slots, dias disponíveis, histórico do paciente e agendamento
  setup.js            — Cadastro de clínica + unidades (auto-fetch de IDs)
  clinics.js          — Lista/detalhe/edição de clínicas + sync de profissionais (admin)
  units.js            — Criação/edição/ativação de unidades (admin)
  helena-preview.js   — Painéis, canais e modelos da conta Helena (admin)

Docs/
  clinicorp-api-docs/        — Documentação da API Clinicorp
  Documentação API Helena/   — Documentação da API WTS.chat/Helena
  ROADMAP.md                 — Próximos passos
  ARCHITECTURE.md            — Decisões de arquitetura
```

---

## Endpoints consumidos

### API WTS.chat (Helena CRM) — via `/api/proxy`
Base URL: `https://api.wts.chat`

O proxy só aceita estes caminhos e métodos (lista em `api/proxy.js`); qualquer outro volta 403.

| Método | Endpoint | Finalidade |
|---|---|---|
| GET | `/core/v1/contact/{id}` | Nome e telefone do contato |
| GET | `/core/v1/contact/phonenumber/{phone}` | Busca manual de contato por telefone |
| GET | `/crm/v1/panel/card?PanelId=...&ContactId=...&PageSize=1&PageNumber=1` | Verifica se já existe card |
| GET | `/crm/v2/panel?PageSize=100&IncludeDetails=Steps&IncludeDetails=Tags` | Etapas e etiquetas do painel |
| POST | `/crm/v1/panel/card` | Cria card (com `tagIds`) |
| PUT | `/crm/v2/panel/card/{id}` | Move card de etapa + atualiza `tagIds` (só `stepId`, `customFields`, `tagIds`) |
| POST | `/crm/v1/panel/card/{id}/note` | Adiciona anotação ao card |
| POST | `/chat/v1/scheduled-message` | Agenda o lembrete de WhatsApp (só modelo e canal do Setup) |

### API Clinicorp — via `/api/clinicorp`
Base URL: `https://api.clinicorp.com/rest/v1`

| Método | Endpoint | Finalidade |
|---|---|---|
| GET | `/appointment/get_avaliable_days` | Dias com agenda aberta (calendário) |
| GET | `/appointment/get_avaliable_times_calendar` | Horários disponíveis por data |
| GET | `/appointment/list?patientId=...` | Histórico de agendamentos do paciente |
| GET | `/patient/get?Phone=...` | Busca paciente pelo telefone |
| POST | `/patient/create` | Cria paciente se não existir |
| POST | `/appointment/create_appointment_by_api` | Cria o agendamento |
| GET | `/business/list` | businessId/codeLink no onboarding e na troca de credencial |
| GET | `/professional/list_all_professionals` | Importa/sincroniza dentistas |

---

## Como rodar localmente

As Vercel Functions precisam rodar junto com o frontend — use o Vercel CLI:

```bash
npm install
npm i -g vercel        # se ainda não tiver
vercel dev             # sobe frontend + functions com .env.local
```

`.env.local` necessário:

```
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
ADMIN_PASSWORD=...
```

`EMBED_HOSTS` não faz falta no local: o `vercel dev` serve tela e funções no mesmo endereço, e o próprio host é aceito.

Teste com clínica e contato reais:

```
http://localhost:3000?idconta=<ID_CONTA_HELENA>&contactId=<UUID_DO_CONTATO>
```

Sem `contactId`, o passo 1 mostra a busca manual de contato por telefone — dá para vincular um contato do CRM ou seguir sem vínculo.

```bash
npm run lint    # ESLint (zero problemas)
npm test        # testes das funções (api/*.test.js)
npm run build   # build de produção
```

---

## Deploy

Push na branch `main` do repositório `contactIA/Schedule-button` → deploy automático na Vercel.

- Funções em `api/` viram Serverless Functions (timeouts por função em `vercel.json`)
- Rewrite de `/setup` → SPA configurado em `vercel.json`
- Variáveis de ambiente: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ADMIN_PASSWORD`
  (`VITE_ADMIN_PASSWORD` é obsoleta e pode ser removida do dashboard)
- Opcionais: `CRM_API_URL` e `EMBED_HOSTS` (hosts aceitos além do próprio app, separados
  por vírgula, ex. `app.fluxodonto.com`; vazio = só o próprio app, que é o que o botão usa)
- Setup unificado (a equipe preenche, ver `.env.example`):
  - nenhuma é obrigatória: sem elas, o botão lê a tabela `configuracao_do_servidor` (ver
    "Configuração sem segredo na Vercel");
  - `CHAVE_DE_PROVISIONAMENTO` (opcional): a chave de serviço do `POST /api/provisionamento`,
    igual à `BOTAO_CHAVE_DE_PROVISIONAMENTO` do CRM; ganha da linha `provisionamento_sha256`;
  - `SETUP_LINK_SEGREDO` (opcional): o segredo do link v 1, igual ao `BOTAO_SETUP_SEGREDO`
    do CRM; sem ele, só o link v 2 (chave pública na tabela) e a senha entram;
  - `SETUP_SENHA_DESLIGADA`: `1` ou `true` desligam a entrada por senha (só com OK da equipe).

---

## Roadmap

🎉 **Roadmap v1 concluído em junho/2026** — todas as iniciativas planejadas foram entregues. Ver `Docs/ROADMAP.md` para o histórico completo.

---

## Changelog

### 2026-10-08: Setup unificado (Etapa 15 do CRM)

- **Provisionamento** pelo setup do CRM em `POST /api/provisionamento` (CRM#217), com a chave `CHAVE_DE_PROVISIONAMENTO` e a migração `20261008120000_provisionamento_pelo_crm.sql` (não aplicada)
- O setup mostra só para leitura o que vem do CRM
- **Um remetente do lembrete de consulta** (CRM#218): na clínica provisionada, o botão só agenda o lembrete quando o CRM o escolheu
- **Link assinado do setup** (CRM#219) em `GET /api/setup/entrar?t=`, com `SETUP_LINK_SEGREDO`, e `SETUP_SENHA_DESLIGADA` para desligar a senha
- **Sem segredo na Vercel** (CRM#217, CRM#219): a tabela `configuracao_do_servidor` (migração `20261008180000_configuracao_do_servidor.sql`, não aplicada) guarda o sha256 da chave do provisionamento e a chave pública do link de setup v 2, assinado com Ed25519

### 2026-10-07 — Rotas do operador fechadas

- **Proxy com lista de caminhos**: só os caminhos e métodos que o botão usa, com ids e query conferidos e o caminho remontado
- **Prova de origem** em `/api/clinic`, `/api/proxy`, `/api/clinicorp`, `/api/crm` e `/api/reminder-log` (variável opcional `EMBED_HOSTS`)
- Teste de que o `/api/clinic` não devolve token nem credencial

### 2026-06-11 — Roadmap v1 concluído

- **Dias com agenda aberta no calendário**: dias sem disponibilidade no Clinicorp aparecem desabilitados (`get_avaliable_days`); sem dado, o calendário segue todo clicável
- **Filtro por dentista nos horários**: chips "Qualquer disponível" + primeiro nome de cada profissional, exibidos só com 2+ dentistas no dia
- **Painel admin fases 2 e 3**: editor de unidades (criar, editar credenciais write-only, ativar/desativar, revalidação automática de businessId/codeLink), marcação de dentistas avaliadores com sync do Clinicorp e toggle de clínica ativa/inativa
- **Busca manual de contato por telefone**: uso sem `contactId` na URL (ex.: ligação inbound), com vínculo/desvínculo do contato encontrado
- **Histórico do paciente**: resumo compacto dos agendamentos no Clinicorp abaixo do campo de telefone (debounce de 700ms)
- Docs atualizadas (CLAUDE.md multi-tenant, ROADMAP fechado) e lint zerado

### 2026-06-10 (noite) — Lembrete de agendamento via WhatsApp

- Config por clínica (jsonb `clinics.scheduled_message`): canal, modelo aprovado, mapeamento de variáveis ([NOME] → nome do paciente etc.) e regra de envio (véspera às HH:MM, X horas antes ou logo após)
- Envio via app "Mensagens agendadas" do Helena após o Clinicorp confirmar; falha no lembrete nunca desfaz card/agendamento
- Painel admin: auth server-side (`ADMIN_PASSWORD` via `x-admin-key`), lista de clínicas e edição (fase 1)

### 2026-06-10 — Etiquetas no card + lint zerado

- **Etiquetas do painel aplicáveis ao card** na tela de agendamento: chips com as cores reais do Helena na etapa 2; card novo recebe `tagIds` na criação, card existente mescla com as etiquetas já presentes
- Correção de dois `ReferenceError` (troca de unidade no app e campo de token no setup)
- ESLint zerado: globals Node em `api/`, `Docs/` ignorado, landing órfã removida, refactor de hooks no `App.jsx` (fetch por eventos em vez de setState síncrono em effects)

### 2026-06-05 a 06-09 — White-label

- Multi-tenant via Supabase: tabelas `clinics`, `units` e `professionals`
- Identificação por `?idconta=` (companyId Helena), detectado automaticamente no onboarding
- Onboarding `/setup` em 3 passos com auto-fetch (painéis, etapas, etiquetas, businessId, codeLink, profissionais)
- Suporte a múltiplas unidades Clinicorp por clínica (credenciais e painel próprios)
- Multi-painel: admin escolhe painéis e a etapa "Agendado" de cada um; painel derivado da unidade no runtime
- Gradiente roxo→vermelho da marca em todo o app

### 2026-06-03 — Estrutura, correções e planejamento multi-tenant

- Telefone remove automaticamente o prefixo `+55` da API Helena
- Cor do agendamento `#ffff00` (AVALIAÇÃO) via `list_categories`
- Bug `Invalid time value` corrigido (`normTime` restaurada)
- Componentes extraídos para `src/components/`, serviços para `src/services/`
- `README.md`, `CLAUDE.md`, `Docs/ROADMAP.md` e `Docs/ARCHITECTURE.md` criados

### Histórico anterior

| Commit | Descrição |
|---|---|
| `fe2e45d` | Initial commit |
| `2274f9e` | Fix CORS error em produção |
| `4cae118` | Fallback: busca card por nome do contato |
| `91f1e07` | Logs detalhados de erro na API |
| `4c00db7` | Proxy Vercel serverless para resolver CORS no PUT |
| `4a14ea4` | Tags aplicadas ao card na criação/atualização |
| `12c721d` | Tag "Agendado" incluída por padrão |
| `f3d4d5a` | Fix: aplica etiquetas no contato (não no card) |
| `ef6affe` | Fix: remove falso positivo na busca de card por nome |
| `eba250a` | Redesign: fluxo em 2 etapas + fix erro 400 Clinicorp |
| `f266840` | Sincronização de arquivos |
| `021e0bd` | Fix vercel.json — rewrites não podem sobrescrever functions |
| `f7d27f4` | Fix HTTP 500 (panelId no createCard), remove rewrite conflitante |
| `a5259e9` | Restaura filtro de agenda para Dr. Alex, melhora UI de horários |
| `e7ecb40` | Fix resolução de import ESM e shim no plugin local |
| `8073b91` | Fix proxy 500 e atualiza endpoint Clinicorp |
| `8693142` | Força Node.js 20 no Vercel para fetch nativo |
| `f8c8bc2` | Remove runtime inválido do vercel.json |
| `9a0d8d7` | Remove tagIds do createCard (fix erro 500 WTS.chat) |
| `2a70915` | Fix campos do payload create_online_scheduling |
| `e70b3df` | Fix payload create_online_scheduling conforme schema |
| `d2246d9` | Visual: fluxo em 2 etapas, detecção de número privado |
| `c9149f2` | Fix: envia data/hora separados na API Clinicorp |
| `a3b93e8` | Fix: fluxo completo de paciente + correções no agendamento |
| `f10ee23` | Fix: troca endpoint para `create_appointment_by_api` |
| `e2ad81b` | Feat: `CategoryColor` e `CategoryDescription` no agendamento |
