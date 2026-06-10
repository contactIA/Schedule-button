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

// ── Edição de clínica ─────────────────────────────────────────────
function EditClinic({ adminKey, clinicId, onSaved, onCancel }) {
  const [loading,   setLoading]   = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving,    setSaving]    = useState(false)
  const [saveError, setSaveError] = useState('')

  const [clinic,       setClinic]       = useState(null)
  const [name,         setName]         = useState('')
  const [slug,         setSlug]         = useState('')
  const [newToken,     setNewToken]     = useState('')
  const [helenaPanels, setHelenaPanels] = useState([])
  const [pickedPanels, setPickedPanels] = useState([])

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
          helenaToken: newToken.trim() || undefined,
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

          {clinic.units?.length > 0 && (
            <div className="admin-field">
              <label>Unidades</label>
              <div className="edit-units-row">
                {clinic.units.map(u => (
                  <span key={u.id} className={`edit-unit-chip${u.active ? '' : ' edit-unit-chip-off'}`}>
                    {u.name}
                  </span>
                ))}
              </div>
              <span className="admin-field-hint">Edição de unidades chega em uma próxima versão.</span>
            </div>
          )}

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

            <div className="admin-actions">
              <button type="button" className="admin-btn-secondary" onClick={handleBack}>← Voltar</button>
              <button
                type="submit"
                className="admin-btn-primary"
                disabled={!helenaToken || pickedPanels.length === 0 || pickedPanels.some(p => !p.agendadoStepId)}
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
                          onChange={e => updateUnit(i, 'codeLink', e.target.value.replace(/\D/g,''))}
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
