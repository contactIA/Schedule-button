import { useState, useEffect, useCallback } from 'react'
import {
  createCard, getContact, findCardByContact, findContactByPhone,
  updateCardStep, addCardNote, getPanelData, scheduleReminder
} from './services/helena'
import { fetchClinicorpSlots, fetchClinicorpDays, scheduleClinicorp } from './services/clinicorp'
import Calendar from './components/Calendar'
import SlotPicker from './components/SlotPicker'
import TagChips from './components/TagChips'
import { toDateStr, toBrDate } from './utils/date'
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

// Momento de envio do lembrete conforme a regra da clínica.
// Nunca devolve um instante no passado — cai para daqui a 5 minutos.
function reminderScheduling(timing, dateStr, fromTime) {
  const appt = new Date(`${dateStr}T${fromTime}:00`)
  let when
  if (timing?.mode === 'immediate') {
    when = new Date(Date.now() + 2 * 60000)
  } else if (timing?.mode === 'hours_before') {
    when = new Date(appt.getTime() - (timing.hours ?? 24) * 3600000)
  } else {
    // day_before (padrão): véspera no horário configurado
    const [h, m] = (timing?.time ?? '18:00').split(':')
    when = new Date(appt)
    when.setDate(when.getDate() - 1)
    when.setHours(Number(h), Number(m || 0), 0, 0)
  }
  if (when.getTime() <= Date.now()) when = new Date(Date.now() + 5 * 60000)
  return when.toISOString()
}

