# Roadmap — Schedule Button

Iniciativas planejadas, organizadas por prioridade. Atualizado em: 2026-06-11.

> 🎉 **Roadmap concluído.** Todas as iniciativas planejadas foram entregues. Novas demandas entram em um próximo ciclo.

---

## ✅ Concluído

### 1. Integração com Supabase (banco de dados)
Multi-tenant: tabelas `clinics`, `units` e `professionals`. Identificação por `?idconta=` (companyId Helena). Credenciais carregadas pelas Vercel Functions — nada no frontend.

### 2. Painel de onboarding (`/setup`)
Wizard de 3 passos com auto-fetch de painéis, etapas, etiquetas, businessId, codeLink e profissionais. Suporte a múltiplas unidades Clinicorp.

### 3. Etiquetas no card
Chips de etiqueta na tela de agendamento (cores reais do painel Helena). Merge não-destrutivo em cards existentes. Admin define no onboarding quais etiquetas o operador pode aplicar (`allowedTagIds` no jsonb `helena_panels`).

### 4. Auth server-side nas rotas admin (Fase 0)
`ADMIN_PASSWORD` (env var) validada via header `x-admin-key` em todas as rotas admin. Login do `/setup` valida no servidor.

### 5. Painel de edição de clínicas — Fase 1
Lista de clínicas no `/setup` + edição de nome, slug, token (write-only), painéis, etapa "Agendado" e etiquetas permitidas.

### 6. Mensagem automática por WhatsApp (lembrete de agendamento)
Config por clínica (jsonb `clinics.scheduled_message`): canal, modelo aprovado, mapeamento de variáveis e regra de envio — véspera às HH:MM, X horas antes ou **logo após o agendamento** (que cobre o caso original de confirmação imediata). Envio via app "Mensagens agendadas" do Helena após o Clinicorp confirmar; falha no lembrete nunca desfaz card/agendamento.

### 7. Seletor de dentista avaliador no calendário
Chips de filtro por dentista no topo dos horários do dia ("Qualquer disponível" + primeiro nome de cada profissional). Aparece só com 2+ dentistas no dia. Admin marca avaliadores na edição da clínica (`professionals.is_evaluator`).

### 8. Dias disponíveis marcados no calendário
`GET /api/clinicorp?days=1` → `get_avaliable_days`. Dias sem agenda dentro da janela do agendamento online aparecem desabilitados; sem dado, o calendário permanece todo clicável (fallback silencioso).

### 9. Busca manual de contato por telefone
Seção "Contato no CRM" no passo 1 quando a URL não traz `contactId`: busca via `GET /core/v1/contact/phonenumber/{phone}`, vincula o contato (pré-preenche nome/telefone, detecta card existente) e permite desvincular.

### 10. Histórico de agendamentos do paciente
`GET /api/clinicorp?history=1&phone=`: localiza o paciente e lista agendamentos (1 ano atrás → 6 meses à frente). Resumo compacto abaixo do telefone com debounce; informa quando o telefone ainda não tem cadastro no Clinicorp.

### Painel de edição — Fase 2 (unidades)
`api/units.js`: criar unidade, editar credenciais (token write-only), revalidação automática de businessId/codeLink ao trocar credencial, ativar/desativar (bloqueia desativar a última ativa).

### Painel de edição — Fase 3 (gestão completa)
Marcação de dentistas avaliadores (com sync de profissionais novos do Clinicorp via `sync_professionals`) e ativar/desativar clínica.

---

## Débitos técnicos

| Item | Arquivo | Gravidade | Status |
|---|---|---|---|
| `date` com offset `T03:00:00.000Z` | `api/clinicorp.js` | — | ✅ Aceito por design: convenção da própria doc do Clinicorp (BR = UTC-3 fixo, sem horário de verão desde 2019). Documentado no código. |
| `CLAUDE.md` descrevia a era single-tenant | `CLAUDE.md` | — | ✅ Reescrito em 2026-06-11 |
| `VITE_ADMIN_PASSWORD` obsoleta | env Vercel | Baixa | ⏳ Remover manualmente no dashboard da Vercel (não afeta o código) |
| Warnings de lint em `App.jsx` | `src/App.jsx` | — | ✅ `npm run lint` está limpo em 2026-06-11 |
