# Prime Agendamento — Schedule Button

Ferramenta interna para criação rápida de cards no CRM Helena e agendamentos no Clinicorp. Usada pelos operadores do CRC (Central de Relacionamento com o Cliente) da Prime Odonto Center.

---

## O que faz

O operador abre a tela a partir de um contato no WhatsApp (via URL com `?contactId=...`), preenche os dados do paciente e escolhe um horário disponível na agenda da clínica. Com um único clique, o sistema:

1. Cria ou atualiza o card do paciente no funil CRM (Helena/WTS.chat)
2. Aplica etiquetas de segmentação ao contato
3. Cria o agendamento diretamente na agenda do Clinicorp

---

## Stack

| Camada | Tecnologia | Motivo |
|---|---|---|
| Frontend | React 19 + Vite | Componentes reativos, build rápido |
| Estilo | CSS customizado | Sem dependência de framework externo |
| Backend | Vercel Functions (Node.js) | Serverless, zero infra, integração nativa com Vite |
| Deploy | Vercel | Deploy automático via git push |

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
  config.js           — Constantes: token, IDs de etapas, tags, profissionais
  App.jsx             — Componente raiz — orquestra o fluxo de 2 etapas
  App.css             — Estilos da aplicação
  main.jsx            — Entry point do React

api/
  clinicorp.js        — Handler Vercel: busca horários e cria agendamentos no Clinicorp
  proxy.js            — Handler Vercel: proxy para a API Helena (evita CORS em produção)

Docs/
  clinicorp-api-docs/ — Documentação completa da API Clinicorp (49 endpoints)
  Documentação API Helena/ — Documentação completa da API WTS.chat/Helena
  ROADMAP.md          — Próximos passos e melhorias planejadas
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
| PUT | `/crm/v2/panel/card/{id}` | Move card para nova etapa (CRC A ou CRC B) |
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

## Configuração

### Credenciais Helena (`src/config.js`)
```js
TOKEN    // Bearer token da API WTS.chat
PANEL_ID // UUID do painel CRM
STEPS    // UUIDs das etapas CRC A e CRC B
TAGS     // UUIDs das etiquetas usadas
```

### Credenciais Clinicorp (`api/clinicorp.js`)
```js
AUTH          // Basic Auth: usuario:token (Base64)
SUBSCRIBER_ID // CNPJ da clínica (sem pontuação)
BUSINESS_ID   // ID da unidade no Clinicorp
CODE_LINK     // Código de link de agendamento online
```

> Credenciais hardcoded são débito técnico. Migração para variáveis de ambiente está no roadmap (`Docs/ROADMAP.md`).

---

## Como rodar localmente

```bash
npm install
npm run dev
# Abre em http://localhost:5175
```

Em desenvolvimento, o Vite proxeia `/api/core` e `/api/crm` para `https://api.wts.chat` via plugin customizado em `vite.config.js`.

Para testar com um contato real: `http://localhost:5175?contactId=<UUID_DO_CONTATO>`

---

## Deploy

Push na branch `main` → deploy automático na Vercel.

- Funções em `api/` viram Serverless Functions
- Timeout de 15s configurado em `vercel.json`
- Node.js 20 requerido

---

## Changelog

### 2026-06-03 — Sprint de estrutura e correções (hoje)

**Correções:**
- Número de telefone do contato agora remove automaticamente o prefixo `+55` retornado pela API Helena
- Cor do agendamento no Clinicorp alterada de `#FF5733` (laranja) para `#ffff00` (amarelo) com categoria `AVALIAÇÃO`, escolhida após consulta ao endpoint `list_categories` da API Clinicorp
- `normTime` restaurada em `api/clinicorp.js` — a API Clinicorp retorna horários sem zero à esquerda (ex: `"8:0"`), o que causava erro `Invalid time value` ao construir a data

**Reestruturação:**
- Componentes extraídos de `App.jsx` para `src/components/`: `Calendar.jsx`, `SlotPicker.jsx`, `TagChips.jsx`
- Lógica de API movida para `src/services/`: `helena.js` (WTS.chat) e `clinicorp.js` (Clinicorp)
- Helper `toDateStr` extraído para `src/utils/date.js` e compartilhado entre `App.jsx` e `Calendar.jsx`
- `src/api.js` (arquivo morto) e `get_tags.js` (script pontual) deletados

**Documentação:**
- `README.md` reescrito do zero com stack, estrutura, endpoints, configuração e instruções
- `CLAUDE.md` criado com contexto completo do projeto para o agente de IA
- `Docs/ROADMAP.md` criado com 7 iniciativas priorizadas em 3 níveis

---

### Histórico anterior

| Data aprox. | Commit | Descrição |
|---|---|---|
| Inicial | `fe2e45d` | Initial commit |
| — | `2274f9e` | Fix CORS error em produção |
| — | `4cae118` | Fallback: busca card por nome do contato |
| — | `91f1e07` | Logs detalhados de erro na API |
| — | `4c00db7` | Proxy Vercel serverless para resolver CORS no PUT |
| — | `4a14ea4` | Tags aplicadas ao card na criação/atualização |
| — | `12c721d` | Tag "Agendado" incluída por padrão |
| — | `f3d4d5a` | Fix: aplica etiquetas no contato (não no card) |
| — | `ef6affe` | Fix: remove falso positivo na busca de card por nome |
| — | `eba250a` | Redesign: fluxo em 2 etapas + fix erro 400 Clinicorp |
| — | `f266840` | Sincronização de arquivos |
| — | `021e0bd` | Fix vercel.json — rewrites não podem sobrescrever functions |
| — | `f7d27f4` | Fix HTTP 500 (panelId no createCard), remove rewrite conflitante |
| — | `a5259e9` | Restaura filtro de agenda para Dr. Alex, melhora UI de horários |
| — | `e7ecb40` | Fix resolução de import ESM e shim de res.status no plugin local |
| — | `8073b91` | Fix proxy 500 e atualiza endpoint Clinicorp |
| — | `8693142` | Força Node.js 20 no Vercel para fetch nativo |
| — | `f8c8bc2` | Remove runtime inválido do vercel.json, melhora log do proxy |
| — | `9a0d8d7` | Remove tagIds do createCard (fix erro 500 WTS.chat) |
| — | `2a70915` | Fix campos do payload Clinicorp create_online_scheduling |
| — | `e70b3df` | Fix payload create_online_scheduling conforme schema da doc |
| — | `d2246d9` | Visual: remove step indicator, adiciona seções no form, detecção de número privado |
| — | `c9149f2` | Fix: envia data/hora separados na API Clinicorp |
| — | `a3b93e8` | Fix: implementa fluxo completo de paciente + correções no agendamento |
| — | `f10ee23` | Fix: troca `create_online_scheduling` por `create_appointment_by_api` |
| — | `e2ad81b` | Feat: adiciona `CategoryColor` e `CategoryDescription` no agendamento |
