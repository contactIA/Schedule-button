# Schedule Button — Botão de Agendamento

Ferramenta multi-tenant para criação rápida de cards no CRM Helena e agendamentos no Clinicorp. Projetada para ser usada por operadores de CRC (Central de Relacionamento com o Cliente) de clínicas odontológicas.

---

## O que faz

O operador abre a tela a partir de um contato no WhatsApp (via URL com `?clinic=slug&contactId=...`), preenche os dados do paciente e escolhe um horário disponível na agenda da clínica. Com um único clique, o sistema:

1. Cria ou atualiza o card do paciente no funil CRM (Helena/WTS.chat)
2. Aplica etiquetas de segmentação ao contato
3. Cria o agendamento diretamente na agenda do Clinicorp

Cada clínica é identificada por um `slug` único na URL. Suas credenciais, etapas, etiquetas e profissionais ficam armazenados no banco de dados — nenhum dado é hardcoded no código.

---

## Stack

| Camada | Tecnologia | Motivo |
|---|---|---|
| Frontend | React 19 + Vite | Componentes reativos, build rápido |
| Estilo | CSS customizado | Sem dependência de framework externo |
| Backend | Vercel Functions (Node.js) | Serverless, zero infra, integração nativa com Vite |
| Banco de dados | Supabase (PostgreSQL) | Multi-tenant: config por clínica, acesso via API REST |
| Deploy | Vercel | Deploy automático via git push |

---

## Arquitetura multi-tenant

Um único deploy atende múltiplas clínicas. A clínica é identificada pelo parâmetro `?clinic=` na URL:

```
https://app.contactia.com.br?clinic=clinica-abc&contactId=uuid-do-contato
https://app.contactia.com.br?clinic=clinica-xyz&contactId=uuid-do-contato
```

O handler Vercel lê o `clinic`, busca as credenciais no Supabase e opera com elas. Nenhuma credencial fica no código-fonte.

### Schema do banco (Supabase)

```sql
-- Configuração por clínica
clinics (
  id uuid PRIMARY KEY,
  slug text UNIQUE,           -- identificador na URL
  name text,                  -- nome da clínica
  helena_token text,          -- Bearer token WTS.chat (criptografado)
  helena_panel_id text,       -- UUID do painel CRM
  helena_steps jsonb,         -- { crcA: uuid, crcB: uuid }
  helena_tags jsonb,          -- { Agendado: uuid, Alta: uuid, ... }
  clinicorp_auth text,        -- Basic base64(usuario:token) (criptografado)
  clinicorp_subscriber_id text,
  clinicorp_business_id bigint,
  clinicorp_code_link int,
  clinicorp_category_color text,
  clinicorp_category_description text,
  created_at timestamptz DEFAULT now()
)

-- Profissionais por clínica
professionals (
  id uuid PRIMARY KEY,
  clinic_id uuid REFERENCES clinics(id),
  clinicorp_id text,          -- ID numérico do Clinicorp
  name text,
  is_evaluator boolean,       -- aparece no seletor de dentista
  active boolean DEFAULT true
)
```

---

## Onboarding de uma nova clínica

O processo requer apenas **3 inputs** do administrador. Tudo mais é buscado automaticamente via API:

### Inputs necessários
| # | Input | Onde encontrar |
|---|---|---|
| 1 | **Token Helena** | Painel Helena → Configurações → API |
| 2 | **Usuário API Clinicorp** | Clinicorp → Sistema → Gerenciar Assinatura → Acesso Externo |
| 3 | **Token API Clinicorp** | Mesma tela acima |

### O que é buscado automaticamente

**Do Token Helena:**
```
GET /crm/v1/panel           → lista painéis → admin seleciona 1
GET /crm/v1/panel/{id}      → retorna etapas do funil automaticamente
GET /core/v1/tag/list       → retorna etiquetas → admin seleciona quais usar
```

**Do Usuário + Token Clinicorp:**
```
GET /group/list_clinics                       → retorna subscriber_id e unidades
GET /business/list                            → retorna BUSINESS_ID e CODE_LINK
GET /professional/list_all_professionals      → retorna dentistas → admin marca avaliadores
GET /appointment/list_categories              → retorna categorias → admin escolhe padrão
```

### Fluxo do painel admin (`/setup`)

```
1. Cola Token Helena
   → sistema lista painéis disponíveis
   → admin seleciona painel + etapas (qual coluna é CRC A, qual é CRC B)
   → admin seleciona tags a usar

2. Cola Usuário + Token Clinicorp
   → sistema lista unidades da clínica
   → admin seleciona unidade
   → admin marca quais profissionais fazem avaliação
   → admin escolhe categoria padrão de agendamento

3. Sistema gera slug, salva no banco
   → retorna URL final: https://app.contactia.com.br?clinic=slug-gerado
```

---

## Multi-dentista avaliador