// Parâmetros da URL — fixos durante toda a sessão
const urlParams = new URLSearchParams(window.location.search)
const idconta   = urlParams.get('idconta')
const contactId = urlParams.get('contactid') || urlParams.get('contactId')

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
  const [clinicConfig,  setClinicConfig]  = useState(null)
  const [clinicLoading, setClinicLoading] = useState(!!idconta)
  const [clinicNotFound, setClinicNotFound] = useState(!idconta)
  // true enquanto dados secundários (steps, contato) ainda estão carregando
  const [dataLoading,   setDataLoading]   = useState(false)

  const [uiStep, setUiStep] = useState(1)

  // Dados do paciente
  const [nome,         setNome]         = useState('')
  const [telefone,     setTelefone]     = useState('')
  const [phonePrivate, setPhonePrivate] = useState(false)
  const [descricao,    setDescricao]    = useState('')

  // Unidade selecionada
  const [selectedUnitId, setSelectedUnitId] = useState(null)

  // Steps mantidos internamente para contexto; seleção de etapa arquivada.
  // Para restaurar o seletor de etapa: git checkout archive/multi-step-selector
  const [steps,        setSteps]        = useState([])
  const [stepsLoading, setStepsLoading] = useState(true)

  // Etiquetas do painel ativo, aplicáveis ao card no submit
  const [panelTags,      setPanelTags]      = useState([])
  const [selectedTagIds, setSelectedTagIds] = useState(new Set())

  // Contato / card
  const [existingCard, setExistingCard] = useState(null)
  // Contato vinculado: vem da URL ou da busca manual por telefone
  const [activeContactId,  setActiveContactId]  = useState(contactId)
  const [linkedContact,    setLinkedContact]    = useState(null)
  const [contactSearch,    setContactSearch]    = useState('')
  const [searchingContact, setSearchingContact] = useState(false)
  const [contactSearchMsg, setContactSearchMsg] = useState('')

  // Calendário
  const [viewYear,  setViewYear]  = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [selectedDate,   setSelectedDate]   = useState(null)
  const [availableSlots, setAvailableSlots] = useState([])
  const [slotsLoading,   setSlotsLoading]   = useState(false)
  const [slotsError,     setSlotsError]     = useState(null)
  const [selectedSlot,   setSelectedSlot]   = useState(null)
  // Dias com agenda aberta no Clinicorp (null = sem dado → tudo clicável)
  const [availability,   setAvailability]   = useState(null)
  // Filtro por dentista nos horários do dia (null = qualquer)
  const [selectedDentistId, setSelectedDentistId] = useState(null)

  // Submit
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)

  // Unidade ativa: a selecionada ou a primeira disponível
  const activeUnit = clinicConfig?.units?.find(u => u.id === selectedUnitId)
    ?? clinicConfig?.units?.[0]
    ?? null

  // Painel ativo é derivado da unidade selecionada — sem seletor no runtime
  // (unidade → panelId configurado no onboarding, ou painel padrão da clínica)
  const activePanel = clinicConfig?.panels?.find(p => p.id === activeUnit?.panelId)
    ?? clinicConfig?.panels?.[0]
    ?? null

  const effectiveAgendadoStepId = activeUnit?.agendadoStepId
    ?? activePanel?.agendadoStepId
    ?? clinicConfig?.agendadoStepId

  // ── Steps + etiquetas do painel de uma unidade ────────────────
  // As etiquetas vivem no painel (não no banco), então sempre busca na API.
  // Steps preferem o cache do banco quando os nomes são válidos.
  const loadPanelData = useCallback((config, unitId) => {
    const unit = config.units?.find(u => u.id === unitId)
      ?? config.units?.[0]
      ?? null
    const panelId   = unit?.panelId ?? config.panelId
    const rawCached = unit?.steps?.length ? unit.steps : config.steps ?? []
    // Descarta cache se os nomes estiverem vazios (registro incompleto)
    const cachedSteps = rawCached.filter(s => s.name?.trim())

    setStepsLoading(true)
    return getPanelData(panelId, idconta)
      .then(({ steps: apiSteps, tags }) => {
        setSteps(cachedSteps.length > 0 ? cachedSteps : apiSteps)
        // Restringe às etiquetas liberadas no onboarding (null = todas)
        const allowed = config.panels?.find(p => p.id === panelId)?.allowedTagIds
        const visibleTags = Array.isArray(allowed) ? tags.filter(t => allowed.includes(t.id)) : tags
        setPanelTags(visibleTags)
        // Mantém só as seleções que existem no painel atual
        setSelectedTagIds(prev => new Set([...prev].filter(id => visibleTags.some(t => t.id === id))))
      })
      .catch(err => {
        console.error('Erro ao carregar painel:', err)
        setPanelTags([])
        if (cachedSteps.length > 0) setSteps(cachedSteps)
        else setMessage({ type: 'error', text: `Erro ao carregar etapas: ${err.message}` })
      })
      .finally(() => setStepsLoading(false))
  }, [setSteps, setPanelTags, setSelectedTagIds, setStepsLoading, setMessage])

  // ── Inicialização ─────────────────────────────────────────────
  useEffect(() => {
    if (!idconta) return

    fetch(`/api/clinic?idconta=${idconta}`)
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

        // Seleciona unidade padrão (primeira disponível)
        const defaultUnit = config.units?.[0] ?? null
        if (defaultUnit) setSelectedUnitId(defaultUnit.id)

        const tasks = [loadPanelData(config, defaultUnit?.id)]

        if (contactId) {
          tasks.push(
            getContact(contactId, idconta)
              .then(data => {
                if (data?.name) setNome(data.name)
                const phone = data?.phone || data?.phoneNumber || data?.mobilePhone || ''
                const priv  = isPhonePrivate(phone)
                setPhonePrivate(priv)
                if (!priv) setTelefone(stripCountryCode(phone))
              })
              .catch(err => console.warn('Erro ao carregar contato:', err)),
            findCardByContact(contactId, idconta, defaultUnit?.panelId ?? config.panelId)
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
  }, [loadPanelData])

  // ── Dias com agenda aberta — carregado ao entrar no calendário ──
  const loadAvailability = (unitId) => {
    fetchClinicorpDays(idconta, unitId)
      .then(dates => {
        if (!dates.length) { setAvailability(null); return }
        const sorted = [...dates].sort()
        setAvailability({ dates: new Set(dates), min: sorted[0], max: sorted[sorted.length - 1] })
      })
      // Sem dado de disponibilidade → calendário segue todo clicável
      .catch(err => {
        console.warn('[Clinicorp] Dias disponíveis indisponíveis:', err.message)
        setAvailability(null)
      })
  }

  // ── Busca slots ao escolher um dia no calendário ──────────────
  const loadSlots = (dateStr) => {
    setSlotsLoading(true)
    setSlotsError(null)
    setAvailableSlots([])
    fetchClinicorpSlots(dateStr, idconta, activeUnit?.id)
      .then(slots => setAvailableSlots(slots))
      .catch(err => setSlotsError(err.message))
      .finally(() => setSlotsLoading(false))
  }

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
    loadSlots(dateStr)
  }

  const toggleTag = (tagId) => {
    setSelectedTagIds(prev => {
      const next = new Set(prev)
      if (next.has(tagId)) next.delete(tagId)
      else next.add(tagId)
      return next
    })
  }

  const handleNext = (e) => {
    e.preventDefault()
    if (!nome.trim()) return
    if (phonePrivate && !telefone.trim()) return
    loadAvailability(activeUnit?.id)
    setUiStep(2)
  }

  // ── Busca manual de contato por telefone (sem ?contactId= na URL) ──
  const handleSearchContact = async () => {
    const digits = contactSearch.replace(/\D/g, '')
    if (digits.length < 10) {
      setContactSearchMsg('Digite o telefone com DDD.')
      return
    }
    setSearchingContact(true)
    setContactSearchMsg('')
    try {
      const contact = await findContactByPhone(digits, idconta)
      if (!contact?.id) {
        setContactSearchMsg('Nenhum contato encontrado — o card será criado sem vínculo no CRM.')
        if (!telefone.trim()) setTelefone(digits)
        return
      }
      setActiveContactId(contact.id)
      setLinkedContact({ id: contact.id, name: contact.name || 'Contato sem nome' })
      if (contact.name) setNome(contact.name)
      const phone = contact.phone || contact.phoneNumber || contact.mobilePhone || ''
      setTelefone(stripCountryCode(phone) || digits)
      setPhonePrivate(false)
      const card = await findCardByContact(contact.id, idconta, activeUnit?.panelId ?? clinicConfig?.panelId)
        .catch(() => null)
      setExistingCard(card)
    } catch (err) {
      console.error('[Helena] Busca de contato:', err)
      setContactSearchMsg(`⚠ ${err.message}`)
    } finally {
      setSearchingContact(false)
    }
  }

  const handleUnlinkContact = () => {
    setActiveContactId(null)
    setLinkedContact(null)
    setExistingCard(null)
    setContactSearchMsg('')
  }

  const handleSubmit = async (e) => {
    e?.preventDefault?.()
    if (!nome.trim()) return
    setLoading(true)
    setMessage(null)

    try {
      const stepName = steps.find(s => s.id === effectiveAgendadoStepId)?.name ?? 'Agendado'

      let finalDescription = descricao.trim()
      if (selectedDate && selectedSlot) {
        const line = `Agendamento: ${selectedDate} às ${selectedSlot.from}`
        finalDescription = line + (finalDescription ? `\n\nObservações:\n${finalDescription}` : '')
      }

      const card       = await findCardByContact(activeContactId, idconta, activePanel?.id ?? clinicConfig.panelId).catch(() => null)
      const dueDateTime = selectedDate && selectedSlot ? `${selectedDate}T${selectedSlot.from}:00` : null
      const pickedTags  = [...selectedTagIds]

      if (card) {
        // Mescla com as etiquetas que o card já tem para não removê-las
        const mergedTags = pickedTags.length > 0
          ? [...new Set([...(card.tagIds ?? []), ...pickedTags])]
          : null
        await updateCardStep(card.id, effectiveAgendadoStepId, idconta, dueDateTime, mergedTags)
        if (finalDescription) await addCardNote(card.id, finalDescription, idconta)
      } else {
        await createCard(effectiveAgendadoStepId, activePanel?.id ?? clinicConfig.panelId, nome.trim(), finalDescription, activeContactId, idconta, dueDateTime, pickedTags)
      }

      let clinicorpStatus = null
      if (selectedDate && selectedSlot) {
        try {
          await scheduleClinicorp({
            patientName:  nome.trim(),
            patientPhone: telefone,
            dentistId:    selectedSlot.professionalId,
            dateLocal:    selectedDate,
            fromTime:     selectedSlot.from,
            toTime:       selectedSlot.to,
            notes:        finalDescription || 'Agendamento via Schedule Button',
          }, idconta, activeUnit?.id)
          clinicorpStatus = 'ok'
        } catch (err) {
          clinicorpStatus = err.message
        }
      }

      // Lembrete agendado — só após Clinicorp confirmado; falha nunca desfaz nada
      let reminderStatus = null
      const reminderCfg = clinicConfig?.scheduledMessage
      if (clinicorpStatus === 'ok' && reminderCfg?.enabled) {
        try {
          const prof = (clinicConfig?.professionals ?? []).find(p =>
            String(p.clinicorp_id) === selectedSlot.professionalId ||
            p.id === selectedSlot.professionalId
          )
          await scheduleReminder(reminderCfg, {
            patientName: nome.trim(),
            phone:       telefone,
            dateBr:      toBrDate(selectedDate),
            time:        selectedSlot.from,
            dentist:     prof?.name ?? '',
            clinicName:  clinicConfig?.name ?? '',
            scheduling:  reminderScheduling(reminderCfg.timing, selectedDate, selectedSlot.from),
          }, idconta)
          reminderStatus = 'ok'
        } catch (err) {
          console.warn('[Lembrete]', err.message)
          reminderStatus = err.message
        }
      }

      const baseText = card
        ? `Card movido para "${stepName}" com sucesso!`
        : `Card criado em "${stepName}" com sucesso!`

      if (clinicorpStatus === 'ok' && reminderStatus && reminderStatus !== 'ok') {
        setMessage({
          type: 'warning',
          text: `${baseText} Agendamento confirmado, mas o lembrete não foi programado: ${reminderStatus}`,
        })
      } else if (clinicorpStatus === 'ok') {
        const reminderNote = reminderStatus === 'ok' ? ' Lembrete programado.' : ''
        setMessage({ type: 'success', text: baseText + ' Agendamento no Clinicorp confirmado.' + reminderNote })
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
      setSelectedTagIds(new Set())
      setExistingCard(null)
      const hadIssue = (clinicorpStatus && clinicorpStatus !== 'ok') || (reminderStatus && reminderStatus !== 'ok')
      setTimeout(() => setMessage(null), hadIssue ? 12000 : 6000)
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

  // Dentistas presentes nos horários do dia — alimenta o filtro
  const slotDentists = [...new Set(availableSlots.map(s => s.professionalId))].map(pid => {
    const prof = professionals.find(p => String(p.clinicorp_id) === pid || p.id === pid)
    return { id: pid, name: prof?.name?.split(' ')[0] ?? 'Profissional' }
  })
  const visibleSlots = selectedDentistId
    ? availableSlots.filter(s => s.professionalId === selectedDentistId)
    : availableSlots

  return (
    <div className="page">
      {(dataLoading || stepsLoading) && (
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

                {/* Seletor de unidade — só aparece com 2+ unidades */}
                {(clinicConfig?.units?.length ?? 0) > 1 && (
                  <div className="form-section">
                    <span className="form-section-label">Unidade</span>
                    <div className="unit-selector">
                      {clinicConfig.units.map(unit => (
                        <button
                          key={unit.id}
                          type="button"
                          className={`unit-btn${selectedUnitId === unit.id ? ' unit-btn-active' : ''}`}
                          onClick={() => {
                            setSelectedUnitId(unit.id)
                            loadPanelData(clinicConfig, unit.id)
                            // Card existente depende do painel da unidade
                            findCardByContact(activeContactId, idconta, unit.panelId ?? clinicConfig.panelId)
                              .then(card => setExistingCard(card))
                              .catch(() => setExistingCard(null))
                            // Limpa slots e disponibilidade da unidade anterior
                            setSelectedDate(null)
                            setSelectedSlot(null)
                            setAvailableSlots([])
                            setAvailability(null)
                            setSelectedDentistId(null)
                          }}
                        >
                          {unit.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Busca manual — só quando a URL não traz contactId */}
                {!contactId && (
                  <div className="form-section">
                    <span className="form-section-label">Contato no CRM</span>
                    {linkedContact ? (
                      <div className="contact-linked">
                        <span>✓ Vinculado a <strong>{linkedContact.name}</strong></span>
                        <button type="button" className="contact-unlink-btn" onClick={handleUnlinkContact}>
                          desvincular
                        </button>
                      </div>
                    ) : (
                      <div className="form-group">
                        <label>Buscar contato por telefone</label>
                        <div className="contact-search-row">
                          <input
                            type="tel"
                            value={contactSearch}
                            onChange={e => { setContactSearch(e.target.value); setContactSearchMsg('') }}
                            placeholder="Ex: (92) 98765-4321"
                          />
                          <button
                            type="button"
                            className="btn-secondary contact-search-btn"
                            disabled={searchingContact || !contactSearch.trim()}
                            onClick={handleSearchContact}
                          >
                            {searchingContact
                              ? <span className="btn-loading"><span className="spinner spinner-dark" /></span>
                              : 'Buscar'}
                          </button>
                        </div>
                        {contactSearchMsg && <span className="field-hint">{contactSearchMsg}</span>}
                      </div>
                    )}
                  </div>
                )}

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
                  <span className="form-section-label">Observações</span>
                  <div className="form-group">
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
                    disabled={!nome.trim() || phoneInvalid || loading}
                  >
                    {loading
                      ? <span className="btn-loading"><span className="spinner" />Salvando...</span>
                      : 'Próximo: Escolher Horário →'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ── ETAPA 2: Calendário Clinicorp ── */}
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
                  availability={availability}
                  onDayClick={handleDayClick}
                  onPrevMonth={prevMonth}
                  onNextMonth={nextMonth}
                />

                {selectedDate && (
                  <div className="slots-section">
                    <div className="slots-header">Horários disponíveis</div>

                    {/* Filtro por dentista — só com 2+ profissionais no dia */}
                    {!slotsLoading && slotDentists.length >= 2 && (
                      <div className="dentist-filter">
                        <button
                          type="button"
                          className={`dentist-chip${!selectedDentistId ? ' dentist-chip-active' : ''}`}
                          onClick={() => { setSelectedDentistId(null); setSelectedSlot(null) }}
                        >
                          Qualquer disponível
                        </button>
                        {slotDentists.map(d => (
                          <button
                            key={d.id}
                            type="button"
                            className={`dentist-chip${selectedDentistId === d.id ? ' dentist-chip-active' : ''}`}
                            onClick={() => {
                              setSelectedDentistId(prev => prev === d.id ? null : d.id)
                              setSelectedSlot(null)
                            }}
                          >
                            {d.name}
                          </button>
                        ))}
                      </div>
                    )}

                    <SlotPicker
                      loading={slotsLoading}
                      error={slotsError}
                      slots={visibleSlots}
                      emptyMessage={selectedDentistId && availableSlots.length > 0
                        ? 'Nenhum horário deste dentista nesta data.'
                        : undefined}
                      selectedSlot={selectedSlot}
                      onSelectSlot={setSelectedSlot}
                      professionals={professionals}
                    />
                  </div>
                )}
              </div>

              {selectedSlot && (() => {
                const prof = professionals.find(p =>
                  String(p.clinicorp_id) === selectedSlot.professionalId ||
                  p.id === selectedSlot.professionalId
                )
                return (
                  <div className="slot-summary">
                    ✓ {selectedDate} às {selectedSlot.from}
                    {prof ? ` · ${prof.name.split(' ')[0]}` : ''}
                  </div>
                )
              })()}

              {panelTags.length > 0 && (
                <div className="tags-section">
                  <span className="form-section-label">Etiquetas do card</span>
                  <TagChips
                    tags={panelTags}
                    selectedIds={selectedTagIds}
                    onToggle={toggleTag}
                  />
                </div>
              )}

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
