# Prime Agendamento

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

> Estas credenciais estão hardcoded no código. Migrar para variáveis de ambiente é item do roadmap (`Docs/ROADMAP.md`).

---

## Como rodar localmente

```bash
npm install
npm run dev
# Abre em http://localhost:5175
```

Em desenvolvimento, o Vite proxeia `/api/core` e `/api/crm` para `https://api.wts.chat` via plugin customizado em `vite.config.js`.

Para testar com um contato real, abra: `http://localhost:5175?contactId=<UUID_DO_CONTATO>`

---

## Deploy

O projeto faz deploy automático na Vercel ao fazer push para a branch `main`.

- As funções em `api/` são convertidas em Serverless Functions
- Timeout configurado para 15s em `vercel.json`
- Node.js 20 requerido (definido em `vercel.json`)
