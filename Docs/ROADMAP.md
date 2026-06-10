# Roadmap — Schedule Button

Iniciativas planejadas, organizadas por prioridade. Atualizado em: 2026-06-10.

---

## ✅ Concluído

### 1. Integração com Supabase (banco de dados)
Multi-tenant: tabelas `clinics`, `units` e `professionals`. Identificação por `?idconta=` (companyId Helena). Credenciais carregadas pelas Vercel Functions — nada no frontend.

### 2. Painel de onboarding (`/setup`)
Wizard de 3 passos com auto-fetch de painéis, etapas, etiquetas, businessId, codeLink e profissionais. Suporte a múltiplas unidades Clinicorp.

### 3. Etiquetas no card
Chips de etiqueta na tela de agendamento (cores reais do painel Helena). Merge não-destrutivo em cards existentes. Admin define no onboarding quais etiquetas o operador pode aplicar (`allowedTagIds` no jsonb `helena_panels`).

### 4. Auth server-side nas rotas admin (Fase 0)
`ADMIN_PASSWORD` (env var) validada via header `x-admin-key` em `/api/setup`, `/api/clinics` e `/api/helena-preview`. Login do `/setup` valida no servidor.

### 5. Painel de edição de clínicas — Fase 1
Lista de clínicas no `/setup` + edição de nome, slug, token (write-only), painéis, etapa "Agendado" e etiquetas permitidas.

---

## Em aberto — Painel de edição (continuação)

### Fase 2 — Edição de unidades
Editar credenciais Clinicorp, adicionar/desativar unidades, revalidação automática de businessId/codeLink ao trocar credencial.

### Fase 3 — Gestão completa
Gerenciar profissionais (marcar avaliadores), ativar/desativar clínica.

---

## Prioridade Média — Novas funcionalidades

### 6. Confirmação automática por WhatsApp  *(adiado — fazer no futuro)*
**Objetivo:** Após criar o agendamento, disparar mensagem de confirmação ao paciente via Helena.
**Entregáveis:**
- Após submit bem-sucedido, chamar `POST /chat/send/texto` da API Helena
- Mensagem com data, hora e nome do dentista
- Configurável por clínica (template de mensagem no painel admin)

**Referência:** `Docs/Documentação API Helena/Chat/Send/texto.md`

### 7. Seletor de dentista avaliador no calendário
**Objetivo:** Clínicas com múltiplos dentistas avaliadores podem filtrar horários por profissional.
**Entregáveis:**
- Seletor integrado ao topo do calendário (sem etapa extra)
- Opção "Qualquer disponível" (mostra todos os slots)
- Para clínicas com 1 dentista: seletor oculto automaticamente
- O campo `professionals.is_evaluator` já existe no banco

**Referência:** `Docs/ARCHITECTURE.md` — seção 3

### 8. Dias disponíveis marcados no calendário
**Objetivo:** Desabilitar visualmente dias sem horários antes do operador clicar.
**Entregáveis:**
- Ao abrir o step 2, buscar `GET /appointment/get_avaliable_days` para o mês corrente
- Dias sem disponibilidade aparecem desabilitados no calendário

---

## Prioridade Baixa — Qualidade e alcance

### 9. Busca manual de contato por telefone
**Objetivo:** Permitir uso sem `?contactId=` na URL (ex: ligações inbound).
**Entregáveis:**
- Campo de busca por telefone quando não há `contactId` na URL
- `GET /core/v1/contact?phoneNumber=...` da Helena

### 10. Histórico de agendamentos do paciente
**Objetivo:** Mostrar agendamentos anteriores do paciente ao operador.
**Entregáveis:**
- Após encontrar o paciente no Clinicorp, buscar `GET /appointment/list?patientId=...`
- Resumo compacto visível no formulário

---

## Débitos técnicos

| Item | Arquivo | Gravidade | Status |
|---|---|---|---|
| `date` com offset `T03:00:00.000Z` hardcoded | `api/clinicorp.js` | Média | Pendente |
| `CLAUDE.md` descreve a era single-tenant | `CLAUDE.md` | Baixa | Pendente |
| `VITE_ADMIN_PASSWORD` obsoleta (substituída por `ADMIN_PASSWORD` server-side) | env Vercel | Baixa | Pode ser removida |
