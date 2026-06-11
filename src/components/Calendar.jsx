import { toDateStr } from '../utils/date'

const WEEKDAYS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB']
const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function buildCalendarDays(year, month) {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const days = []
  for (let i = 0; i < firstDay; i++) days.push(null)
  for (let d = 1; d <= daysInMonth; d++) days.push(d)
  return days
}

// availability: { dates: Set<'YYYY-MM-DD'>, min, max } | null.
// Dias dentro da janela [min, max] e fora do Set não têm agenda → desabilitados.
// Fora da janela não há dado do Clinicorp, então permanecem clicáveis.
export default function Calendar({ viewYear, viewMonth, selectedDate, todayStr, availability, onDayClick, onPrevMonth, onNextMonth }) {
  const calendarDays = buildCalendarDays(viewYear, viewMonth)

  return (
    <div className="calendar">
      <div className="cal-header">
        <button type="button" className="cal-nav" onClick={onPrevMonth}>&#8249;</button>
        <div className="cal-month-label">
          <span>{MONTHS[viewMonth].toUpperCase()}</span>
          <span className="cal-year">{viewYear}</span>
        </div>
        <button type="button" className="cal-nav" onClick={onNextMonth}>&#8250;</button>
      </div>

      <div className="cal-grid">
        {WEEKDAYS.map(w => (
          <div key={w} className="cal-weekday">{w}</div>
        ))}
        {calendarDays.map((day, i) => {
          if (!day) return <div key={`e-${i}`} className="cal-empty" />
          const dateStr = toDateStr(viewYear, viewMonth, day)
          const isPast = dateStr < todayStr
          const noAgenda = !isPast && availability
            && dateStr >= availability.min && dateStr <= availability.max
            && !availability.dates.has(dateStr)
          const isToday = dateStr === todayStr
          const isSelected = dateStr === selectedDate
          return (
            <button
              key={day}
              type="button"
              disabled={isPast || noAgenda}
              title={noAgenda ? 'Sem horários disponíveis' : undefined}
              className={[
                'cal-day',
                isPast ? 'cal-day-past' : '',
                noAgenda ? 'cal-day-unavailable' : '',
                isToday && !isSelected ? 'cal-day-today' : '',
                isSelected ? 'cal-day-selected' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => onDayClick(day)}
            >
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}
