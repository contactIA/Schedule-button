import { useState, useEffect, useRef } from 'react'
import './Setup.css'

// Normaliza string para slug: "Clínica ABC" → "clinica-abc"
function toSlug(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

// ── Seleção de painéis — helpers compartilhados (cadastro + edição) ──
function buildPickedPanel(panel) {
  return {
    id:            panel.id,
    name:          panel.title || panel.name || '',
    displayName:   panel.title || panel.name || '',
    agendadoStepId: panel.steps?.[0]?.id ?? '',
    steps:         panel.steps ?? [],
    tags:          panel.tags  ?? [],
    // Todas permitidas por padrão; admin desmarca as restritas
    allowedTagIds: (panel.tags ?? []).map(t => t.id),
  }
}

function togglePanelIn(list, panel) {
  return list.find(p => p.id === panel.id)
    ? list.filter(p => p.id !== panel.id)
    : [...list, buildPickedPanel(panel)]
}

function updatePanelIn(list, id, field, value) {
  return list.map(p => p.id === id ? { ...p, [field]: value } : p)
}

function toggleTagIn(list, panelId, tagId) {
  return list.map(p => {
    if (p.id !== panelId) return p
    const allowedTagIds = p.allowedTagIds.includes(tagId)
      ? p.allowedTagIds.filter(id => id !== tagId)
      : [...p.allowedTagIds, tagId]
    return { ...p, allowedTagIds }
  })
}

// ── Lembrete de agendamento (mensagem agendada) ───────────────────
const REMINDER_VARS = [
  { id: 'patient_name', label: 'Nome do paciente' },
  { id: 'date',         label: 'Data da consulta' },
  { id: 'time',         label: 'Horário da consulta' },
  { id: 'dentist',      label: 'Nome do dentista' },
  { id: 'clinic_name',  label: 'Nome da clínica' },
]

// Sugere a variável pelo nome do parâmetro do modelo ([NOME], [DATA]...)
function guessReminderVar(paramName) {
  const n = (paramName || '').toUpperCase()
  if (n.includes('DENT'))                  return 'dentist'
  if (n.includes('CLIN'))                  return 'clinic_name'
  if (n.includes('NOME'))                  return 'patient_name'
  if (n.includes('DATA') || n.includes('DIA')) return 'date'
  if (n.includes('HOR'))                   return 'time'
  return 'patient_name'
}

function ReminderConfig({ channels, value, onChange, loadTemplates }) {
  const cfg = value ?? { enabled: false }
  const set = (patch) => onChange({ ...cfg, ...patch })
  const mode = cfg.timing?.mode ?? 'day_before'

  // Modelos do canal escolhido — filtrados pela própria Helena (ChannelId),
  // recarregados a cada troca de canal. tplData guarda de qual canal é o
  // resultado; canal diferente do cfg = ainda carregando.
  const [tplData, setTplData] = useState({ channelId: null, list: [], error: '' })

  useEffect(() => {
    if (!cfg.enabled || !cfg.channelId) return
    let alive = true
    loadTemplates(cfg.channelId)
      .then(list => { if (alive) setTplData({ channelId: cfg.channelId, list, error: '' }) })
      .catch(err => { if (alive) setTplData({ channelId: cfg.channelId, list: [], error: err.message }) })
    return () => { alive = false }
  }, [cfg.enabled, cfg.channelId]) // eslint-disable-line react-hooks/exhaustive-deps

  const tplReady          = tplData.channelId === cfg.channelId
  const channelTemplates  = tplReady ? tplData.list : []
  const tplError          = tplReady ? tplData.error : ''
  const tplLoading        = !!cfg.channelId && !tplReady

  const template = channelTemplates.find(t => t.id === cfg.templateId)

  return (
    <div className="admin-field">
      <label>Lembrete de agendamento</label>
      <button
        type="button"
        className={`reminder-toggle${cfg.enabled ? ' reminder-toggle-on' : ''}`}
        onClick={() => set({ enabled: !cfg.enabled })}
      >
        <span className="reminder-toggle-knob" />
        {cfg.enabled ? 'Ativado' : 'Desativado'}
      </button>
      <span className="admin-field-hint">
        Agenda uma mensagem de WhatsApp para o paciente após a confirmação no Clinicorp.
        Exige o app <strong>Mensagens agendadas</strong> habilitado na conta Helena.
      </span>

      {cfg.enabled && (
        <div className="reminder-config">
          <div className="admin-field">
            <label>Canal de envio *</label>
            <select
              className="step-select"
              value={cfg.channelId ?? ''}
              onChange={e => {
                const ch = channels.find(c => c.id === e.target.value)
                const patch = { channelId: ch?.id ?? '', channelFrom: ch?.number ?? '', channelName: ch?.label ?? '' }
                // Trocou de canal → modelo do canal anterior não vale mais
                if ((ch?.id ?? '') !== (cfg.channelId ?? '')) {
                  patch.templateId = ''
                  patch.templateName = ''
                  patch.paramMap = {}
                }
                set(patch)
              }}
            >
              <option value="">Selecione o canal...</option>
              {channels.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>

          <div className="admin-field">
            <label>Modelo de mensagem *</label>
            <select
              className="step-select"
              value={cfg.templateId ?? ''}
              disabled={!cfg.channelId || tplLoading}
              onChange={e => {
                const t = channelTemplates.find(x => x.id === e.target.value)
                const paramMap = {}
                for (const p of t?.params ?? []) paramMap[p] = guessReminderVar(p)
                set({ templateId: t?.id ?? '', templateName: t?.name ?? '', paramMap })
              }}
            >
              <option value="">
                {!cfg.channelId ? 'Selecione primeiro o canal'
                  : tplLoading ? 'Carregando modelos...'
                  : 'Selecione o modelo...'}
              </option>
              {channelTemplates.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <span className="admin-field-hint">
              {tplError ? `⚠ ${tplError}`
                : !cfg.channelId ? 'Escolha o canal de envio para listar os modelos dele.'
                : tplLoading ? 'Buscando modelos do canal na Helena...'
                : channelTemplates.length === 0 ? 'Nenhum modelo aprovado para este canal na conta Helena.'
                : 'Modelos aprovados do canal selecionado.'}
            </span>
          </div>

          {template?.params?.length > 0 && (
            <div className="admin-field">
              <label>Variáveis do modelo</label>
              <div className="reminder-params">
                {template.params.map(p => (
                  <div key={p} className="reminder-param-row">
                    <code>{p}</code>
                    <span className="reminder-param-arrow">→</span>
                    <select
                      className="step-select"
                      value={cfg.paramMap?.[p] ?? 'patient_name'}
                      onChange={e => set({ paramMap: { ...cfg.paramMap, [p]: e.target.value } })}
                    >
                      {REMINDER_VARS.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="admin-field">
            <label>Quando enviar *</label>
            <select
              className="step-select"
              value={mode}
              onChange={e => set({ timing: { ...cfg.timing, mode: e.target.value } })}
            >
              <option value="day_before">Na véspera da consulta</option>
              <option value="hours_before">Horas antes da consulta</option>
              <option value="immediate">Logo após o agendamento</option>
            </select>
            {mode === 'day_before' && (
              <div className="reminder-timing-row">
                <span>às</span>
                <input
                  type="time"
                  value={cfg.timing?.time ?? '18:00'}
                  onChange={e => set({ timing: { ...cfg.timing, mode, time: e.target.value } })}
                />
              </div>
            )}
            {mode === 'hours_before' && (
              <div className="reminder-timing-row">
                <input
                  type="number" min="1" max="72"
                  value={cfg.timing?.hours ?? 24}
                  onChange={e => set({ timing: { ...cfg.timing, mode, hours: Number(e.target.value) } })}
                />
                <span>hora(s) antes</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Seletor de painéis com config de etapa e etiquetas ────────────
function PanelPicker({ panels, picked, onTogglePanel, onUpdatePanel, onToggleTag }) {
  return (
    <div className="panels-list">
      {panels.map(panel => {
        const p = picked.find(x => x.id === panel.id)
        return (
          <div key={panel.id} className={`panel-item${p ? ' panel-item-active' : ''}`}>
            <button
              type="button"
              className="panel-item-toggle"
              onClick={() => onTogglePanel(panel)}
            >
              <span className={`panel-item-check${p ? ' checked' : ''}`}>
                {p ? '✓' : '+'}
              </span>
              <span className="panel-item-title">{panel.title || panel.id}</span>
            </button>

            {p && (
              <div className="panel-item-config">
                <div className="admin-field">
                  <label>Nome que o operador verá</label>
                  <input
                    type="text"
                    value={p.displayName}
                    onChange={e => onUpdatePanel(panel.id, 'displayName', e.target.value)}
                    placeholder={panel.title || 'Ex: CRC A, Urgência...'}
                  />
                </div>
                {p.steps.length > 0 && (
                  <div className="admin-field">
                    <label>Etapa que aciona o Clinicorp</label>
                    <select
                      value={p.agendadoStepId}
                      onChange={e => onUpdatePanel(panel.id, 'agendadoStepId', e.target.value)}
                      className="step-select"
                    >
                      {p.steps.map(s => (
                        <option key={s.id} value={s.id}>{s.title || s.name || s.id}</option>
                      ))}
                    </select>
                  </div>
                )}
                {p.tags.length > 0 && (
                  <div className="admin-field">
                    <label>Etiquetas que o operador pode aplicar</label>
                    <div className="tag-pick-grid">
                      {p.tags.map(tag => {
                        const allowed = p.allowedTagIds.includes(tag.id)
                        return (
                          <button
                            key={tag.id}
                            type="button"
                            className={`tag-pick${allowed ? ' tag-pick-active' : ''}`}
                            style={allowed ? { background: tag.bgColor, color: tag.nameColor } : undefined}
                            onClick={() => onToggleTag(panel.id, tag.id)}
                          >
                            {allowed ? '✓ ' : ''}{tag.name}
                          </button>
                        )
                      })}
                    </div>
                    <span className="admin-field-hint">
                      Desmarque as etiquetas que o operador não deve poder aplicar.
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Password Modal ────────────────────────────────────────────────
function PasswordModal({ onSuccess, onCancel }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  const [shake, setShake] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  // Valida no servidor (x-admin-key) e já recebe a lista de clínicas
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!value || checking) return
    setChecking(true)
    setError('')
    try {
      const res = await fetch('/api/clinics', { headers: { 'x-admin-key': value } })
      const data = await res.json().catch(() => ({}))
      if (res.status === 401) throw new Error('Senha incorreta.')
      if (!res.ok) throw new Error(data.error || 'Erro ao conectar com o servidor.')
      onSuccess(value, data.clinics ?? [])
    } catch (err) {
      setError(err.message)
      setShake(true)
      setValue('')
      setTimeout(() => setShake(false), 500)
      inputRef.current?.focus()
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className={`modal-card ${shake ? 'modal-shake' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="modal-icon">🔐</div>
        <h2 className="modal-title">Área restrita</h2>
        <p className="modal-sub">Digite a senha de administrador para continuar.</p>
        <form onSubmit={handleSubmit} className="modal-form">
          <input
            ref={inputRef}
            type="password"
            value={value}
            onChange={e => { setValue(e.target.value); setError('') }}
            placeholder="Senha"
            className={`modal-input ${error ? 'modal-input-error' : ''}`}
            autoComplete="current-password"
          />
          {error && <span className="modal-error">{error}</span>}
          <button type="submit" className="modal-btn" disabled={!value || checking}>
            {checking ? 'Verificando...' : 'Entrar'}
          </button>
        </form>
        <button className="modal-cancel" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  )
}

// ── Lista de clínicas ─────────────────────────────────────────────
function ClinicList({ clinics, flash, onEdit, onNew }) {
  return (
    <div className="admin-wrap">
      <div className="admin-card">
        <div className="admin-header">
          <div className="admin-logo">
            <div className="admin-logo-mark">S</div>
            <span>Schedule Button</span>
          </div>
          <span className="admin-badge">Admin</span>
        </div>

        <div className="admin-form">
          <div className="admin-step-header">
            <h2>Clínicas cadastradas</h2>
            <p>Edite uma clínica existente ou cadastre uma nova.</p>
          </div>

          {flash && <div className="clinic-flash">✓ {flash}</div>}

          {clinics.length === 0 && (
            <p className="clinic-empty">Nenhuma clínica cadastrada ainda.</p>
          )}

          <div className="clinic-list">
            {clinics.map(c => (
              <div key={c.id} className="clinic-row">
                <div className="clinic-row-info">
                  <span className="clinic-row-name">{c.name}</span>
                  <span className="clinic-row-meta">
                    idconta: {c.helenaAccountId || '—'} · {c.unitsCount} unidade(s)
                  </span>
                </div>
                <div className="clinic-row-actions">
                  <span className={`clinic-status${c.active ? '' : ' clinic-status-off'}`}>
                    {c.active ? 'ativa' : 'inativa'}
                  </span>
                  <button type="button" className="clinic-edit-btn" onClick={() => onEdit(c.id)}>
                    Editar
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="admin-actions">
            <button type="button" className="admin-btn-primary" onClick={onNew}>
              + Cadastrar nova clínica
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Editor de unidade (criar + editar) ────────────────────────────
// Token Clinicorp é write-only: o campo sempre inicia vazio e só é
// enviado quando preenchido. Trocar credencial revalida businessId
// e codeLink no servidor.
function UnitEditor({ adminKey, clinicId, unit, onSaved, onCancel, onDeleted }) {
  const isNew = !unit
  const [expanded,     setExpanded]     = useState(isNew)
  const [name,         setName]         = useState(unit?.name ?? '')
  const [user,         setUser]         = useState(unit?.clinicorpUser ?? '')
  const [token,        setToken]        = useState('')
  const [subscriberId, setSubscriberId] = useState(unit?.subscriberId ?? '')
  const [codeLink,     setCodeLink]     = useState(unit?.codeLink != null ? String(unit.codeLink) : '')
  const [busy,    setBusy]    = useState(false)
  const [error,   setError]   = useState('')
  const [savedOk, setSavedOk] = useState(false)

  // Profissionais agendáveis — buscados ao vivo do Clinicorp ao expandir,
  // direto da credencial desta unidade (nome sempre correto, sem sync)
  const [profList,    setProfList]    = useState(null)
  const [profError,   setProfError]   = useState('')
  const [bookableIds, setBookableIds] = useState(unit?.bookableProfessionalIds ?? [])

  useEffect(() => {
    if (!expanded || isNew || profList !== null) return
    fetch(`/api/units?id=${unit.id}&professionals=1`, { headers: { 'x-admin-key': adminKey } })
      .then(async r => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.error || `Erro HTTP ${r.status}`)
        return d
      })
      .then(d => {
        setProfList(d.professionals ?? [])
        setBookableIds(d.bookableProfessionalIds ?? [])
      })
      .catch(err => { setProfList([]); setProfError(err.message) })
  }, [expanded]) // eslint-disable-line react-hooks/exhaustive-deps

  const call = async (method, body) => {
    const res = await fetch('/api/units', {
      method,
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `Erro HTTP ${res.status}`)
    return data
  }

  const handleSave = async () => {
    setError('')
    let body
    if (isNew) {
      if (!name.trim() || !user.trim() || !token.trim()) {
        setError('Nome, usuário e token são obrigatórios.')
        return
      }
      body = {
        clinicId,
        name, clinicorpUser: user, clinicorpToken: token,
        subscriberId: subscriberId || undefined,
        codeLink:     codeLink     || undefined,
      }
    } else {
      // Envia somente o que mudou — credencial intacta não revalida à toa
      body = { id: unit.id }
      if (name.trim() && name !== unit.name)            body.name = name
      if (user.trim() && user !== unit.clinicorpUser)   body.clinicorpUser = user
      if (token.trim())                                  body.clinicorpToken = token
      if (subscriberId.trim() && subscriberId !== (unit.subscriberId ?? '')) body.subscriberId = subscriberId
      if (codeLink.trim() && String(codeLink) !== String(unit.codeLink ?? '')) body.codeLink = codeLink
      const savedIds = unit.bookableProfessionalIds ?? []
      if (profList !== null && JSON.stringify([...bookableIds].sort()) !== JSON.stringify([...savedIds].sort())) {
        body.bookableProfessionalIds = bookableIds
      }
      if (Object.keys(body).length === 1) {
        setError('Nenhuma alteração para salvar.')
        return
      }
    }

    setBusy(true)
    try {
      const data = isNew ? await call('POST', body) : await call('PUT', body)
      setToken('')
      setBookableIds(data.unit?.bookableProfessionalIds ?? [])
      setSavedOk(true)
      setTimeout(() => setSavedOk(false), 2500)
      onSaved(data.unit)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleToggleActive = async () => {
    setBusy(true)
    setError('')
    try {
      const data = await call('PUT', { id: unit.id, active: !unit.active })
      onSaved(data.unit)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm(`Excluir a unidade "${unit.name}"? Essa ação não pode ser desfeita.`)) return
    setBusy(true)
    setError('')
    try {
      await call('DELETE', { id: unit.id })
      onDeleted?.(unit.id)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className={`unit-card${unit && !unit.active ? ' unit-card-inactive' : ''}`}>
      <div className="unit-card-header" onClick={() => setExpanded(v => !v)}>
        <span className="unit-card-name">
          {isNew ? 'Nova unidade' : (unit.name || 'Unidade')}
          {unit && !unit.active && <span className="unit-badge-off"> inativa</span>}
        </span>
        <div className="unit-card-actions">
          {isNew && onCancel && (
            <button type="button" className="unit-remove-btn"
              onClick={e => { e.stopPropagation(); onCancel() }}>✕</button>
          )}
          <span className="unit-toggle">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div className="unit-card-body">
          <div className="admin-field">
            <label>Nome da unidade *</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="Ex: Unidade Centro" />
          </div>

          <div className="admin-field">
            <label>Usuário API Clinicorp *</label>
            <input type="text" value={user} onChange={e => setUser(e.target.value)}
              placeholder="Ex: clinicasorriso" autoComplete="off" />
          </div>

          <div className="admin-field">
            <label>Token API Clinicorp {isNew ? '*' : ''}</label>
            <input type="password" value={token} onChange={e => setToken(e.target.value)}
              placeholder={isNew ? 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' : 'Manter token atual'}
              autoComplete="new-password" />
            {!isNew && <span className="admin-field-hint">Preencha somente para substituir o token atual.</span>}
          </div>

          <div className="admin-field">
            <label>Subscriber ID <span style={{fontWeight:400,color:'#94a3b8'}}>(opcional)</span></label>
            <input type="text" value={subscriberId} onChange={e => setSubscriberId(e.target.value.trim())} />
          </div>

          <div className="admin-field">
            <label>Code Link <span style={{fontWeight:400,color:'#94a3b8'}}>(opcional)</span></label>
            <input type="text" value={codeLink}
              onChange={e => setCodeLink(e.target.value.trim())}
              placeholder="Buscado automaticamente" />
          </div>

          {!isNew && (
            <span className="admin-field-hint">
              businessId: <strong>{unit.businessId ?? '—'}</strong> · codeLink: <strong>{unit.codeLink ?? '—'}</strong>
              {' '}— revalidados automaticamente ao trocar a credencial.
            </span>
          )}

          {!isNew && (
            <div className="admin-field">
              <label>Profissionais agendáveis</label>
              {profList === null && !profError && (
                <span className="admin-field-hint">Carregando profissionais do Clinicorp...</span>
              )}
              {profError && <span className="admin-field-hint">⚠ {profError}</span>}
              {profList !== null && !profError && profList.length === 0 && (
                <span className="admin-field-hint">Nenhum profissional encontrado no Clinicorp desta unidade.</span>
              )}
              {profList?.length > 0 && (
                <>
                  <div className="tag-pick-grid">
                    {profList.map(p => {
                      const on = bookableIds.includes(p.id)
                      return (
                        <button
                          key={p.id}
                          type="button"
                          className={`tag-pick${on ? ' tag-pick-active' : ''}`}
                          onClick={() => setBookableIds(prev =>
                            on ? prev.filter(x => x !== p.id) : [...prev, p.id])}
                        >
                          {on ? '✓ ' : ''}{p.name}
                        </button>
                      )
                    })}
                  </div>
                  <span className="admin-field-hint">
                    {bookableIds.length === 0
                      ? 'Nenhum selecionado = todos aparecem para agendamento.'
                      : 'Somente os selecionados aparecem para agendamento. Salvo com "Salvar unidade".'}
                  </span>
                </>
              )}
            </div>
          )}

          {error   && <div className="admin-error-box">{error}</div>}
          {savedOk && <div className="clinic-flash">✓ Unidade salva.</div>}

          <div className="unit-editor-actions">
            {!isNew && (
              <button type="button" className="admin-btn-danger" disabled={busy}
                onClick={handleDelete}>
                Excluir
              </button>
            )}
            {!isNew && (
              <button type="button" className="admin-btn-secondary" disabled={busy}
                onClick={handleToggleActive}>
                {unit.active ? 'Desativar' : 'Reativar'}
              </button>
            )}
            <button type="button" className="admin-btn-primary" disabled={busy} onClick={handleSave}>
              {busy
                ? <span className="admin-btn-loading"><span className="admin-spinner" />Salvando...</span>
                : isNew ? 'Criar unidade' : 'Salvar unidade'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Edição de clínica ─────────────────────────────────────────────
function EditClinic({ adminKey, clinicId, onSaved, onCancel, onDeleted }) {
  const [loading,   setLoading]   = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving,    setSaving]    = useState(false)
  const [saveError, setSaveError] = useState('')
  const [deleting,  setDeleting]  = useState(false)

  const [clinic,       setClinic]       = useState(null)
  const [name,         setName]         = useState('')
  const [slug,         setSlug]         = useState('')
  const [newToken,     setNewToken]     = useState('')
  const [helenaPanels, setHelenaPanels] = useState([])
  const [pickedPanels, setPickedPanels] = useState([])
  const [channels,     setChannels]     = useState([])
  const [reminder,     setReminder]     = useState(null)
  const [clinicActive,  setClinicActive]  = useState(true)
  const [units,         setUnits]         = useState([])
  const [addingUnit,    setAddingUnit]    = useState(false)

  // Modelos do lembrete são buscados por canal, filtrados pela Helena
  const loadReminderTemplates = async (channelId) => {
    const res = await fetch(
      `/api/helena-preview?clinicId=${clinicId}&templates=1&channelId=${encodeURIComponent(channelId)}&_t=${Date.now()}`,
      { headers: { 'x-admin-key': adminKey } }
    )
    const d = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(d.error || `Erro HTTP ${res.status}`)
    return d.templates ?? []
  }

  useEffect(() => {
    const headers = { 'x-admin-key': adminKey }
    const getJson = async (r) => {
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `Erro HTTP ${r.status}`)
      return d
    }

    Promise.all([
      fetch(`/api/clinics?id=${clinicId}`, { headers }).then(getJson),
      fetch(`/api/helena-preview?clinicId=${clinicId}&_t=${Date.now()}`, { headers }).then(getJson),
    ])
      .then(([detail, preview]) => {
        setClinic(detail)
        setName(detail.name ?? '')
        setSlug(detail.slug ?? '')
        setClinicActive(detail.active !== false)
        setUnits(detail.units ?? [])
        setChannels(preview.channels ?? [])
        setReminder(detail.scheduledMessage ?? null)
        const live = preview.panels ?? []
        setHelenaPanels(live)

        // Reconstrói a seleção salva com steps/tags ao vivo do Helena
        const picked = (detail.helenaPanels ?? []).map(saved => {
          const panel = live.find(p => p.id === saved.id)
          if (!panel) return null // painel apagado no Helena
          const base = buildPickedPanel(panel)
          return {
            ...base,
            displayName:   saved.name || base.displayName,
            agendadoStepId: saved.agendadoStepId || base.agendadoStepId,
            allowedTagIds: Array.isArray(saved.allowedTagIds)
              ? saved.allowedTagIds.filter(id => base.tags.some(t => t.id === id))
              : base.allowedTagIds,
          }
        }).filter(Boolean)

        // Clínica legada sem helena_panels → marca o painel principal
        if (picked.length === 0 && detail.helenaPanelId) {
          const panel = live.find(p => p.id === detail.helenaPanelId)
          if (panel) {
            const base = buildPickedPanel(panel)
            picked.push({ ...base, agendadoStepId: detail.agendadoStepId || base.agendadoStepId })
          }
        }
        setPickedPanels(picked)
      })
      .catch(err => setLoadError(err.message))
      .finally(() => setLoading(false))
  }, [adminKey, clinicId])

  const handleSave = async (e) => {
    e.preventDefault()
    if (reminder?.enabled && (!reminder.channelId || !reminder.templateId)) {
      setSaveError('Lembrete ativado: selecione o canal e o modelo de mensagem.')
      return
    }
    setSaving(true)
    setSaveError('')
    try {
      const res = await fetch('/api/clinics', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({
          id:          clinicId,
          name,
          slug,
          active:      clinicActive,
          helenaToken: newToken.trim() || undefined,
          // undefined → não mexe na config salva (tolera banco sem a coluna)
          scheduledMessage: reminder ?? undefined,
          helenaPanels: pickedPanels.map(p => ({
            id:            p.id,
            name:          p.displayName || p.name,
            agendadoStepId: p.agendadoStepId,
            allowedTagIds: p.allowedTagIds,
          })),
          helenaSteps: (pickedPanels[0]?.steps ?? []).map(s => ({ id: s.id, name: s.title || s.name || s.id })),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Erro HTTP ${res.status}`)
      onSaved(name)
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteClinic = async () => {
    if (!window.confirm(`Excluir a clínica "${name}" e todas as suas unidades? Essa ação não pode ser desfeita.`)) return
    setDeleting(true)
    setSaveError('')
    try {
      const res = await fetch('/api/clinics', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ id: clinicId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Erro HTTP ${res.status}`)
      onDeleted(name)
    } catch (err) {
      setSaveError(err.message)
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="admin-wrap">
        <div className="admin-card">
          <div className="edit-loading">
            <span className="admin-spinner" style={{ borderTopColor: '#475569' }} />
            Carregando clínica...
          </div>
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="admin-wrap">
        <div className="admin-card">
          <div className="admin-form">
            <div className="admin-error-box">{loadError}</div>
            <div className="admin-actions">
              <button type="button" className="admin-btn-secondary" onClick={onCancel}>← Voltar</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-wrap">
      <div className="admin-card">
        <div className="admin-header">
          <div className="admin-logo">
            <div className="admin-logo-mark">S</div>
            <span>Schedule Button</span>
          </div>
          <span className="admin-badge">Admin</span>
        </div>

        <form onSubmit={handleSave} className="admin-form">
          <div className="admin-step-header">
            <h2>Editar clínica</h2>
            <p>idconta: <strong>{clinic.helenaAccountId || '—'}</strong></p>
          </div>

          <div className="admin-field">
            <label>Nome da clínica *</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} required />
          </div>

          <div className="admin-field">
            <label>Slug</label>
            <input type="text" value={slug} onChange={e => setSlug(toSlug(e.target.value))} pattern="[a-z0-9-]+" />
          </div>

          <div className="admin-field">
            <label>Token Helena</label>
            <input
              type="password"
              value={newToken}
              onChange={e => setNewToken(e.target.value)}
              placeholder="Manter token atual"
              autoComplete="new-password"
            />
            <span className="admin-field-hint">Preencha somente para substituir o token atual.</span>
          </div>

          <ReminderConfig
            channels={channels}
            value={reminder}
            onChange={setReminder}
            loadTemplates={loadReminderTemplates}
          />

          <div className="admin-field">
            <label>Status da clínica</label>
            <button
              type="button"
              className={`reminder-toggle${clinicActive ? ' reminder-toggle-on' : ''}`}
              onClick={() => setClinicActive(v => !v)}
            >
              <span className="reminder-toggle-knob" />
              {clinicActive ? 'Ativa' : 'Inativa'}
            </button>
            <span className="admin-field-hint">
              Clínica inativa não carrega no botão de agendamento. Salvo junto com "Salvar alterações".
            </span>
          </div>

          <div className="admin-field">
            <label>Unidades Clinicorp</label>
            <div className="units-list">
              {units.map(u => (
                <UnitEditor
                  key={u.id}
                  adminKey={adminKey}
                  clinicId={clinicId}
                  unit={u}
                  onSaved={nu => setUnits(prev => prev.map(x => x.id === nu.id ? nu : x))}
                  onDeleted={id => setUnits(prev => prev.filter(x => x.id !== id))}
                />
              ))}
              {addingUnit && (
                <UnitEditor
                  adminKey={adminKey}
                  clinicId={clinicId}
                  unit={null}
                  onSaved={nu => { setUnits(prev => [...prev, nu]); setAddingUnit(false) }}
                  onCancel={() => setAddingUnit(false)}
                />
              )}
            </div>
            {!addingUnit && (
              <button type="button" className="admin-add-unit-btn" onClick={() => setAddingUnit(true)}>
                + Adicionar unidade
              </button>
            )}
            <span className="admin-field-hint">
              Cada unidade salva na hora, independente do botão "Salvar alterações".
            </span>
          </div>

          <div className="admin-field">
            <label>Painéis, etapas e etiquetas *</label>
            <PanelPicker
              panels={helenaPanels}
              picked={pickedPanels}
              onTogglePanel={(panel) => setPickedPanels(prev => togglePanelIn(prev, panel))}
              onUpdatePanel={(id, field, value) => setPickedPanels(prev => updatePanelIn(prev, id, field, value))}
              onToggleTag={(panelId, tagId) => setPickedPanels(prev => toggleTagIn(prev, panelId, tagId))}
            />
            {pickedPanels.length === 0 && (
              <span className="admin-field-hint" style={{ color: '#dc2626' }}>
                Selecione pelo menos um painel.
              </span>
            )}
          </div>

          {saveError && <div className="admin-error-box">{saveError}</div>}

          <div className="admin-actions">
            <button type="button" className="admin-btn-secondary" onClick={onCancel}>← Cancelar</button>
            <button
              type="submit"
              className="admin-btn-primary"
              disabled={saving || !name.trim() || pickedPanels.length === 0 || pickedPanels.some(p => !p.agendadoStepId)}
            >
              {saving
                ? <span className="admin-btn-loading"><span className="admin-spinner" />Salvando...</span>
                : 'Salvar alterações'}
            </button>
          </div>

          <div className="admin-danger-zone">
            <button type="button" className="admin-btn-danger" disabled={deleting} onClick={handleDeleteClinic}>
              {deleting ? 'Excluindo...' : 'Excluir clínica'}
            </button>
            <span className="admin-field-hint">
              Remove a clínica e todas as unidades. Não pode ser desfeito.
            </span>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Admin Form ────────────────────────────────────────────────────
const TOTAL_STEPS = 3

function AdminForm({ adminKey, onSuccess, onBack }) {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)

  const [clinicName, setClinicName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [helenaToken,   setHelenaToken]   = useState('')
  const [helenaPanels,  setHelenaPanels]  = useState([])   // todos os painéis da conta
  const [pickedPanels,  setPickedPanels]  = useState([])   // painéis escolhidos pelo admin
  // pickedPanels: [{ id, name, displayName, agendadoStepId, steps }]
  const [stepsLoading,  setStepsLoading]  = useState(false)
  const [stepsError,    setStepsError]    = useState('')
  const [channels,      setChannels]      = useState([])
  const [reminder,      setReminder]      = useState(null)

  // Modelos do lembrete são buscados por canal, filtrados pela Helena
  const loadReminderTemplates = async (channelId) => {
    const res = await fetch(
      `/api/helena-preview?token=${encodeURIComponent(helenaToken.trim())}&templates=1&channelId=${encodeURIComponent(channelId)}&_t=${Date.now()}`,
      { headers: { 'x-admin-key': adminKey } }
    )
    const d = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(d.error || `Erro HTTP ${res.status}`)
    return d.templates ?? []
  }

  // Unidades Clinicorp (multi-unidade)
  const [units, setUnits] = useState([{
    name: 'Unidade Principal', clinicorpUser: '', clinicorpToken: '',
    subscriberId: '', codeLink: '', helenaPanelId: '', agendadoStepId: '',
    helenaSteps: [], expanded: true,
  }])
  const [submitError, setSubmitError] = useState('')

  const addUnit = () => setUnits(u => [...u, {
    name: `Unidade ${u.length + 1}`, clinicorpUser: '', clinicorpToken: '',
    subscriberId: '', codeLink: '', helenaPanelId: '', agendadoStepId: '',
    helenaSteps: [], expanded: true,
  }])

  const removeUnit = (i) => setUnits(u => u.filter((_, idx) => idx !== i))

  const updateUnit = (i, field, value) =>
    setUnits(u => u.map((unit, idx) => idx === i ? { ...unit, [field]: value } : unit))

  const toggleUnit = (i) =>
    setUnits(u => u.map((unit, idx) => idx === i ? { ...unit, expanded: !unit.expanded } : unit))

  const handleNameChange = (val) => {
    setClinicName(val)
    if (!slugEdited) setSlug(toSlug(val))
  }

  const handleSlugChange = (val) => {
    setSlug(toSlug(val))
    setSlugEdited(true)
  }

  const handleVerifyHelena = async () => {
    if (!helenaToken.trim()) return
    setStepsLoading(true)
    setStepsError('')
    setHelenaPanels([])
    setPickedPanels([])
    try {
      const res = await fetch(`/api/helena-preview?token=${encodeURIComponent(helenaToken.trim())}&_t=${Date.now()}`, {
        headers: { 'x-admin-key': adminKey },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao verificar token')
      setHelenaPanels(data.panels ?? [])
      setChannels(data.channels ?? [])
    } catch (err) {
      setStepsError(err.message)
    } finally {
      setStepsLoading(false)
    }
  }

  const handleNext = (e) => {
    e.preventDefault()
    setStep(s => s + 1)
  }

  const handleBack = () => setStep(s => s - 1)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setSubmitError('')
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({
          clinicName,
          slug,
          helenaToken,
          // Painel principal = primeiro painel escolhido (fallback de compatibilidade)
          helenaPanelId:   pickedPanels[0]?.id ?? '',
          agendadoStepId:  pickedPanels[0]?.agendadoStepId ?? '',
          helenaSteps:     (pickedPanels[0]?.steps ?? []).map(s => ({ id: s.id, name: s.title || s.name || s.id })),
          // Todos os painéis escolhidos com seus nomes, steps e etiquetas permitidas
          helenaPanels: pickedPanels.map(p => ({
            id:            p.id,
            name:          p.displayName || p.name,
            agendadoStepId: p.agendadoStepId,
            allowedTagIds: p.allowedTagIds,
          })),
          scheduledMessage: reminder ?? undefined,
          units: units.map(u => ({
            name:            u.name,
            clinicorpUser:   u.clinicorpUser,
            clinicorpToken:  u.clinicorpToken,
            subscriberId:    u.subscriberId || u.clinicorpUser,
            codeLink:        u.codeLink || undefined,
            helenaPanelId:   u.helenaPanelId   || null,
            agendadoStepId:  u.agendadoStepId  || null,
            helenaSteps:     u.helenaSteps?.length ? u.helenaSteps : null,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Erro HTTP ${res.status}`)
      onSuccess({
        clinicName,
        slug,
        helenaAccountId:     data.helenaAccountId,
        accountAutoDetected: data.accountAutoDetected,
        unitsCount:          data.units?.length ?? units.length,
      })
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="admin-wrap">
      <div className="admin-card">
        {/* Header */}
        <div className="admin-header">
          <div className="admin-logo">
            <div className="admin-logo-mark">S</div>
            <span>Schedule Button</span>
          </div>
          <span className="admin-badge">Admin</span>
        </div>

        {/* Progress */}
        <div className="admin-progress">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div key={i} className={`admin-progress-dot ${i + 1 <= step ? 'active' : ''}`} />
          ))}
          <span className="admin-progress-label">Passo {step} de {TOTAL_STEPS}</span>
        </div>

        {/* ── Passo 1: Dados da clínica ── */}
        {step === 1 && (
          <form onSubmit={handleNext} className="admin-form">
            <div className="admin-step-header">
              <h2>Dados da clínica</h2>
              <p>Informações básicas para identificar a clínica no sistema.</p>
            </div>

            <div className="admin-field">
              <label>Nome da clínica *</label>
              <input
                type="text"
                value={clinicName}
                onChange={e => handleNameChange(e.target.value)}
                placeholder="Ex: Clínica Sorriso Feliz"
                required
                autoFocus
              />
            </div>

            <div className="admin-field">
              <label>Slug (identificador na URL) *</label>
              <div className="admin-slug-wrap">
                <span className="admin-slug-prefix">?clinic=</span>
                <input
                  type="text"
                  value={slug}
                  onChange={e => handleSlugChange(e.target.value)}
                  placeholder="sorriso-feliz"
                  required
                  pattern="[a-z0-9-]+"
                />
              </div>
              {slug && (
                <span className="admin-field-hint">
                  URL: app.contactia.com.br?clinic={slug}
                </span>
              )}
            </div>

            <div className="admin-actions">
              <button type="button" className="admin-btn-secondary" onClick={onBack}>← Voltar</button>
              <button type="submit" className="admin-btn-primary" disabled={!clinicName || !slug}>
                Próximo →
              </button>
            </div>
          </form>
        )}

        {/* ── Passo 2: Helena / WTS.chat ── */}
        {step === 2 && (
          <form onSubmit={handleNext} className="admin-form">
            <div className="admin-step-header">
              <h2>Helena / WTS.chat</h2>
              <p>Token da API do CRM. Encontre em <strong>Configurações → API</strong> no painel Helena.</p>
            </div>

            <div className="admin-field">
              <label>Token da API *</label>
              <div className="admin-token-wrap">
                <input
                  type="password"
                  value={helenaToken}
                  onChange={e => { setHelenaToken(e.target.value); setHelenaPanels([]); setPickedPanels([]) }}
                  placeholder="pn_xxxxxxxxxxxxxxxxxxxx"
                  required
                  autoFocus
                />
                <span className="admin-token-prefix">Bearer</span>
              </div>
            </div>

            <div className="admin-field">
              <button
                type="button"
                className="admin-btn-secondary"
                style={{ width: '100%', opacity: !helenaToken.trim() ? 0.4 : 1 }}
                disabled={!helenaToken.trim() || stepsLoading}
                onClick={handleVerifyHelena}
              >
                {stepsLoading
                  ? <span className="admin-btn-loading"><span className="admin-spinner" style={{borderTopColor:'#475569'}} />Buscando etapas...</span>
                  : helenaPanels.length > 0
                    ? '✓ Painéis carregados — clique para recarregar'
                    : '🔍 Verificar token e carregar painéis'}
              </button>
              {!helenaToken.trim() && (
                <span className="admin-field-hint">Preencha o token acima para habilitar.</span>
              )}
              {stepsError && <span className="admin-field-hint" style={{color:'#dc2626'}}>⚠ {stepsError}</span>}
            </div>

            {/* Lista de painéis disponíveis para seleção */}
            {helenaPanels.length > 0 && (
              <div className="admin-field">
                <label>Selecione os painéis que aparecerão no botão *</label>
                <PanelPicker
                  panels={helenaPanels}
                  picked={pickedPanels}
                  onTogglePanel={(panel) => setPickedPanels(prev => togglePanelIn(prev, panel))}
                  onUpdatePanel={(id, field, value) => setPickedPanels(prev => updatePanelIn(prev, id, field, value))}
                  onToggleTag={(panelId, tagId) => setPickedPanels(prev => toggleTagIn(prev, panelId, tagId))}
                />
                {pickedPanels.length === 0 && (
                  <span className="admin-field-hint" style={{color:'#dc2626'}}>
                    Selecione pelo menos um painel.
                  </span>
                )}
              </div>
            )}

            {helenaPanels.length > 0 && (
              <ReminderConfig
                channels={channels}
                value={reminder}
                onChange={setReminder}
                loadTemplates={loadReminderTemplates}
              />
            )}

            <div className="admin-actions">
              <button type="button" className="admin-btn-secondary" onClick={handleBack}>← Voltar</button>
              <button
                type="submit"
                className="admin-btn-primary"
                disabled={
                  !helenaToken || pickedPanels.length === 0 || pickedPanels.some(p => !p.agendadoStepId)
                  || (reminder?.enabled && (!reminder.channelId || !reminder.templateId))
                }
              >
                Próximo →
              </button>
            </div>
          </form>
        )}

        {/* ── Passo 3: Unidades Clinicorp ── */}
        {step === 3 && (
          <form onSubmit={handleSubmit} className="admin-form">
            <div className="admin-step-header">
              <h2>Unidades Clinicorp</h2>
              <p>Adicione uma ou mais unidades. Cada unidade tem suas próprias credenciais.</p>
            </div>

            <div className="units-list">
              {units.map((unit, i) => (
                <div key={i} className="unit-card">
                  {/* Header da unidade */}
                  <div className="unit-card-header" onClick={() => toggleUnit(i)}>
                    <span className="unit-card-name">
                      {unit.name || `Unidade ${i + 1}`}
                    </span>
                    <div className="unit-card-actions">
                      {units.length > 1 && (
                        <button
                          type="button"
                          className="unit-remove-btn"
                          onClick={e => { e.stopPropagation(); removeUnit(i) }}
                        >✕</button>
                      )}
                      <span className="unit-toggle">{unit.expanded ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {unit.expanded && (
                    <div className="unit-card-body">
                      <div className="admin-field">
                        <label>Nome da unidade *</label>
                        <input type="text" value={unit.name}
                          onChange={e => updateUnit(i, 'name', e.target.value)}
                          placeholder="Ex: Unidade Centro" required />
                      </div>

                      <div className="admin-field">
                        <label>Usuário API Clinicorp *</label>
                        <input type="text" value={unit.clinicorpUser}
                          onChange={e => updateUnit(i, 'clinicorpUser', e.target.value)}
                          placeholder="Ex: clinicasorriso" required autoComplete="off" />
                      </div>

                      <div className="admin-field">
                        <label>Token API Clinicorp *</label>
                        <input type="password" value={unit.clinicorpToken}
                          onChange={e => updateUnit(i, 'clinicorpToken', e.target.value)}
                          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" required />
                      </div>

                      <div className="admin-field">
                        <label>Code Link <span style={{fontWeight:400,color:'#94a3b8'}}>(opcional)</span></label>
                        <input type="text" value={unit.codeLink}
                          onChange={e => updateUnit(i, 'codeLink', e.target.value.trim())}
                          placeholder="Ex: 75094" />
                        <span className="admin-field-hint">Se não informado, o sistema busca automaticamente.</span>
                      </div>

                      <div className="admin-field">
                        <label>Subscriber ID <span style={{fontWeight:400,color:'#94a3b8'}}>(opcional)</span></label>
                        <input type="text" value={unit.subscriberId}
                          onChange={e => updateUnit(i, 'subscriberId', e.target.value.trim())} />
                      </div>

                      {/* Painel Helena próprio (opcional) */}
                      {helenaPanels.length > 0 && (
                        <div className="admin-field">
                          <label>Painel Helena <span style={{fontWeight:400,color:'#94a3b8'}}>(opcional)</span></label>
                          <select
                            value={unit.helenaPanelId}
                            onChange={e => {
                              const pid = e.target.value
                              const panel = helenaPanels.find(p => p.id === pid)
                              updateUnit(i, 'helenaPanelId', pid)
                              updateUnit(i, 'agendadoStepId', panel?.steps?.[0]?.id ?? '')
                              updateUnit(i, 'helenaSteps', panel?.steps ?? [])
                            }}
                            className="step-select"
                          >
                            <option value="">Mesmo da clínica</option>
                            {helenaPanels.map(p => (
                              <option key={p.id} value={p.id}>{p.title}</option>
                            ))}
                          </select>
                          <span className="admin-field-hint">
                            Deixe em branco para usar o painel configurado na etapa anterior.
                          </span>
                        </div>
                      )}

                      {/* Etapa agendado própria (só se tiver painel próprio) */}
                      {unit.helenaPanelId && unit.helenaSteps?.length > 0 && (
                        <div className="admin-field">
                          <label>Etapa que aciona Clinicorp (desta unidade) *</label>
                          <select
                            value={unit.agendadoStepId}
                            onChange={e => updateUnit(i, 'agendadoStepId', e.target.value)}
                            className="step-select"
                            required
                          >
                            {unit.helenaSteps.map(s => (
                              <option key={s.id} value={s.id}>{s.title ?? s.name}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button type="button" className="admin-add-unit-btn" onClick={addUnit}>
              + Adicionar outra unidade
            </button>

            {submitError && <div className="admin-error-box">{submitError}</div>}

            <div className="admin-actions">
              <button type="button" className="admin-btn-secondary" onClick={handleBack}>← Voltar</button>
              <button
                type="submit"
                className="admin-btn-primary"
                disabled={units.some(u => !u.clinicorpUser || !u.clinicorpToken) || loading}
              >
                {loading
                  ? <span className="admin-btn-loading"><span className="admin-spinner" />Salvando...</span>
                  : 'Cadastrar clínica'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ── Success ───────────────────────────────────────────────────────
function Success({ data, onNew, onList }) {
  const baseUrl = window.location.origin
  const url = `${baseUrl}?idconta=${data.helenaAccountId || data.slug}&contactId=`
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="admin-wrap">
      <div className="admin-card success-card">
        <div className="success-icon">✓</div>
        <h2 className="success-title">Clínica cadastrada!</h2>
        <p className="success-sub">
          <strong>{data.clinicName}</strong> foi adicionada com sucesso.
          {data.unitsCount > 0 && ` ${data.unitsCount} unidade(s) configurada(s).`}
        </p>

        {data.helenaAccountId && (
          <div className="success-url-box" style={{ borderBottom: 'none' }}>
            <span className="success-url-label">ID da conta Helena</span>
            <div className="success-url">
              <code>{data.helenaAccountId}</code>
            </div>
            <span className="success-url-hint">
              {data.accountAutoDetected
                ? 'Detectado automaticamente — configure ?idconta= com este valor no botão do Helena.'
                : 'Configure ?idconta= com este valor no botão do Helena.'}
            </span>
          </div>
        )}

        {!data.helenaAccountId && (
          <div className="admin-error-box" style={{ margin: '0 28px' }}>
            Não foi possível detectar o ID da conta Helena automaticamente. Configure o campo <strong>helena_account_id</strong> manualmente no Supabase após o cadastro.
          </div>
        )}

        <div className="success-url-box">
          <span className="success-url-label">URL do botão</span>
          <div className="success-url">
            <code>{url}</code>
            <button className="success-copy-btn" onClick={handleCopy}>
              {copied ? '✓ Copiado' : 'Copiar'}
            </button>
          </div>
          <span className="success-url-hint">O Helena substituirá automaticamente o contactId na URL.</span>
        </div>

        <div className="success-actions">
          <button className="admin-btn-secondary" onClick={onList}>
            ← Lista de clínicas
          </button>
          <button className="admin-btn-secondary" onClick={onNew}>
            + Cadastrar outra clínica
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────────
export default function Setup() {
  const [view, setView] = useState('password') // password | list | create | edit | success
  const [adminKey,    setAdminKey]    = useState(null)
  const [clinics,     setClinics]     = useState([])
  const [editingId,   setEditingId]   = useState(null)
  const [flash,       setFlash]       = useState(null)
  const [successData, setSuccessData] = useState(null)

  const refreshClinics = (key = adminKey) =>
    fetch('/api/clinics', { headers: { 'x-admin-key': key } })
      .then(r => r.json())
      .then(d => setClinics(d.clinics ?? []))
      .catch(() => {})

  return (
    <div className="setup-root">
      {view === 'password' && (
        <div className="setup-password-bg">
          <PasswordModal
            onSuccess={(key, list) => { setAdminKey(key); setClinics(list); setView('list') }}
            onCancel={() => window.history.back()}
          />
        </div>
      )}

      {view === 'list' && (
        <ClinicList
          clinics={clinics}
          flash={flash}
          onEdit={(id) => { setFlash(null); setEditingId(id); setView('edit') }}
          onNew={() => { setFlash(null); setView('create') }}
        />
      )}

      {view === 'create' && (
        <AdminForm
          adminKey={adminKey}
          onBack={() => setView('list')}
          onSuccess={(data) => { setSuccessData(data); setView('success'); refreshClinics() }}
        />
      )}

      {view === 'edit' && (
        <EditClinic
          adminKey={adminKey}
          clinicId={editingId}
          onCancel={() => setView('list')}
          onSaved={(name) => { setFlash(`${name} atualizada com sucesso.`); refreshClinics(); setView('list') }}
          onDeleted={(name) => { setFlash(`${name} excluída.`); refreshClinics(); setView('list') }}
        />
      )}

      {view === 'success' && (
        <Success
          data={successData}
          onNew={() => setView('create')}
          onList={() => setView('list')}
        />
      )}
    </div>
  )
}
