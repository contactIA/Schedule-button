import { useState, useEffect } from 'react'
import {
  createCard, getContact, findCardByContact,
  updateCardStep, addCardNote, addContactTags, getPanelData
} from './services/helena'
import { fetchClinicorpSlots, scheduleClinicorp } from './services/clinicorp'
import { AGENDADO_STEP_NAME } from './config'
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

// ── Tela sem clínica cadastrada ───────────────────────────────────
function NoClinic() {
  return (
    <div className="no-clinic-page">
      <div className="no-clinic-card">
        <div className="no-clinic-icon">🏥</div>
        <h2>Clínica não encontrada</h2>
        <p>
          Este link não está associado a nenhuma clínica cadastrada.
          Entre em contato com o administrador para obter o link correto.
        </p>
        <button
          className="no-clinic-admin-btn"
          onClick={() => window.location.href = '/setup'}
        >
          Sou administrador →
        </button>
      </div>
    </div>
  )
}

// ── App principal ─────────────────────────────────────────────────
function App() {
  const today    = new Date()
  const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate())

  // Config da clínica (carregada do Supabase via /api/clinic)
  const [idconta,       setIdconta]       = useState(null)
  const [clinicConfig,  setClinicConfig]  = useState(null)
  const [clinicLoading, setClinicLoading] = useState(true)
  const [clinicNotFound, setClinicNotFound] = useState(false)
  // true enquanto dados secundários (steps, contato) ainda estão carregando
  const [dataLoading,   setDataLoading]   = useState(false)

  const [uiStep, setUiStep] = useState(1)

  // Dados do paciente
  const [nome,         setNome]         = useState('')
  const [telefone,     setTelefone]     = useState('')
  const [phonePrivate, setPhonePrivate] = useState(false)
  const [descricao,    setDescricao]    = useState('')
  const [tagIds,       setTagIds]       = useState(new Set())

  // Etapas do painel CRC
  const [steps,        setSteps]        = useState([])
  const [stepsLoading, setStepsLoading] = useState(true)
  const [selectedStepId, setSelectedStepId] = useState('')

  // Contato / card
  const [contactId,    setContactId]    = useState(null)
  const [existingCard, setExistingCard] = useState(null)

  // Calendário
  const [viewYear,  setViewYear]  = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [selectedDate,   setSelectedDate]   = useState(null)
  const [availableSlots, setAvailableSlots] = useState([])
  const [slotsLoading,   setSlotsLoading]   = useState(false)
  const [slotsError,     setSlotsError]     = useState(null)
  const [selectedSlot,   setSelectedSlot]   = useState(null)

  // Submit
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)

  // A etapa selecionada aciona o Clinicorp quando:
  // 1. clinicConfig tem agendadoStepId → match exato
  // 2. fallback → match por nome contendo AGENDADO_STEP_NAME
  const isAgendadoStep = selectedStepId
    ? clinicConfig?.agendadoStepId
      ? selectedStepId === clinicConfig.agendadoStepId
      : (steps.find(s => s.id === selectedStepId)?.name ?? '').toLowerCase().includes(AGENDADO_STEP_NAME)
    : false

  // ── Inicialização ─────────────────────────────────────────────
  useEffect(() => {
    const params    = new URLSearchParams(window.location.search)
    const conta     = params.get('idconta')
    const cid       = params.get('contactid') || params.get('contactId')

    if (!conta) {
      setClinicLoading(false)
      setClinicNotFound(true)
      return
    }

    setIdconta(conta)

    // 1. Carrega config da clínica
    fetch(`/api/clinic?idconta=${conta}`)
      .then(r => r.json())
      .then(config => {
        if (config.error === 'not_registered') {
          setClinicNotFound(true)
          setClinicLoading(false)
          return
        }

        setClinicConfig(config)
        setClinicLoading(false)
        setDataLoading(true)

        // 2. Carrega painel (steps + tags) em paralelo com dados do contato
        const loadPanel = getPanelData(config.panelId, conta)
          .then(({ steps, tags }) => {
            setSteps(steps)
            if (steps.length > 0) setSelectedStepId(steps[0].id)

            // Merge: prefere tags do banco, usa as do painel como fallback
            const finalTags = (config.tags?.length > 0) ? config.tags : tags
            if (finalTags.length > 0) {
              setClinicConfig(prev => ({ ...prev, tags: finalTags }))
              const agendadoTag = finalTags.find(t => t.label?.toLowerCase().includes('agendado'))
              if (agendadoTag) setTagIds(new Set([agendadoTag.id]))
            }
          })
          .catch(err => {
            console.error('Erro ao carregar painel:', err)
            setMessage({ type: 'error', text: `Erro ao carregar etapas: ${err.message}` })
          })
          .finally(() => setStepsLoading(false))

        const tasks = [loadPanel]

        if (cid) {
          setContactId(cid)
          tasks.push(
            getContact(cid, conta)
              .then(data => {
                if (data?.name) setNome(data.name)
                const phone = data?.phone || data?.phoneNumber || data?.mobilePhone || ''
                const priv  = isPhonePrivate(phone)
                setPhonePrivate(priv)
                if (!priv) setTelefone(stripCountryCode(phone))
              })
              .catch(err => console.warn('Erro ao carregar contato:', err)),
            findCardByContact(cid, conta)
              .then(card => { if (card) setExistingCard(card) })
              .catch(() => null)
          )
        }

        Promise.all(tasks).finally(() => setDataLoading(false))
      })
      .catch(err => {
        console.error('Erro ao carregar config da clínica:', err)
        setClinicNotFound(true)
        setClinicLoading(false)
      })
  }, [])

  // ── Busca slots ao selecionar data ───────────────────────────
  useEffect(() => {
    if (!selectedDate || !idconta) return
    setSlotsLoading(true)
    setSlotsError(null)
    setSelectedSlot(null)
    setAvailableSlots([])
    fetchClinicorpSlots(selectedDate, idconta)
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
    const lockedTag = clinicConfig?.tags?.find(t => t.id === tagId && t.locked)
    if (lockedTag) return
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
    isAgendadoStep ? setUiStep(2) : handleSubmit()
  }

  const handleSubmit = async (e) => {
    e?.preventDefault?.()
    if (!nome.trim()) return
    setLoading(true)
    setMessage(null)

    try {
      const selectedStep = steps.find(s => s.id === selectedStepId)
      const stepName     = selectedStep?.name ?? 'etapa selecionada'

      let finalDescription = descricao.trim()
      if (selectedDate && selectedSlot) {
        const line = `Agendamento: ${selectedDate} às ${selectedSlot.from}`
        finalDescription = line + (finalDescription ? `\n\nObservações:\n${finalDescription}` : '')
      }

      const card       = await findCardByContact(contactId, idconta).catch(() => null)
      const dueDateTime = selectedDate && selectedSlot ? `${selectedDate}T${selectedSlot.from}:00` : null

      if (card) {
        await updateCardStep(card.id, selectedStepId, idconta, dueDateTime)
        if (finalDescription) await addCardNote(card.id, finalDescription, idconta)
      } else {
        await createCard(selectedStepId, clinicConfig.panelId, nome.trim(), finalDescription, contactId, idconta, dueDateTime)
      }

      if (contactId && tagIds.size > 0) {
        await addContactTags(contactId, Array.from(tagIds), idconta)
      }

      let clinicorpStatus = null
      if (isAgendadoStep && selectedDate && selectedSlot) {
        try {
          await scheduleClinicorp({
            patientName:  nome.trim(),
            patientPhone: telefone,
            dentistId:    selectedSlot.professionalId,
            dateLocal:    selectedDate,
            fromTime:     selectedSlot.from,
            toTime:       selectedSlot.to,
            notes:        finalDescription || 'Agendamento via Schedule Button',
          }, idconta)
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

      // Reset
      setUiStep(1)
      setSelectedDate(null)
      setSelectedSlot(null)
      setAvailableSlots([])
      setDescricao('')
      setExistingCard(null)
      if (steps.length > 0) setSelectedStepId(steps[0].id)
      const agendadoTag = clinicConfig?.tags?.find(t => t.label?.toLowerCase().includes('agendado'))
      setTagIds(agendadoTag ? new Set([agendadoTag.id]) : new Set())
      setTimeout(() => setMessage(null), clinicorpStatus && clinicorpStatus !== 'ok' ? 12000 : 6000)
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setLoading(false)
    }
  }

  const phoneInvalid = phonePrivate && !telefone.trim()

  // ── Loading inicial da clínica ────────────────────────────────
  if (clinicLoading) {
    return (
      <div className="page">
        <div className="clinic-loading">
          <span className="spinner spinner-dark" />
          <span>Carregando...</span>
        </div>
      </div>
    )
  }

  if (clinicNotFound) return <NoClinic />

  const professionals = clinicConfig?.professionals ?? []
  const tagList       = clinicConfig?.tags ?? []

  return (
    <div className="page">
      {dataLoading && (
        <div className="data-loading-overlay">
          <span className="spinner spinner-dark" />
          <span>Carregando dados...</span>
        </div>
      )}
      <header className="header">
        <div className="brand">
          <div className="brand-mark"><span className="brand-initials">S</span></div>
          <div className="brand-text">
            <h1 className="brand-name">{clinicConfig?.name || 'Schedule Button'}</h1>
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
                      onChange={e => setNome(e.target.value)}
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
                      onChange={e => setTelefone(e.target.value)}
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
                        onChange={e => setSelectedStepId(e.target.value)}
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
                    <TagChips tagIds={tagIds} onToggle={toggleTag} tagList={tagList} />
                  </div>

                  <div className="form-group">
                    <label>Observações</label>
                    <textarea
                      value={descricao}
                      onChange={e => setDescricao(e.target.value)}
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
                      professionals={professionals}
                    />
                  </div>
                )}
              </div>

              {selectedSlot && (() => {
                const prof = professionals.find(p => p.id === selectedSlot.professionalId)
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
