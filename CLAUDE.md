# CLAUDE.md — Prime Agendamento

Contexto e convenções para o agente de IA neste projeto.

---

## O que é o projeto

Ferramenta interna da Prime Odonto Center. Operadores do CRC abrem a tela a partir de um contato no WhatsApp (URL com `?contactId=...`) e criam cards no CRM Helena + agendamentos no Clinicorp com um único fluxo de 2 etapas.

---

## Stack

- **React 19 + Vite** no frontend
- **Vercel Functions** como backend serverless (pasta `api/`)
- **CSS customizado** — sem Tailwind, sem MUI, sem styled-components
- Sem TypeScript — projeto em JavaScript puro

---

## Arquitetura

```
src/components/   → Componentes visuais puros (Calendar, SlotPicker, TagChips)
src/services/     → Chamadas a APIs externas (helena.js, clinicorp.js)
src/config.js     → Todas as constantes e credenciais frontend
api/clinicorp.js  → Handler Vercel que chama a API Clinicorp com auth segura
api/proxy.js      → Handler Vercel que faz proxy das chamadas à API Helena (resolve CORS)
```

O `api/clinicorp.js` é o único lugar com as credenciais do Clinicorp. O frontend nunca chama a API Clinicorp diretamente — passa sempre por `/api/clinicorp`.

---

## Credenciais

| Sistema | Onde estão | Formato |
|---|---|---|
| Helena (WTS.chat) | `src/config.js` → `TOKEN` | `Bearer pn_...` |
| Clinicorp | `api/clinicorp.js` → `AUTH` | `Basic base64(user:token)` |
| Clinicorp CNPJ | `api/clinicorp.js` → `SUBSCRIBER_ID` | string numérica |
| Clinicorp Unidade | `api/clinicorp.js` → `BUSINESS_ID` | número |

> Credenciais hardcoded são débito técnico. Ver roadmap para migração para env vars.

---

## Convenções de código

- Sem comentários desnecessários — só WHY quando não é óbvio
- Componentes em `PascalCase.jsx`, serviços em `camelCase.js`
- Sem abstrações prematuras — 3 linhas repetidas não justificam um helper
- Erros de API logam no console com prefixo `[NomeDoServico]` para facilitar debug

---

## Como testar localmente

```bash
npm install
npm run dev
# http://localhost:5175?contactId=<UUID>
```

Para testar sem `contactId`, o formulário funciona normalmente mas não pré-preenche nome/telefone e não vincula ao contato no CRM.

---

## Deploy

Push na branch `main` → deploy automático na Vercel. Não há CI/CD adicional.

---

## Débitos técnicos conhecidos

1. Credenciais em hardcode (ver `Docs/ROADMAP.md`)
2. Profissionais do Clinicorp hardcoded em `src/config.js`
3. 2 warnings de lint em `App.jsx` (setState em useEffect) — pré-existentes, não críticos
4. `date` enviado como `T03:00:00.000Z` no create_appointment — ajuste manual de fuso (BR = UTC-3)
