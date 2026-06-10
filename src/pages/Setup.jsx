import { useState, useEffect, useRef } from 'react'
import './Setup.css'

const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || 'schedule2026'

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

// ── Password Modal ────────────────────────────────────────────────
function PasswordModal({ onSuccess, onCancel }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)
  const [shake, setShake] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (value === ADMIN_PASSWORD) {
      onSuccess()
    } else {
      setError(true)
      setShake(true)
      setValue('')
      setTimeout(() => setShake(false), 500)
      inputRef.current?.focus()
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
            onChange={e => { setValue(e.target.value); setError(false) }}
            placeholder="Senha"
            className={`modal-input ${error ? 'modal-input-error' : ''}`}
            autoComplete="current-password"
          />
          {error && <span className="modal-error">Senha incorreta.</span>}
          <button type="submit" className="modal-btn" disabled={!value}>
            Entrar
          </button>
        </form>
        <button className="modal-cancel" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  )
}

// ── Admin Form ────────────────────────────────────────────────────
const TOTAL_STEPS = 3

function AdminForm({ onSuccess }) {
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

  const togglePickPanel = (panel) => {
    setPickedPanels(prev => {
      const exists = prev.find(p => p.id === panel.id)
      if (exists) return prev.filter(p => p.id !== panel.id)
      return [...prev, {
        id:            panel.id,
        name:          panel.title || panel.name || '',
        displayName:   panel.title || panel.name || '',
        agendadoStepId: panel.steps?.[0]?.id ?? '',
        steps:         panel.steps ?? [],
      }]
    })
  }

  const updatePickedPanel = (id, field, value) =>
    setPickedPanels(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p))

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
      const res = await fetch(`/api/helena-preview?token=${encodeURIComponent(helenaToken.trim())}&_t=${Date.now()}`)
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicName,
          slug,
          helenaToken,
          // Painel principal = primeiro painel escolhido (fallback de compatibilidade)
          helenaPanelId:   pickedPanels[0]?.id ?? '',
          agendadoStepId:  pickedPanels[0]?.agendadoStepId ?? '',
          helenaSteps:     (pickedPanels[0]?.steps ?? []).map(s => ({ id: s.id, name: s.title || s.name || s.id })),
          // Todos os painéis escolhidos com seus nomes e steps
          helenaPanels: pickedPanels.map(p => ({
            id:            p.id,
            name:          p.displayName || p.name,
            agendadoStepId: p.agendadoStepId,
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
                <div className="panels-list">
                  {helenaPanels.map(panel => {
                    const picked = pickedPanels.find(p => p.id === panel.id)
                    return (
                      <div key={panel.id} className={`panel-item${picked ? ' panel-item-active' : ''}`}>
                        <button
                          type="button"
                          className="panel-item-toggle"
                          onClick={() => togglePickPanel(panel)}
                        >
                          <span className={`panel-item-check${picked ? ' checked' : ''}`}>
                            {picked ? '✓' : '+'}
                          </span>
                          <span className="panel-item-title">{panel.title || panel.id}</span>
                        </button>

                        {picked && (
                          <div className="panel-item-config">
                            <div className="admin-field">
                              <label>Nome que o operador verá</label>
                              <input
                                type="text"
                                value={picked.displayName}
                                onChange={e => updatePickedPanel(panel.id, 'displayName', e.target.value)}
                                placeholder={panel.title || 'Ex: CRC A, Urgência...'}
                              />
                            </div>
                            {picked.steps.length > 0 && (
                              <div className="admin-field">
                                <label>Etapa que aciona o Clinicorp</label>
                                <select
                                  value={picked.agendadoStepId}
                                  onChange={e => updatePickedPanel(panel.id, 'agendadoStepId', e.target.value)}
                                  className="step-select"
                                >
                                  {picked.steps.map(s => (
                                    <option key={s.id} value={s.id}>{s.title || s.name || s.id}</option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
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
function Success({ data, onNew }) {
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

        <button className="admin-btn-secondary success-new-btn" onClick={onNew}>
          + Cadastrar outra clínica
        </button>
      </div>
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────────
export default function Setup() {
  const [state, setState] = useState('password') // password | form | success
  const [successData, setSuccessData] = useState(null)

  return (
    <div className="setup-root">
      {state === 'password' && (
        <div className="setup-password-bg">
          <PasswordModal
            onSuccess={() => setState('form')}
            onCancel={() => window.history.back()}
          />
        </div>
      )}

      {state === 'form' && (
        <AdminForm
          onSuccess={(data) => { setSuccessData(data); setState('success') }}
        />
      )}

      {state === 'success' && (
        <Success
          data={successData}
          onNew={() => setState('form')}
        />
      )}
    </div>
  )
}
