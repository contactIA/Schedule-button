# Roadmap — Prime Agendamento

Iniciativas planejadas, organizadas por prioridade. Atualizado em: 2026-06-03.

---

## Prioridade Alta — Segurança e Estabilidade

### 1. Mover credenciais para variáveis de ambiente
**Problema:** TOKEN Helena, AUTH Clinicorp, SUBSCRIBER_ID e BUSINESS_ID estão hardcoded no código-fonte e expostos no git.
**Solução:** Migrar para variáveis de ambiente (`.env.local` em dev, Vercel Env Vars em produção).
**Impacto:** Elimina risco de vazamento de credenciais.
**Arquivos:** `src/config.js`, `api/clinicorp.js`
**Esforço estimado:** 2-3h

---

### 2. Profissionais dinâmicos (sem hardcode)
**Problema:** Os 4 dentistas estão hardcoded em `src/config.js`. Adicionar ou remover um profissional exige alteração no código e redeploy.
**Solução:** Chamar `GET /professional/list_all_professionals?subscriber_id=...&fromOnlineScheduling=true` ao carregar o app e armazenar em estado/cache local.
**Impacto:** Operacional — nunca mais precisar de deploy para mudança de equipe.
**Arquivos:** `src/config.js`, `api/clinicorp.js`, `src/services/clinicorp.js`
**Esforço estimado:** 3-4h

---

## Prioridade Média — Novas Funcionalidades

### 3. Confirmação automática por WhatsApp
**Problema:** Após criar o agendamento, o operador precisa manualmente enviar mensagem de confirmação ao paciente.
**Solução:** Após submit bem-sucedido, disparar mensagem via `POST /chat/send/texto` da API Helena com data, hora e nome do dentista confirmados.
**Impacto:** Reduz trabalho manual do operador e melhora experiência do paciente.
**Arquivos:** `src/services/helena.js`, `src/App.jsx`
**Referência:** `Docs/Documentação API Helena/Chat/Send/texto.md`
**Esforço estimado:** 4-6h

---

### 4. Categorias de agendamento selecionáveis
**Problema:** Todos os agendamentos criados usam a mesma categoria (`AVALIAÇÃO`), independente do tipo de consulta.
**Solução:** Buscar `GET /appointment/list_categories` ao abrir o step 2 e exibir um seletor para o operador escolher o tipo de consulta.
**Impacto:** Melhora a organização da agenda do Clinicorp, facilita triagem.
**Arquivos:** `api/clinicorp.js`, `src/services/clinicorp.js`, `src/App.jsx`
**Esforço estimado:** 3-4h

---

### 5. Dias disponíveis marcados no calendário
**Problema:** O operador seleciona qualquer data e só descobre que não há horários depois que a API retorna vazio.
**Solução:** Ao abrir o step 2, buscar `GET /appointment/get_avaliable_days` para o mês atual e desabilitar visualmente os dias sem disponibilidade.
**Impacto:** Reduz frustração do operador, evita cliques desnecessários.
**Arquivos:** `api/clinicorp.js`, `src/services/clinicorp.js`, `src/components/Calendar.jsx`
**Esforço estimado:** 4-5h

---

## Prioridade Baixa — Qualidade e Alcance

### 6. Busca manual de contato por telefone
**Problema:** A tela só funciona quando aberta com `?contactId=...`. Se aberta diretamente, o operador precisa preencher tudo manualmente e o card não fica vinculado ao contato.
**Solução:** Adicionar campo de busca por telefone usando `GET /core/v1/contact?phoneNumber=...` da API Helena como fallback quando não há `contactId` na URL.
**Impacto:** Permite uso da ferramenta em mais cenários (ex: ligações inbound).
**Arquivos:** `src/App.jsx`, `src/services/helena.js`
**Esforço estimado:** 4-6h

---

### 7. Histórico de agendamentos do paciente
**Problema:** O operador não sabe se o paciente já teve agendamentos anteriores ao criar o card.
**Solução:** Após encontrar o paciente no Clinicorp, buscar `GET /appointment/list?patientId=...` e exibir um resumo dos últimos agendamentos.
**Impacto:** Melhora contexto para o operador durante o atendimento.
**Arquivos:** `api/clinicorp.js`, `src/services/clinicorp.js`, `src/App.jsx`
**Esforço estimado:** 5-7h

---

## Débitos Técnicos

| Item | Arquivo | Gravidade |
|---|---|---|
| 2 warnings de lint (`setState` em `useEffect`) | `src/App.jsx` | Baixa (não afeta comportamento) |
| `date` enviado como `T03:00:00.000Z` (fuso hardcoded) | `api/clinicorp.js:122` | Média (pode errar 1 dia fora do fuso BR) |
| Token Helena exposto no bundle JS do frontend | `src/config.js` | Alta (ver item #1 acima) |
