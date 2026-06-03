# Decisões de Arquitetura — Schedule Button

Documento de referência para decisões tomadas durante o desenvolvimento. Registra o raciocínio por trás de cada escolha para guiar implementações futuras.

---

## 1. Modelo multi-tenant: um deploy para todas as clínicas

**Data:** 2026-06-03

### Problema
O projeto nasceu hardcoded para uma única clínica (Prime Odonto Center). Para ser usado por outras clínicas, precisava de uma estratégia de multi-tenancy.

### Opções consideradas

| Opção | Descrição | Prós | Contras |
|---|---|---|---|
| **A — Um deploy por clínica** | Cada clínica tem seu próprio projeto Vercel com env vars | Zero infraestrutura extra | Processo manual a cada nova clínica, não escala |
| **B — Um deploy + banco de dados** ✅ | Deploy único, config por clínica no Supabase, identificada pelo `?clinic=slug` | Escala sem novos deploys, onboarding automatizável | Mais complexidade inicial, custo de banco |
| **C — Vercel KV** | Deploy único, config em Redis (Vercel KV) | Sem banco relacional | Menos flexível para queries, sem relações |

**Decisão: Opção B — Supabase.**

**Justificativa:** A Opção A não escala — a cada nova clínica, um dev precisa criar projeto, configurar vars, e fazer deploy. A Opção B exige mais trabalho inicial, mas o onboarding passa a ser feito pelo painel admin sem intervenção de dev. Supabase foi escolhido pelo SDK JavaScript nativo e Row Level Security (RLS) gratuito.

---

## 2. Onboarding com 3 inputs + auto-fetch

**Data:** 2026-06-03

### Problema
Coletar manualmente todas as credenciais e IDs de uma clínica levava ~45 minutos e exigia conhecimento técnico das duas APIs.

### Solução
Reduzir a entrada humana ao mínimo: **Token Helena + Usuário Clinicorp + Token Clinicorp**. Tudo mais é buscado automaticamente via API no momento do cadastro.

### Mapeamento de auto-fetch

**Do Token Helena:**
| Dado | Endpoint | Ação admin |
|---|---|---|
| Painéis disponíveis | `GET /crm/v1/panel` | Seleciona qual painel usar |
| Etapas do funil | `GET /crm/v1/panel/{id}` | Associa cada etapa ao papel (CRC A / CRC B) |
| Etiquetas | `GET /core/v1/tag/list` | Seleciona quais etiquetas usar |

**Do Usuário + Token Clinicorp:**
| Dado | Endpoint | Ação admin |
|---|---|---|
| SUBSCRIBER_ID | `GET /group/list_clinics` | Automático (1 resultado esperado) |
| Unidades | `GET /business/list` | Seleciona qual unidade |
| CODE_LINK | Retorna junto com a unidade | Automático |
| Profissionais | `GET /professional/list_all_professionals` | Marca quais fazem avaliação |
| Categorias | `GET /appointment/list_categories` | Escolhe categoria padrão |

### Resultado
Onboarding de ~45min para ~5min, sem necessidade de dev após o painel admin estar pronto.

---

## 3. Seletor de dentista para clínicas multi-profissional

**Data:** 2026-06-03

### Problema
Clínicas com mais de um dentista fazendo avaliações precisam que o operador saiba com qual profissional está agendando. A versão anterior mostrava todos os horários de todos os dentistas misturados.

### Opções consideradas

| Opção | Descrição |
|---|---|
| **A — Etapa extra (passo 1.5)** | Tela separada "Escolha o dentista" antes do calendário |
| **B — Filtro dentro do step 2** ✅ | Seletor integrado ao topo do calendário, sem etapa extra |

**Decisão: Opção B.**

**Justificativa:** Menos cliques para o operador. O filtro aparece somente quando a clínica tem 2+ dentistas avaliadores cadastrados. Para clínicas com 1 dentista, o calendário abre direto sem o filtro.

### Comportamento esperado
- **1 dentista avaliador:** calendário abre com os horários desse profissional, sem seletor visível
- **N dentistas avaliadores:** seletor aparece com opção "Qualquer disponível" (mostra todos os slots) + um botão por dentista
- A escolha do dentista filtra os slots exibidos e pré-seleciona o profissional no agendamento

---

## 4. Credenciais no banco vs. variáveis de ambiente

**Data:** 2026-06-03

### Decisão
Credenciais por clínica (tokens Helena e Clinicorp) ficam no banco (Supabase), **criptografadas em repouso** pelo próprio Supabase. Apenas as credenciais de acesso ao Supabase (`SUPABASE_URL` e `SUPABASE_SERVICE_KEY`) ficam como variáveis de ambiente na Vercel.

### Modelo de segurança
```
Vercel env vars → SUPABASE_URL + SUPABASE_SERVICE_KEY (1 par, fixo)
Supabase → credenciais de cada clínica (N registros, atualizáveis sem deploy)
```

O `SUPABASE_SERVICE_KEY` nunca vai ao frontend — fica apenas nas Vercel Functions (`api/`). O frontend acessa a config da clínica somente através do handler serverless, que valida o `clinic` slug antes de retornar qualquer dado.

---

## 5. Identificação da clínica por slug na URL

**Data:** 2026-06-03

### Decisão
A clínica é identificada pelo parâmetro `?clinic=slug` na URL, em vez de subdomínio.

### Por que não subdomínio?
Subdomínios exigiriam wildcard DNS + certificado SSL wildcard no Vercel. O parâmetro de URL funciona com um único domínio e zero configuração extra de infra.

### Formato da URL
```
https://app.contactia.com.br?clinic=clinica-abc&contactId=uuid
```

O `slug` é gerado automaticamente no onboarding a partir do nome da clínica (lowercase, sem acentos, hífens no lugar de espaços). Pode ser personalizado pelo admin.

---

## Próximas decisões pendentes

- **Cache de config por clínica:** buscar do Supabase a cada requisição ou cachear na Vercel (Edge Config / KV)? Sugestão: Edge Config para configs que mudam raramente.
- **Painel admin:** SPA separada ou rotas no mesmo projeto? Sugestão: rotas no mesmo projeto (`/admin/*`) com middleware de autenticação.
- **Autenticação do painel admin:** quem pode cadastrar clínicas? Sugestão: Supabase Auth com email/senha, acesso restrito.
