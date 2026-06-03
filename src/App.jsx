import { useState, useEffect } from 'react'
import { createCard, getContact, findCardByContact, updateCardStep, addCardNote, addContactTags } from './services/helena'
import { fetchClinicorpSlots, scheduleClinicorp } from './services/clinicorp'
import { STEPS, STEP_NAMES, TAGS, CLINICORP_PROFESSIONALS } from './config'
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

  const [step, setStep] = useState(1)

  // Dados do paciente
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [phonePrivate, setPhonePrivate] = useState(false)
  const [descricao, setDescricao] = useState('')
  const [origem, setOrigem] = useState('crcA')
  const [tagIds, setTagIds] = useState(new Set([TAGS.Agendado]))

  // Contato / card
  const [contactId, setContactId] = useState(null)
  const [existingCard, setExistingCard] = useState(null)

  // Calendário
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
    getContact(cid)
      .then(data => {
        if (data?.name) setNome(data.name)
        const phone = data?.phone || data?.phoneNumber || data?.mobilePhone || ''
        const priv = isPhonePrivate(phone)
        setPhonePrivate(priv)
        if (!priv) setTelefone(stripCountryCode(phone))
        return findCardByContact(cid, data?.name)
      })
      .then(card => { if (card) setExistingCard(card) })
      .catch(err => console.warn('Erro ao carregar dados:', err))
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

  const handleNext = (e) => {
    e.preventDefault()
    if (!nome.trim()) return
    if (phonePrivate && !telefone.trim()) return
    setStep(2)
  }

  const handleSubmit = async (e) => {
    e && e.preventDefault && e.preventDefault()
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
        card = await findCardByContact(contactId, nome.trim()).catch(() => null)
      }

      const dueDateTime = selectedDate && selectedSlot ? `${selectedDate}T${selectedSlot.from}:00` : null

      if (card) {
        await updateCardStep(card.id, stepId, dueDateTime)
        if (finalDescription) await addCardNote(card.id, finalDescription)
      } else {
        await createCard(stepId, nome.trim(), finalDescription, contactId, dueDateTime)
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
            toTime: selectedSlot.to,
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
        setMessage({ type: 'error', text: `${baseText}\n\nErro no Clinicorp: ${clinicorpStatus}\n\nVerifique o console do navegador (F12) para mais detalhes.` })
      } else {
        setMessage({ type: 'success', text: baseText })
      }

      setStep(1)
      setSelectedDate(null)
      setSelectedSlot(null)
      setAvailableSlots([])
      setDescricao('')
      setOrigem('crcA')
      setTagIds(new Set([TAGS.Agendado]))
      setExistingCard(null)
      const timeout = clinicorpStatus && clinicorpStatus !== 'ok' ? 12000 : 6000
      setTimeout(() => setMessage(null), timeout)
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
          <div className="brand-mark"><span className="brand-initials">P</span></div>
          <div className="brand-text">
            <h1 className="brand-name">Prime Agendamento</h1>
            <p className="brand-sub">Criação Rápida de Cards no CRM</p>
          </div>
        </div>
      </header>

      <main className="main">
        <div className="form-container">

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

          {/* ── ETAPA 1: Formulário ── */}
          {step === 1 && (
            <div className="step-content">
              <div className="form-header">
                <h3>{existingCard ? 'Atualizar Agendamento' : 'Novo Agendamento'}</h3>
                <p>
                  {existingCard
                    ? 'Card encontrado — será movido para a nova etapa.'
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

              <form className="card-form" onSubmit={handleNext}>

                {/* Seção: Dados do paciente */}
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

                {/* Seção: Card no CRM */}
                <div className="form-section">
                  <span className="form-section-label">Card no CRM</span>

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
                </div>

                <div className="form-actions">
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={!nome.trim() || phoneInvalid}
                  >
                    Próximo: Escolher Horário →
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ── ETAPA 2: Calendário ── */}
          {step === 2 && (
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
