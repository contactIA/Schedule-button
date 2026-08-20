export function toDateStr(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// 'YYYY-MM-DD' → 'DD/MM/YYYY'
export function toBrDate(dateStr) {
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

// Fuso canônico da aplicação: Brasília, UTC-3 fixo (sem horário de verão
// desde 2019). Explicitar o offset evita depender do fuso da máquina do
// operador, que pode divergir do fuso da clínica.
export const BR_OFFSET = '-03:00'

// 'YYYY-MM-DD' + 'HH:mm' → instante ISO/UTC daquele horário em Brasília
export function toBrasiliaIso(dateStr, time) {
  const [h, m = '00'] = String(time ?? '00:00').split(':')
  const hhmm = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  return new Date(`${dateStr}T${hhmm}:00${BR_OFFSET}`).toISOString()
}

// 'YYYY-MM-DD' → dia anterior. Aritmética em UTC sobre a data de calendário,
// sem passar pelo fuso da máquina.
export function prevDateStr(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10)
}

// Data de hoje em Brasília — usada para bloquear dias passados no calendário
export function brTodayStr() {
  return new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10)
}
