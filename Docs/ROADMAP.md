# Roadmap — Schedule Button

Iniciativas planejadas, organizadas por prioridade. Atualizado em: 2026-06-03.

---

## Prioridade Alta — Fundação multi-tenant

### 1. Integração com Supabase (banco de dados)
**Objetivo:** Tornar o projeto multi-tenant — uma instância atende múltiplas clínicas.
**Entregáveis:**
- Criar projeto Supabase e schema (tabelas `clinics` e `professionals`)
- Handler Vercel passa a buscar config da clínica pelo `?clinic=slug` na URL
- `api/clinicorp.js` e `api/proxy.js` param de usar credenciais hardcoded
- Variáveis de ambiente: `SUPABASE_URL` e `SUPABASE_SERVICE_KEY`

**Referência:** `Docs/ARCHITECTURE.md` — seções 1, 4 e 5

---

### 2. Painel de onboarding (`/setup`)
**Objetivo:** Cadastrar uma nova clínica em ~5 minutos com 3 inputs, sem intervenção de dev.
**Entregáveis:**
- Tela `/setup` com campo para Token Helena
  - Auto-fetch de painéis, etapas e etiquetas
  - Dropdowns para seleção
- Campo para Usuário + Token Clinicorp
  - Auto-fetch de unidades, profissionais e categorias
  - Checkbox para marcar dentistas avaliadores
- Geração de slug e salvamento no Supabase
- Exibição da URL final gerada

**Referência:** `Docs/ARCHITECTURE.md` — seção 2

---

### 3. Seletor de dentista no step 2
**Objetivo:** Clínicas com múltiplos dentistas avaliadores podem filtrar horários por profissional.
**Entregáveis:**
- Seletor integrado ao topo do calendário (sem etapa extra)
- Opção "Qualquer disponível" (mostra todos os slots)
- Para clínicas com 1 dentista: seletor oculto automaticamente
- Slots filtrados pelo dentista selecionado

**Referência:** `Docs/ARCHITECTURE.md` — seção 3

---

## Prioridade Média — Novas funcionalidades

### 4. Confirmação automática por WhatsApp
**Objetivo:** Após criar o agendamento, disparar mensagem de confirmação ao paciente via Helena.
**Entregáveis:**
- Após submit bem-sucedido, chamar `POST /chat/send/texto` da API Helena
- Mensagem com data, hora e nome do dentista
- Configurável por clínica (template de mensagem no painel admin)

**Referência:** `Docs/Documentação API Helena/Chat/Send/texto.md`

---

### 5. Dias disponíveis marcados no calendário
**Objetivo:** Desabilitar visualmente dias sem horários antes do operador clicar.
**Entregáveis:**
- Ao abrir o step 2, buscar `GET /appointment/get_avaliable_days` para o mês corrente
- Dias sem disponibilidade aparecem desabilitados no calendário

---

## Prioridade Baixa — Qualidade e alcance

### 6. Busca manual de contato por telefone
**Objetivo:** Permitir uso sem `?contactId=` na URL (ex: ligações inbound).
**Entregáveis:**
- Campo de busca por telefone quando não há `contactId` na URL
- `GET /core/v1/contact?phoneNumber=...` da Helena

---

### 7. Histórico de agendamentos do paciente
**Objetivo:** Mostrar agendamentos anteriores do paciente ao operador.
**Entregáveis:**
- Após encontrar o paciente no Clinicorp, buscar `GET /appointment/list?patientId=...`
- Resumo compacto visível no formulário

---

## Débitos técnicos

| Item | Arquivo | Gravidade | Status |
|---|---|---|---|
| Credenciais hardcoded | `src/config.js`, `api/clinicorp.js` | Alta | Resolvido pelo item #1 acima |
| Profissionais hardcoded | `src/config.js` | Alta | Resolvido pelos itens #1 e #2 acima |
| 2 warnings de lint (setState em useEffect) | `src/App.jsx` | Baixa | Pendente |
| `date` com offset `T03:00:00.000Z` hardcoded | `api/clinicorp.js` | Média | Pendente |
