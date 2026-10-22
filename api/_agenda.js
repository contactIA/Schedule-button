// A unidade que marca na agenda do CRM ContactIA (CRM#302, ADR 0022 de lá):
// sem o Clinicorp, os dias, os horários e a consulta saem da API da agenda, com
// a chave da clínica (clinics.crm_api_key). A regra dos horários (expediente,
// bloqueios, cadeiras, a duração) fica toda no CRM, e o procedimento vazio é o
// das consultas do CRM.
//
// Os horários chegam como instantes e vão de volta como vieram (`start`); o
// HH:mm é só para a tela, no fuso da clínica no CRM.
//
// A rota é o /api/clinicorp com ?agenda=1, e não uma função própria: o plano
// da Vercel aceita 12 funções por deploy, e o botão já tem as 12.

import { getClinicByAccountId } from './_supabase.js'
import { CrmError, crmClient, isUuid } from './_crm.js'
import { requireAllowedOrigin } from './_origin.js'

export const FUSO_PADRAO = 'America/Sao_Paulo'
// O período mais longo que o /agenda/dias-livres aceita: seis semanas
const DIAS = 42
const MAX_OBSERVACOES = 2000
const DATA = /^\d{4}-\d{2}-\d{2}$/

export function dateIn(ms, timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms)
}

export function timeIn(iso, timeZone) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

// Os dias com horário livre, de hoje (no fuso da clínica) a seis semanas
export async function agendaDays(call, { unitId, timeZone, now = Date.now() }) {
  const de = dateIn(now, timeZone)
  const query = new URLSearchParams({ unidadeId: unitId, de, ate: addDays(de, DIAS - 1) })
  const { dias } = await call('GET', `/agenda/dias-livres?${query}`)
  return dias ?? []
}

// Os horários do dia no formato dos do Clinicorp, mais o `start` para marcar
export async function agendaSlots(call, { unitId, date, timeZone }) {
  const query = new URLSearchParams({ unidadeId: unitId, data: date })
  const { profissionais } = await call('GET', `/agenda/horarios-livres?${query}`)
  return (profissionais ?? [])
    .flatMap(p => (p.horarios ?? []).map(h => ({
      from: timeIn(h.inicio, timeZone),
      to: timeIn(h.fim, timeZone),
      start: h.inicio,
      professionalId: p.profissional.id,
      professionalName: p.profissional.nome,
    })))
    // Por hora; no mesmo horário, a ordem de recomendação do CRM
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
}

// Cria o card do contato (ou acha o aberto) e marca a consulta ligada a ele.
// O botão não move o card: o aviso da consulta o leva a Agendados, e assim a
// agenda não tenta encaixar a mesma consulta sozinha.
export async function bookAgenda(call, input) {
  const { unitId, professionalId, start, name, phone, contactId, appointmentNote, cardNote } = input
  if (!phone) throw new CrmError('Para marcar na agenda, preencha o telefone do paciente.', 400, 'SEM_TELEFONE')

  const { card, resultado } = await call('POST', '/cards', {
    telefone: phone,
    nome: name,
    ...(isUuid(contactId) ? { contatoPlataformaId: contactId } : {}),
    unidadeId: unitId,
    ...(cardNote ? { descricao: cardNote } : {}),
  })
  const consulta = await call('POST', '/agenda/consultas', {
    unidadeId: unitId,
    profissionalId: professionalId,
    inicio: start,
    paciente: { nome: name, telefone: phone },
    cardId: card.id,
    ...(appointmentNote ? { observacoes: appointmentNote.slice(0, MAX_OBSERVACOES) } : {}),
  })

  // No card novo a observação já foi como descrição; no existente vira
  // anotação. Falhar aqui não desfaz a consulta.
  if (cardNote && resultado !== 'criado') {
    await call('POST', `/cards/${card.id}/anotacoes`, { texto: cardNote })
      .catch(err => console.warn('[agenda] anotação no card falhou:', err.message))
  }

  return { cardId: card.id, consultaId: consulta?.id ?? null, resultado }
}

