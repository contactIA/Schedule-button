import { useState, useEffect } from 'react'
import { createCard, getContact, findCardByContact, updateCardStep, addCardNote, addContactTags, getPanelSteps } from './services/helena'
import { fetchClinicorpSlots, scheduleClinicorp } from './services/clinicorp'
import { TAGS, AGENDADO_STEP_NAME, CLINICORP_PROFESSIONALS } from './config'
import Calendar from './components/Calendar'
import SlotPicker from './components/SlotPicker'
import TagChips from './components/TagChips'
import { toDateStr } from './utils/date'
import './App.css'

// Detecta números privados/mascarados do WhatsApp (lid@, @g.us, etc.)
function isPhonePrivate(phone) {
  if (!phone) return true
  const str = String(phone)
  if (str.includes('@')) return true
  const digits = str.replace(/\D/g, '')
  if (digits.length < 10) return true
  return false
}

// Remove o DDI +55 que a API Helena retorna junto com o número
function stripCountryCode(phone) {
  if (!phone) return ''
  const digits = String(phone).replace(/\D/g, '')
  if (digits.length === 13 && digits.startsWith('55')) return digits.slice(2)
  if (digits.length === 12 && digits.startsWith('55')) return digits.slice(2)
  return digits
}

function App() {
  const today = new Date()
  const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate())

  const [uiStep, setUiStep] = useState(1)

  // Dados do paciente
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [phonePrivate, setPhonePrivate] = useState(false)
  const [descricao, setDescricao] = useState('')
  const [tagIds, setTagIds] = useState(new Set([TAGS.Agendado]))

  // Etapas do painel CRC
  const [steps, setSteps] = useState([])
  const [stepsLoading, setStepsLoading] = useState(true)
  const [selectedStepId, setSelectedStepId] = useState('')

  // Contato / card
  const [contactId, setContactId] = useState(null)
  const [existingCard, setExistingCard] = useState(null)

  // Calendário (só usado quando etapa selecionada é "Agendado")
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

  // A etapa selecionada é a etapa "Agendado" quando o nome faz match
  const isAgendadoStep = selectedStepId
    ? (steps.find(s => s.id === selectedStepId)?.name ?? '').toLowerCase().includes(AGENDADO_STEP_NAME)
    : false

  // Carrega etapas do painel e dados do contato em paralelo
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const cid = params.get('contactid') || params.get('contactId')

    const loadSteps = getPanelSteps()
      .then(data => {
        setSteps(data)
        if (data.length > 0) setSelectedStepId(data[0].id)
      })
      .catch(err => console.warn('Erro ao carregar etapas:', err))
      .finally(() => setStepsLoading(false))

    if (!cid) return void loadSteps

    setContactId(cid)
    Promise.all([
      loadSteps,
      getContact(cid)
        .then(data => {
          if (data?.name) setNome(data.name)
          const phone = data?.phone || data?.phoneNumber || data?.mobilePhone || ''
          const priv = isPhonePrivate(phone)
          setPhonePrivate(priv)
          if (!priv) setTelefone(stripCountryCode(phone))
        })
        .catch(err => console.warn('Erro ao carregar contato:', err)),
      findCardByContact(cid)
        .then(card => { if (card) setExistingCard(card) })
        .catch(() => null),
    ])
  }, [])

  // Busca slots ao selecionar uma data
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

  const handleNext = (e) => {
    e.preventDefault()
    if (!nome.trim()) return
    if (phonePrivate && !telefone.trim()) return
    // Se a etapa selecionada é "Agendado", abre o calendário; senão, submete direto
    if (isAgendadoStep) {
      setUiStep(2)
    } else {
      handleSubmit()
    }
  }

  const handleSubmit = async (e) => {
    e?.preventDefault?.()
    if (!nome.trim()) return
    setLoading(true)
    setMessage(null)

    try {
      const selectedStep = steps.find(s => s.id === selectedStepId)
      const stepName = selectedStep?.name ?? 'etapa selecionada'

      let finalDescription = descricao.trim()
      if (selectedDate && selectedSlot) {
        const agendamentoLine = `Agendamento: ${selectedDate} às ${selectedSlot.from}`
        finalDescription = agendamentoLine + (finalDescription ? `\n\nObservações:\n${finalDescription}` : '')
      }

      // Busca card em todos os painéis, depois cria ou move
      const card = await findCardByContact(contactId).catch(() => null)
      const dueDateTime = selectedDate && selectedSlot ? `${selectedDate}T${selectedSlot.from}:00` : null

      if (card) {
        await updateCardStep(card.id, selectedStepId, dueDateTime)
        if (finalDescription) await addCardNote(card.id, finalDescription)
      } else {
        await createCard(selectedStepId, nome.trim(), finalDescription, contactId, dueDateTime)
      }

      if (contactId && tagIds.size > 0) {
        await addContactTags(contactId, Array.from(tagIds))
      }

      // Agenda no Clinicorp só se a etapa for "Agendado" e um slot foi selecionado
      let clinicorpStatus = null
      if (isAgendadoStep && selectedDate && selectedSlot) {
        try {
          await scheduleClinicorp({
            patientName: nome.trim(),
            patientPhone: telefone,
            dentistId: selectedSlot.professionalId,
            dateLocal: selectedDate,
            fromTime: selectedSlot.from,
            toTime: selectedSlot.to,
            notes: finalDescription || 'Agendamento via Schedule Button',
          })
          clinicorpStatus = 'ok'
        } catch (err) {
          clinicorpStatus = err.message
        }
      }

      const baseText = card
        ? `Card movido para "${stepName}" com sucesso!`
        : `Card criado em "${stepName}" com sucesso!`

      if (clinicorpStatus === 'ok') {
        setMessage({ type: 'success', text: baseText + ' Agendamento no Clinicorp confirmado.' })
      } else if (clinicorpStatus) {
        setMessage({ type: 'error', text: `${baseText}\n\nErro no Clinicorp: ${clinicorpStatus}` })
      } else {
        setMessage({ type: 'success', text: baseText })
      }

      // Reset do formulário
      setUiStep(1)
      setSelectedDate(null)
      setSelectedSlot(null)
      setAvailableSlots([])
      setDescricao('')
      setTagIds(new Set([TAGS.Agendado]))
      setExistingCard(null)
      if (steps.length > 0) setSelectedStepId(steps[0].id)
      setTimeout(() => setMessage(null), clinicorpStatus && clinicorpStatus !== 'ok' ? 12000 : 6000)
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setLoading(false)
    }
  }

  const phoneInvalid = phonePrivate && !telefone.trim()

  return (
    <div className="page">
      <header className="header">
        <div className="brand">
          <div className="brand-mark"><span className="brand-initials">S</span></div>
          <div className="brand-text">
            <h1 className="brand-name">Schedule Button</h1>
            <p className="brand-sub">Criação Rápida de Cards no CRM</p>
          </div>
        </div>
      </header>

      <main className="main">
        <div className="form-container">

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

          {/* ── ETAPA 1: Formulário ── */}
          {uiStep === 1 && (
            <div className="step-content">
              <div className="form-header">
                <h3>{existingCard ? 'Mover Card' : 'Novo Card'}</h3>
                <p>
                  {existingCard
                    ? 'Card encontrado — será movido para a etapa selecionada.'
                    : 'Preencha os dados para criar o card no CRM.'}
                </p>
                {existingCard?.title && (
                  <div className="card-preview">
                    <div className="card-preview-row">
                      <span className="card-preview-label">Card encontrado</span>
                      <span className="card-preview-value">{existingCard.title}</span>
                    </div>
                  </div>
                )}
              </div>

              <form className="card-form" onSubmit={handleNext}>

                <div className="form-section">
                  <span className="form-section-label">Dados do Paciente</span>

                  <div className="form-group">
                    <label>Nome *</label>
                    <input
                      type="text"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      placeholder="Ex: João da Silva"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className={phonePrivate ? 'label-required' : ''}>
                      Telefone {phonePrivate && <span className="label-badge-private">Número privado — preencha</span>}
                    </label>
                    <input
                      type="tel"
                      value={telefone}
                      onChange={(e) => setTelefone(e.target.value)}
                      placeholder="Ex: (92) 98765-4321"
                      className={phoneInvalid ? 'input-error' : ''}
                      required={phonePrivate}
                    />
                    {phoneInvalid && (
                      <span className="field-hint-error">
                        O número deste contato é privado. Digite o telefone para continuar.
                      </span>
                    )}
                  </div>
                </div>

                <div className="form-section">
                  <span className="form-section-label">Card no CRM</span>

                  <div className="form-group">
                    <label>Etapa de destino *</label>
                    {stepsLoading ? (
                      <div className="steps-loading">
                        <span className="spinner spinner-dark" /> Carregando etapas...
                      </div>
                    ) : (
                      <select
                        value={selectedStepId}
                        onChange={(e) => setSelectedStepId(e.target.value)}
                        className="step-select"
                        required
                      >
                        {steps.map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    )}
                    {isAgendadoStep && (
                      <span className="field-hint">Calendário do Clinicorp será aberto no próximo passo.</span>
                    )}
                  </div>

                  <div className="form-group">
                    <label>Etiquetas do Contato</label>
                    <TagChips tagIds={tagIds} onToggle={toggleTag} />
                  </div>

                  <div className="form-group">
                    <label>Observações</label>
                    <textarea
                      value={descricao}
                      onChange={(e) => setDescricao(e.target.value)}
                      placeholder="Informações adicionais do paciente..."
                      rows="3"
                    />
                  </div>
                </div>

                <div className="form-actions">
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={!nome.trim() || phoneInvalid || stepsLoading || !selectedStepId || loading}
                  >
                    {loading
                      ? <span className="btn-loading"><span className="spinner" />Salvando...</span>
                      : isAgendadoStep
                        ? 'Próximo: Escolher Horário →'
                        : existingCard ? 'Mover Card' : 'Criar Card'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ── ETAPA 2: Calendário (só quando etapa é Agendado) ── */}
          {uiStep === 2 && (
            <div className="step-content">
              <div className="form-header">
                <h3>Escolha o melhor horário</h3>
                <p>Selecione uma data e um horário no Clinicorp.</p>
              </div>

              <div className="calendar-wrap">
                <Calendar
                  viewYear={viewYear}
                  viewMonth={viewMonth}
                  selectedDate={selectedDate}
                  todayStr={todayStr}
                  onDayClick={handleDayClick}
                  onPrevMonth={prevMonth}
                  onNextMonth={nextMonth}
                />

                {selectedDate && (
                  <div className="slots-section">
                    <div className="slots-header">Horários disponíveis</div>
                    <SlotPicker
                      loading={slotsLoading}
                      error={slotsError}
                      slots={availableSlots}
                      selectedSlot={selectedSlot}
                      onSelectSlot={setSelectedSlot}
                    />
                  </div>
                )}
              </div>

              {selectedSlot && (() => {
                const prof = CLINICORP_PROFESSIONALS.find(p => p.id === selectedSlot.professionalId)
                return (
                  <div className="slot-summary">
                    ✓ {selectedDate} às {selectedSlot.from}
                    {prof ? ` · ${prof.name.split(' ')[0]}` : ''}
                  </div>
                )
              })()}

              <div className="step2-actions">
                <button type="button" className="btn-secondary" onClick={() => setUiStep(1)}>
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
                      ? (existingCard ? 'Mover Card + Agendar' : 'Criar Card + Agendar')
                      : existingCard ? 'Mover Card sem Horário' : 'Criar Card sem Horário'}
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