Clínicas com mais de um dentista realizando avaliações têm o seletor de profissional integrado ao step 2 (calendário). O operador filtra por dentista antes de ver os horários — ou seleciona "Qualquer disponível" para ver todos os slots.

Para clínicas com apenas 1 dentista avaliador, o filtro não é exibido.

---

## Estrutura de pastas

```
src/
  components/
    Calendar.jsx      — Calendário mensal com navegação
    SlotPicker.jsx    — Lista de horários disponíveis do Clinicorp
    TagChips.jsx      — Chips de etiquetas do contato
  services/
    helena.js         — Chamadas à API WTS.chat (contatos, cards, etiquetas)
    clinicorp.js      — Chamadas ao handler /api/clinicorp (slots e agendamento)
  utils/
    date.js           — Helper toDateStr compartilhado
  config.js           — Constantes estáticas (substituído por Supabase no multi-tenant)
  App.jsx             — Componente raiz — orquestra o fluxo de etapas
  App.css             — Estilos da aplicação
  main.jsx            — Entry point do React

api/
  clinicorp.js        — Handler Vercel: busca horários e cria agendamentos no Clinicorp
  proxy.js            — Handler Vercel: proxy para a API Helena (evita CORS em produção)

Docs/
  clinicorp-api-docs/ — Documentação completa da API Clinicorp (49 endpoints)
  Documentação API Helena/ — Documentação completa da API WTS.chat/Helena
  ROADMAP.md          — Próximos passos e melhorias planejadas
  ARCHITECTURE.md     — Decisões de arquitetura e discussões de design
```

---

## Endpoints consumidos

### API WTS.chat (Helena CRM)
Base URL: `https://api.wts.chat`

| Método | Endpoint | Finalidade |
|---|---|---|
| GET | `/core/v1/contact/{id}` | Busca nome e telefone do contato |
| GET | `/crm/v1/panel/card?ContactId=...` | Verifica se já existe card para o contato |
| POST | `/crm/v1/panel/card` | Cria novo card no funil |
| PUT | `/crm/v2/panel/card/{id}` | Move card para nova etapa |
| POST | `/crm/v1/panel/card/{id}/note` | Adiciona anotação ao card |
| POST | `/core/v1/contact/{id}/tags` | Aplica etiquetas ao contato |

### API Clinicorp
Base URL: `https://api.clinicorp.com/rest/v1`

| Método | Endpoint | Finalidade |
|---|---|---|
| GET | `/appointment/get_avaliable_times_calendar` | Lista horários disponíveis por data |
| GET | `/patient/get?Phone=...` | Busca paciente pelo telefone |
| POST | `/patient/create` | Cria paciente se não existir |
| POST | `/appointment/create_appointment_by_api` | Cria o agendamento na agenda |

---

## Como rodar localmente

```bash
npm install
npm run dev
# Abre em http://localhost:5175
```

Em desenvolvimento, o Vite proxeia `/api/core` e `/api/crm` para `https://api.wts.chat` via plugin customizado em `vite.config.js`.

Teste com clínica e contato reais:
```
http://localhost:5175?clinic=<slug>&contactId=<UUID_DO_CONTATO>
```

---

## Deploy

Push na branch `main` → deploy automático na Vercel.

- Funções em `api/` viram Serverless Functions
- Timeout de 15s configurado em `vercel.json`
- Node.js 20 requerido
- Variáveis de ambiente necessárias: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`

---

## Changelog

### 2026-06-03 — Sprint de estrutura, correções e planejamento multi-tenant

**Produto:**
- Número de telefone remove automaticamente o prefixo `+55` da API Helena
- Cor do agendamento no Clinicorp alterada para `#ffff00` (AVALIAÇÃO) via consulta à `list_categories`
- Bug `Invalid time value` corrigido — `normTime` restaurada (API Clinicorp retorna `"8:0"` sem zero)

**Arquitetura:**
- Projeto redesenhado como **multi-tenant**: uma instância para múltiplas clínicas
- Decisão: Opção B (banco de dados Supabase + slug por clínica) ao invés de um deploy por clínica
- Onboarding planejado para exigir apenas 3 inputs (token Helena + usuário/token Clinicorp), com auto-fetch do restante
- Seletor de dentista avaliador planejado para clínicas multi-profissional

**Refatoração:**
- Componentes extraídos para `src/components/`: `Calendar.jsx`, `SlotPicker.jsx`, `TagChips.jsx`
- API movida para `src/services/`: `helena.js`, `clinicorp.js`
- Helper `toDateStr` extraído para `src/utils/date.js`
- `src/api.js` e `get_tags.js` deletados (arquivos mortos)

**Documentação:**
- `README.md` reescrito como genérico (removidas referências à Prime Odonto)
- `CLAUDE.md` criado com contexto completo para o agente de IA
- `Docs/ROADMAP.md` criado com 7 iniciativas priorizadas
- `Docs/ARCHITECTURE.md` criado com decisões de design e justificativas

---

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