// O erro em frase para a CRC, sem jargão de HTTP
export function describeAgendaError(err) {
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError' || err instanceof TypeError) {
    return 'Não foi possível falar com a agenda agora. Tente de novo em instantes.'
  }
  switch (err?.code) {
    case 'CHAVE_INVALIDA':
    case 'SEM_CREDENCIAL':
    case 'CLINICA_FORA_DA_CHAVE':
      return 'A agenda recusou a chave da clínica. Peça à equipe para conferir o botão no setup do CRM.'
    default:
      // 409: o horário foi ocupado entre a lista e o clique
      return err?.status === 409 ? `${err.message}. Escolha outro horário.` : (err?.message ?? 'Erro desconhecido na agenda.')
  }
}

// A rota da unidade da agenda, no lugar do Clinicorp. Rota do operador: prova
// de origem, e a unidade precisa ser uma das ativas da clínica do idconta, com
// agenda: true.
//   GET ?agenda=1&idconta=&unitId=&days=1 → ['YYYY-MM-DD', ...]
//   GET ?agenda=1&idconta=&unitId=&date=  → [{ from, to, start, professionalId, professionalName }]
//   POST ?agenda=1&idconta=&unitId=       { patientName, patientPhone, contactId, professionalId, start, appointmentNote, cardNote }
export function makeAgendaHandler({ loadClinic = getClinicByAccountId, client = crmClient } = {}) {
  return async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    if (!requireAllowedOrigin(req, res)) return

    const { idconta, unitId } = req.query ?? {}
    if (!idconta || !unitId) return res.status(400).json({ error: 'Parâmetros idconta e unitId obrigatórios' })

    let clinic
    try {
      clinic = await loadClinic(idconta)
    } catch (err) {
      console.error('[agenda] Erro ao carregar a clínica:', err.message)
      return res.status(500).json({ error: err.message })
    }
    const unit = clinic?.units?.find(u => u.id === unitId)
    if (!unit?.agenda || !unit.crm_unit_id) return res.status(404).json({ error: 'Unidade da agenda não encontrada.' })
    // A chave chega com o retrato do CRM (CRM#91); sem ela não há como marcar
    if (!clinic.crm_api_key) {
      console.error('[agenda] unidade da agenda sem a chave do CRM na clínica:', idconta)
      return res.status(409).json({ error: 'A agenda desta clínica ainda não está ligada ao botão. Peça à equipe para conferir o botão no setup do CRM.' })
    }

    const call = client({ baseUrl: process.env.CRM_API_URL, apiKey: clinic.crm_api_key, companyId: idconta })
    const timeZone = clinic.fuso_horario || FUSO_PADRAO
    const unidadeId = unit.crm_unit_id

    try {
      if (req.method === 'GET' && req.query.days) {
        return res.status(200).json(await agendaDays(call, { unitId: unidadeId, timeZone }))
      }
      if (req.method === 'GET') {
        if (!DATA.test(req.query.date ?? '')) return res.status(400).json({ error: 'Parâmetro date obrigatório (YYYY-MM-DD)' })
        return res.status(200).json(await agendaSlots(call, { unitId: unidadeId, date: req.query.date, timeZone }))
      }

      const b = req.body ?? {}
      if (!b.patientName?.trim() || !isUuid(b.professionalId) || Number.isNaN(Date.parse(b.start ?? ''))) {
        return res.status(400).json({ error: 'Campos obrigatórios: patientName, professionalId, start' })
      }
      const result = await bookAgenda(call, {
        unitId:          unidadeId,
        professionalId:  b.professionalId,
        start:           b.start,
        name:            b.patientName.trim(),
        phone:           String(b.patientPhone ?? '').replace(/\D/g, ''),
        contactId:       b.contactId,
        appointmentNote: b.appointmentNote,
        cardNote:        b.cardNote,
      })
      console.log(`[agenda] marcada | conta: ${idconta} | card: ${result.cardId} | ${result.resultado}`)
      return res.status(200).json({ success: true, ...result })
    } catch (err) {
      console.error(`[agenda] falha | conta: ${idconta} | ${err.status ?? ''} ${err.code ?? ''} ${err.message}`)
      const status = err.status === 409 ? 409 : err.status >= 400 && err.status < 500 ? 400 : 502
      return res.status(status).json({ error: describeAgendaError(err), code: err.code ?? null })
    }
  }
}
