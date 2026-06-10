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
  • Números privados/mascarados (@lid) exigem preenchimento manual
  • Se o contato já tem card aberto → fluxo vira "Mover Card"
  • Seletor de unidade (visível apenas com 2+ unidades)
  • Campo livre de observações

Etapa 2 — Calendário
  • Navegação por mês; clique no dia busca horários no Clinicorp em tempo real
  • Slots exibidos por dentista (ex: 08:00 → 09:00 · Alex)
  • Etiquetas do painel como chips clicáveis (cores reais do Helena)
  • Confirma com ou sem horário:
      "Criar Card + Agendar" / "Mover Card sem Horário" etc.
```

### O que acontece no submit

1. Busca card existente do contato → **cria** (com `tagIds`) ou **move** para a etapa "Agendado" configurada
2. Etiquetas selecionadas são **mescladas** com as que o card já tem — nada é removido
3. Se houver slot: busca paciente no Clinicorp pelo telefone → cria se não existir → cria o agendamento (cor e categoria configuráveis por unidade; padrão `#ffff00` / `AVALIAÇÃO`)

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

As únicas variáveis de ambiente na Vercel são `SUPABASE_URL` e `SUPABASE_SERVICE_KEY` (mais `VITE_ADMIN_PASSWORD`, que protege apenas a UI do `/setup`).

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
  clinicorp_category_color text,        -- padrão '#ffff00'
  clinicorp_category_description text,  -- padrão 'AVALIAÇÃO'
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

## Onboarding de uma nova clínica (`/setup`)

Página protegida por senha. Wizard de 3 passos:

```
1. Dados da clínica
   → nome + slug (gerado automaticamente, editável)

2. Helena / WTS.chat
   → cola o token → "Verificar" lista os painéis da conta
   → admin seleciona os painéis e, em cada um, a etapa que aciona o Clinicorp
   → companyId (idconta) e etiquetas são detectados automaticamente

3. Unidades Clinicorp (1 ou mais)
   → usuário + token da API por unidade
   → businessId e codeLink buscados automaticamente
   → opcional: painel Helena e etapa próprios da unidade
   → profissionais importados automaticamente
```

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
    Setup.jsx         — Onboarding admin (/setup): senha + wizard de 3 passos
    Setup.css
  services/
    helena.js         — Chamadas à API WTS.chat via /api/proxy
    clinicorp.js      — Chamadas ao handler /api/clinicorp
  utils/
    date.js           — Helper toDateStr compartilhado
  App.jsx             — Fluxo do operador (2 etapas)
  App.css
  main.jsx            — Entry point (rota /setup vs app)

api/
  _supabase.js        — Client Supabase + queries de clínica/unidade
  clinic.js           — Config pública da clínica por idconta (sem tokens)
  proxy.js            — Proxy Helena (injeta token da clínica, resolve CORS)
  clinicorp.js        — Horários disponíveis + criação de paciente/agendamento
  setup.js            — Cadastro de clínica + unidades (auto-fetch de IDs)
  helena-preview.js   — Valida token Helena e lista painéis/etapas (wizard)

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

| Método | Endpoint | Finalidade |
|---|---|---|
| GET | `/core/v1/contact/{id}` | Nome e telefone do contato |
| GET | `/crm/v1/panel/card?ContactId=...` | Verifica se já existe card |
| GET | `/crm/v2/panel?IncludeDetails=Steps,Tags` | Etapas e etiquetas do painel |
| POST | `/crm/v1/panel/card` | Cria card (com `tagIds`) |
| PUT | `/crm/v2/panel/card/{id}` | Move card de etapa + atualiza `tagIds` |
| POST | `/crm/v1/panel/card/{id}/note` | Adiciona anotação ao card |

### API Clinicorp — via `/api/clinicorp`
Base URL: `https://api.clinicorp.com/rest/v1`

| Método | Endpoint | Finalidade |
|---|---|---|
| GET | `/appointment/get_avaliable_times_calendar` | Horários disponíveis por data |
| GET | `/patient/get?Phone=...` | Busca paciente pelo telefone |
| POST | `/patient/create` | Cria paciente se não existir |
| POST | `/appointment/create_appointment_by_api` | Cria o agendamento |
| GET | `/business/list` | businessId/codeLink no onboarding |
| GET | `/professional/list_all_professionals` | Importa dentistas no onboarding |

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
VITE_ADMIN_PASSWORD=...
```

Teste com clínica e contato reais:

```
http://localhost:3000?idconta=<ID_CONTA_HELENA>&contactId=<UUID_DO_CONTATO>
```

Sem `contactId`, o formulário funciona mas não pré-preenche nome/telefone nem vincula ao contato no CRM.

```bash
npm run lint    # ESLint (zero problemas)
npm run build   # build de produção
```

---

## Deploy

Push na branch `main` do repositório `contactIA/Schedule-button` → deploy automático na Vercel.

- Funções em `api/` viram Serverless Functions (timeouts por função em `vercel.json`)
- Rewrite de `/setup` → SPA configurado em `vercel.json`
- Variáveis de ambiente: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `VITE_ADMIN_PASSWORD`

---

## Roadmap (resumo)

Ver `Docs/ROADMAP.md` para a lista completa.

- Painel de edição de clínicas já cadastradas no `/setup`
- Seletor de dentista avaliador no calendário (filtro por profissional)
- Confirmação automática por WhatsApp após o agendamento
- Dias sem disponibilidade desabilitados no calendário
- Busca manual de contato por telefone (uso sem `contactId`)

---

## Changelog

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
