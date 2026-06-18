# CLAUDE.md — Schedule Button (Prime Agendamento)

Contexto e convenções para o agente de IA neste projeto.

---

## O que é o projeto

Ferramenta multi-tenant para clínicas odontológicas. Operadores do CRC abrem a tela a partir de um contato no WhatsApp (URL com `?idconta=...&contactId=...`) e criam cards no CRM Helena + agendamentos no Clinicorp em um fluxo de 2 etapas. Também funciona sem `contactId` (busca manual de contato por telefone).

Administradores cadastram e editam clínicas em `/setup` (senha em `ADMIN_PASSWORD`).

---

## Stack

- **React 19 + Vite** no frontend
- **Vercel Functions** como backend serverless (pasta `api/`)
- **Supabase** (Postgres) como banco multi-tenant: tabelas `clinics`, `units`, `professionals`
- **CSS customizado** — sem Tailwind, sem MUI, sem styled-components
- Sem TypeScript — projeto em JavaScript puro
- Sem react-router — `src/main.jsx` roteia `/setup` vs app pela `window.location.pathname`

---

## Arquitetura

```
src/components/   → Componentes visuais puros (Calendar, SlotPicker, TagChips)
src/pages/        → Setup.jsx (painel admin: cadastro, edição, unidades, avaliadores)
src/services/     → Chamadas a APIs externas (helena.js, clinicorp.js)
src/utils/        → Helpers puros (date.js)
api/clinic.js     → Config pública da clínica por ?idconta= (runtime do botão)
api/clinicorp.js  → Slots, dias disponíveis, histórico e criação de agendamento
api/proxy.js      → Proxy das chamadas à API Helena (resolve CORS + injeta token)
api/setup.js      → Cadastro de clínica (admin)
api/clinics.js    → Lista/detalhe/edição de clínicas, sync de profissionais (admin)
api/units.js      → Criação/edição/ativação de unidades (admin)
api/helena-preview.js → Painéis, canais e modelos da conta Helena (admin)
api/_supabase.js  → Cliente Supabase + queries compartilhadas (não vira função)
api/_clinicorp.js → fetchBusinessId/fetchProfessionals compartilhados
api/_auth.js      → requireAdmin (header x-admin-key vs ADMIN_PASSWORD)
```

O frontend nunca chama Clinicorp/Helena diretamente — sempre via `api/`. Tokens (Helena e Clinicorp) são write-only nas rotas admin: entram via POST/PUT mas nunca voltam em GET.

---

## Credenciais e configuração

| O quê | Onde |
|---|---|
| Token Helena da clínica | Supabase `clinics.helena_token` |
| Credenciais Clinicorp | Supabase `units.clinicorp_user/token/subscriber_id` |
| Conexão Supabase | env vars `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` |
| Senha do painel admin | env var `ADMIN_PASSWORD` (server-side, fail-closed) |

A clínica é identificada por `?idconta=` (companyId da conta Helena → `clinics.helena_account_id`).

---

## Convenções de código

- Sem comentários desnecessários — só WHY quando não é óbvio
- Componentes em `PascalCase.jsx`, serviços em `camelCase.js`
- Sem abstrações prematuras — 3 linhas repetidas não justificam um helper
- Erros de API logam no console com prefixo `[NomeDoServico]` para facilitar debug
- Falhas em recursos informativos (histórico, disponibilidade, lembrete) nunca bloqueiam o fluxo principal

---

## Como testar localmente

```bash
npm install
npm run dev
# http://localhost:5175?idconta=<companyId>&contactId=<UUID>
```

Sem `contactId`, o passo 1 mostra busca manual de contato por telefone. As Vercel Functions precisam das env vars do Supabase — use `vercel dev` ou defina-as no ambiente.

---

## Deploy

Push na branch `main` → deploy automático na Vercel. Não há CI/CD adicional.

---

## Particularidades de API que custaram caro descobrir

1. `date` do `create_appointment_by_api` vai como `T03:00:00.000Z` — convenção da própria doc Clinicorp (Brasil = UTC-3 fixo, sem horário de verão desde 2019)
2. `get_avaliable_days` ignora `fromDate`/`toDate` e devolve a janela do agendamento online
3. Busca de card no Helena exige `PanelId` — sem ele retorna 500 e o app criaria card duplicado
4. Busca de contato por telefone na Helena é `GET /core/v1/contact/phonenumber/{phone}` (path, não query)
5. Envio de mensagem na Helena exige DDI 55; a UI trabalha sem o 55
6. `templateParams` da mensagem agendada (Helena) exige envelope `{ parameters: { "[NOME]": valor, ... }, file: null }` — objeto plano com as variáveis é silenciosamente ignorado (sai com placeholders vazios). A chave de cada variável é o nome exato do param do modelo, com colchetes e acentos (`[HORÁRIO]`)

Documentação local: `Docs/clinicorp-api-docs/` e `Docs/Documentação API Helena/`.

---

## Débitos técnicos conhecidos

1. env var `VITE_ADMIN_PASSWORD` obsoleta na Vercel — remover manualmente no dashboard
