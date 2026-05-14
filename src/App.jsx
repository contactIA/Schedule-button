import { useState, useEffect } from 'react'
import {
  createCard, getContact, findCardByContact,
  updateCardStep, addCardNote, addContactTags, scheduleClinicorp, fetchClinicorpSlots
} from './api'
import { STEPS, STEP_NAMES, TAGS, TAG_LIST, CLINICORP_PROFESSIONALS } from './config'
import './App.css'

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

function toDateStr(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function formatPhone(raw) {
  if (!raw) return ''
  const d = String(raw).replace(/\D/g, '')
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`
  return raw
}

function App() {
  const today = new Date()
  const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate())

  const [step, setStep] = useState(1)

  // Form (step 1)
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [descricao, setDescricao] = useState('')
  const [origem, setOrigem] = useState('crcA')
  const [tagIds, setTagIds] = useState(new Set([TAGS.Agendado]))

  // Contact / card
  const [contactId, setContactId] = useState(null)
  const [isLoadingContact, setIsLoadingContact] = useState(false)
  const [existingCard, setExistingCard] = useState(null)

  // Calendar (step 2)
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [selectedDate, setSelectedDate] = useState(null)
  const [availableSlots, setAvailableSlots] = useState([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [slotsError, setSlotsError] = useState(null)
  const [selectedSlot, setSelectedSlot] = useState(null)

  // Submit
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const cid = params.get('contactid') || params.get('contactId')
    if (!cid) return
    setContactId(cid)
    setIsLoadingContact(true)
    getContact(cid)
      .then(data => {
        if (data?.name) setNome(data.name)
        const phone = data?.phone || data?.phoneNumber || data?.mobilePhone || ''
        if (phone) setTelefone(phone)
        return findCardByContact(cid, data?.name)
      })
      .then(card => { if (card) setExistingCard(card) })
      .catch(err => console.warn('Erro ao carregar dados:', err))
      .finally(() => setIsLoadingContact(false))
  }, [])

  useEffect(() => {
    if (!selectedDate) return
    setSlotsLoading(true)
    setSlotsError(null)
    setSelectedSlot(null)
    setAvailableSlots([])
    fetchClinicorpSlots(selectedDate)
      .then(slots => setAvailableSlots(slots))
      .catch(err => setSlotsError(err.message))
      .finally(() => setSlotsLoading(false))
  }, [selectedDate])

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }

  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  const handleDayClick = (day) => {
    const dateStr = toDateStr(viewYear, viewMonth, day)
    if (dateStr < todayStr) return
    setSelectedDate(dateStr)
    setSelectedSlot(null)
  }

  const toggleTag = (tagId) => {
    if (tagId === TAGS.Agendado) return
    setTagIds(prev => {
      const next = new Set(prev)
      next.has(tagId) ? next.delete(tagId) : next.add(tagId)
      return next
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!nome.trim()) return
    setLoading(true)
    setMessage(null)

    try {
      const stepId = STEPS[origem]
      let extraInfo = []
      if (selectedDate && selectedSlot) {
        extraInfo.push(`Agendamento: ${selectedDate} às ${selectedSlot.from}`)
      }
      let finalDescription = descricao.trim()
      if (extraInfo.length > 0) {
        finalDescription = extraInfo.join('\n') + (finalDescription ? `\n\nObservações:\n${finalDescription}` : '')
      }

      let card = existingCard
      if (!card && contactId) {
        card = await findCardByContact(contactId).catch(() => null)
      }

      const dueDateTime = selectedDate && selectedSlot ? `${selectedDate}T${selectedSlot.from}:00` : null

      if (card) {
        await updateCardStep(card.id, stepId, dueDateTime)
        if (finalDescription) await addCardNote(card.id, finalDescription)
      } else {
        await createCard(stepId, nome.trim(), finalDescription, contactId, Array.from(tagIds), dueDateTime)
      }

      if (contactId && tagIds.size > 0) {
        await addContactTags(contactId, Array.from(tagIds))
      }

      let clinicorpStatus = null
      if (selectedDate && selectedSlot) {
        try {
          await scheduleClinicorp({
            patientName: nome.trim(),
            patientPhone: telefone,
            dentistId: selectedSlot.professionalId,
            dateLocal: selectedDate,
            fromTime: selectedSlot.from,
            duracao: 30,
            notes: finalDescription || 'Agendamento via Prime Agendamento',
          })
          clinicorpStatus = 'ok'
        } catch (err) {
          clinicorpStatus = err.message
        }
      }

      const baseText = card ? 'Card atualizado com sucesso!' : 'Card criado com sucesso!'
      if (clinicorpStatus === 'ok') {
        setMessage({ type: 'success', text: baseText + ' Agendamento no Clinicorp confirmado.' })
      } else if (clinicorpStatus) {
        setMessage({ type: 'warning', text: `${baseText} (Clinicorp: ${clinicorpStatus})` })
      } else {
        setMessage({ type: 'success', text: baseText })
      }

      // Reset
      setStep(1)
      setSelectedDate(null)
      setSelectedSlot(null)
      setAvailableSlots([])
      setDescricao('')
      setOrigem('crcA')
      setTagIds(new Set([TAGS.Agendado]))
      setExistingCard(null)
      setTimeout(() => setMessage(null), 6000)
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setLoading(false)
    }
  }

  const calendarDays = buildCalendarDays(viewYear, viewMonth)
  const avatarInitial = nome ? nome.trim()[0].toUpperCase() : '?'
  const selectedProf = selectedSlot
    ? CLINICORP_PROFESSIONALS.find(p => p.id === selectedSlot.professionalId)
    : null

  return (
    <div className="page">
      <header className="header">
        <div className="brand">
          <div className="brand-mark"><span className="brand-initials">P</span></div>
          <div className="brand-text">
            <h1 className="brand-name">Prime Agendamento</h1>
            <p className="brand-sub">Criação Rápida de Cards no CRM</p>
          </div>
        </div>
      </header>

      <main className="main">
        <div className="form-container">

          {/* Contact bar */}
          {contactId && (
            <div className="contact-bar">
              {isLoadingContact ? (
                <div className="contact-skeleton">
                  <div className="skeleton skeleton-avatar" />
                  <div className="skeleton-lines">
                    <div className="skeleton skeleton-line w-40" />
                    <div className="skeleton skeleton-line w-24" />
                  </div>
                </div>
              ) : (
                <div className="contact-info">
                  <div className="contact-avatar">{avatarInitial}</div>
                  <div className="contact-details">
                    <span className="contact-name">{nome || 'Contato'}</span>
                    {telefone && <span className="contact-phone">{formatPhone(telefone)}</span>}
                  </div>
                  {existingCard
                    ? <span className="badge badge-found">Card Localizado</span>
                    : <span className="badge badge-new">Novo Card</span>}
                </div>
              )}
            </div>
          )}

          {/* Step indicator */}
          <div className="step-indicator">
            <div className={`step-dot ${step >= 1 ? 'step-dot-active' : ''}`}>1</div>
            <div className={`step-line ${step >= 2 ? 'step-line-active' : ''}`} />
            <div className={`step-dot ${step >= 2 ? 'step-dot-active' : ''}`}>2</div>
          </div>

          {/* Alert */}
          {message && (
            <div className={`alert alert-${message.type}`}>
              {message.type === 'success' ? (
                <div className="alert-inner">
                  <span className="alert-icon alert-icon-success">✓</span>
                  <span>{message.text}</span>
                </div>
              ) : message.type === 'warning' ? (
                <div className="alert-inner">
                  <span className="alert-icon alert-icon-warning">⚠</span>
                  <span>{message.text}</span>
                </div>
              ) : message.text}
            </div>
          )}

          {/* ── STEP 1: Formulário ── */}
          {step === 1 && (
            <div className="step-content">
              <div className="form-header">
                <h3>{existingCard ? 'Atualizar Agendamento' : 'Novo Agendamento'}</h3>
                <p>
                  {existingCard
                    ? 'Card encontrado. Ele será movido para a nova etapa.'
                    : 'Preencha os dados para criar o card no CRM.'}
                </p>
                {existingCard && (
                  <div className="card-preview">
                    <div className="card-preview-row">
                      <span className="card-preview-label">Etapa atual</span>
                      <span className="card-preview-value">{STEP_NAMES[existingCard.stepId] || 'Outra etapa'}</span>
                    </div>
                    {existingCard.title && (
                      <div className="card-preview-row">
                        <span className="card-preview-label">Título</span>
                        <span className="card-preview-value">{existingCard.title}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <form className="card-form" onSubmit={(e) => { e.preventDefault(); setStep(2) }}>
                {!contactId && (
                  <div className="form-group">
                    <label>Nome do Paciente *</label>
                    <input
                      type="text"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      placeholder="Ex: João da Silva"
                      required
                    />
                  </div>
                )}

                <div className="form-group">
                  <label>Etiquetas do Contato</label>
                  <div className="tag-chips">
                    {TAG_LIST.map(tag => (
                      <button
                        key={tag.id}
                        type="button"
                        className={[
                          'tag-chip',
                          tagIds.has(tag.id) ? 'tag-chip-active' : '',
                          tag.locked ? 'tag-chip-locked' : '',
                        ].filter(Boolean).join(' ')}
                        onClick={() => toggleTag(tag.id)}
                        title={tag.locked ? 'Etiqueta sempre aplicada' : undefined}
                      >
                        {tagIds.has(tag.id) && <span className="tag-chip-check">✓</span>}
                        {tag.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label>Observações (Opcional)</label>
                  <textarea
                    value={descricao}
                    onChange={(e) => setDescricao(e.target.value)}
                    placeholder="Informações adicionais do paciente..."
                    rows="3"
                  />
                </div>

                <div className="form-group">
                  <label>Origem do Agendamento</label>
                  <div className="segmented-control">
                    {['crcA', 'crcB'].map(key => (
                      <label key={key} className={`segment ${origem === key ? 'active' : ''}`}>
                        <input
                          type="radio"
                          name="origem"
                          value={key}
                          checked={origem === key}
                          onChange={(e) => setOrigem(e.target.value)}
                          className="sr-only"
                        />
                        <span className="segment-text">{key === 'crcA' ? 'CRC A' : 'CRC B'}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="form-actions">
                  <button type="submit" className="btn-primary" disabled={!nome.trim()}>
                    Próximo: Escolher Horário →
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ── STEP 2: Calendário Clinicorp ── */}
          {step === 2 && (
            <div className="step-content">
              <div className="form-header">
                <h3>Escolha o melhor horário</h3>
                <p>Selecione uma data e um horário disponível no Clinicorp.</p>
              </div>

              <div className="calendar-wrap">
                <div className="calendar">
                  <div className="cal-header">
                    <button type="button" className="cal-nav" onClick={prevMonth}>&#8249;</button>
                    <div className="cal-month-label">
                      <span>{MONTHS[viewMonth].toUpperCase()}</span>
                      <span className="cal-year">{viewYear}</span>
                    </div>
                    <button type="button" className="cal-nav" onClick={nextMonth}>&#8250;</button>
                  </div>

                  <div className="cal-grid">
                    {WEEKDAYS.map(w => (
                      <div key={w} className="cal-weekday">{w}</div>
                    ))}
                    {calendarDays.map((day, i) => {
                      if (!day) return <div key={`e-${i}`} className="cal-empty" />
                      const dateStr = toDateStr(viewYear, viewMonth, day)
                      const isPast = dateStr < todayStr
                      const isToday = dateStr === todayStr
                      const isSelected = dateStr === selectedDate
                      return (
                        <button
                          key={day}
                          type="button"
                          disabled={isPast}
                          className={[
                            'cal-day',
                            isPast ? 'cal-day-past' : '',
                            isToday && !isSelected ? 'cal-day-today' : '',
                            isSelected ? 'cal-day-selected' : '',
                          ].filter(Boolean).join(' ')}
                          onClick={() => handleDayClick(day)}
                        >
                          {day}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {selectedDate && (
                  <div className="slots-section">
                    <div className="slots-header">Horários disponíveis</div>

                    {/* Profissional fixo */}
                    <div className="prof-banner">
                      <div className="prof-avatar">A</div>
                      <div className="prof-info">
                        <span className="prof-name">Dr. Alex Fernando Santos da Silva</span>
                        <span className="prof-role">Dentista responsável pelos agendamentos</span>
                      </div>
                      <span className="prof-badge">Exclusivo</span>
                    </div>

                    {slotsLoading && (
                      <div className="slots-loading-row">
                        <span className="spinner spinner-dark" />
                        Buscando horários disponíveis para Dr. Alex...
                      </div>
                    )}
                    {slotsError && (
                      <p className="slots-msg slots-msg-error">⚠ {slotsError}</p>
                    )}
                    {!slotsLoading && !slotsError && availableSlots.length === 0 && (
                      <p className="slots-msg">Dr. Alex não possui horários disponíveis nesta data.</p>
                    )}
                    {!slotsLoading && availableSlots.length > 0 && (
                      <div className="slots-list">
                        {availableSlots.map((slot, i) => {
                          const isActive = selectedSlot?.from === slot.from && selectedSlot?.professionalId === slot.professionalId
                          return (
                            <button
                              key={`${slot.from}-${slot.professionalId}-${i}`}
                              type="button"
                              className={`slot-row${isActive ? ' slot-row-active' : ''}`}
                              onClick={() => setSelectedSlot(isActive ? null : slot)}
                            >
                              <span className="slot-row-time">{slot.from} às {slot.to}</span>
                              {isActive && <span className="slot-row-check">✓</span>}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Selected slot summary */}
              {selectedSlot && (
                <div className="slot-summary">
                  <span className="slot-summary-icon">✓</span>
                  <span>
                    <strong>{selectedDate}</strong> às <strong>{selectedSlot.from}</strong>
                    {' · '}
                    <span className="slot-summary-prof">Dr. Alex Fernando Santos da Silva</span>
                  </span>
                </div>
              )}

              <div className="step2-actions">
                <button type="button" className="btn-secondary" onClick={() => setStep(1)}>
                  ← Voltar
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={loading}
                  onClick={handleSubmit}
                >
                  {loading
                    ? <span className="btn-loading"><span className="spinner" />Salvando...</span>
                    : selectedSlot
                      ? (existingCard ? 'Atualizar Card' : 'Criar Card')
                      : 'Criar Card sem Horário'}
                </button>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  )
}

export default App
