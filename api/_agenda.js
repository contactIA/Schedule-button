// A unidade que marca na agenda do CRM ContactIA (CRM#302, ADR 0022 de lá):
// sem o Clinicorp, os dias, os horários e a consulta saem da API da agenda, com
// a chave da clínica (clinics.crm_api_key). A regra dos horários (expediente,
// bloqueios, cadeiras, a duração) fica toda no CRM, e o procedimento vazio é o
// das consultas do CRM.
//
// Os horários chegam como instantes e vão de volta como vieram (`start`); o
// HH:mm é só para a tela, no fuso da clínica no CRM.

import { CrmError, isUuid } from './_crm.js'

export const FUSO_PADRAO = 'America/Sao_Paulo'
// O período mais longo que o /agenda/dias-livres aceita: seis semanas
const DIAS = 42
const MAX_OBSERVACOES = 2000

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
