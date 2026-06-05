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

// ── Landing ──────────────────────────────────────────────────────
function Landing({ onUnlock }) {
  return (
    <div className="landing">

      {/* Nav */}
      <nav className="landing-nav">
        <div className="landing-logo">
          <div className="landing-logo-mark">
            <span>S</span>
          </div>
          <div className="landing-logo-text">
            <span className="landing-logo-name">Schedule Button</span>
            <span className="landing-logo-by">by contactIA</span>
          </div>
        </div>
        <button className="landing-admin-btn" onClick={onUnlock}>
          Acessar painel admin
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2.5 7h9M7.5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </nav>

      {/* Hero */}
      <section className="landing-hero">
        <div className="landing-hero-badge">
          <span className="landing-badge-dot" />
          Helena CRM · Clinicorp · Agendamento em 1 clique
        </div>
        <h1 className="landing-hero-title">
          Agendamentos clínicos<br />
          <span className="landing-hero-gradient">simplificados.</span>
        </h1>
        <p className="landing-hero-sub">
          O operador abre o botão a partir de uma conversa no WhatsApp,
          seleciona a etapa, escolhe o horário — e o sistema cuida de tudo.
          Card criado no CRM e consulta agendada no Clinicorp, simultaneamente.
        </p>
        <div className="landing-hero-actions">
          <button className="landing-cta-primary" onClick={onUnlock}>
            Cadastrar minha clínica
          </button>
          <div className="landing-hero-url">
            <span className="landing-hero-url-dot" />
            <code>?idconta=<em>minha-clinica</em>&amp;contactId=...</code>
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="landing-divider" />

      {/* Features */}
      <section className="landing-features">
        <div className="landing-feature-card">
          <div className="landing-feature-num">01</div>
          <h3>Zero configuração manual</h3>
          <p>Cole o token e o sistema busca painéis, etapas, profissionais e categorias automaticamente.</p>
          <div className="landing-feature-bar" />
        </div>
        <div className="landing-feature-card">
          <div className="landing-feature-num">02</div>
          <h3>Multi-clínica, um deploy</h3>
          <p>Uma instância atende todas as clínicas. Cada uma tem seu próprio idconta na URL.</p>
          <div className="landing-feature-bar" />
        </div>
        <div className="landing-feature-card">
          <div className="landing-feature-num">03</div>
          <h3>Integração dupla nativa</h3>
          <p>Helena CRM e Clinicorp em sincronia — card e agendamento criados num único submit.</p>
          <div className="landing-feature-bar" />
        </div>
      </section>

      {/* How it works */}
      <section className="landing-how">
        <div className="landing-how-label">Como funciona</div>
        <div className="landing-steps">
          {[
            { n: '01', title: 'Operador abre o botão', desc: 'A partir de uma conversa no WhatsApp, o link chega com contactId e idconta da clínica.' },
            { n: '02', title: 'Seleciona a etapa', desc: 'Dropdown dinâmico com todas as etapas do funil CRM carregadas do banco.' },
            { n: '03', title: 'Escolhe o horário', desc: 'Se a etapa for "Agendado", o calendário do Clinicorp abre com horários disponíveis.' },
            { n: '04', title: 'Tudo salvo', desc: 'Card criado ou movido no Helena + agendamento confirmado no Clinicorp.' },
          ].map(s => (
            <div key={s.n} className="landing-step">
              <span className="landing-step-num">{s.n}</span>
              <div className="landing-step-content">
                <strong>{s.title}</strong>
                <p>{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <span>© 2026 contactIA</span>
        <button className="landing-footer-admin" onClick={onUnlock}>
          Painel Admin →
        </button>
      </footer>

    </div>
  )
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
  const [helenaToken, setHelenaToken] = useState('')
  const [helenaPanels, setHelenaPanels]   = useState([])   // painéis carregados
  const [selectedPanelId, setSelectedPanelId] = useState('')
  const [agendadoStepId, setAgendadoStepId]   = useState('')
  const [stepsLoading, setStepsLoading]   = useState(false)
  const [stepsError,   setStepsError]     = useState('')

  // Etapas do painel selecionado
  const panelSteps = helenaPanels.find(p => p.id === selectedPanelId)?.steps ?? []
  const [clinicorpUser, setClinicorpUser] = useState('')
  const [clinicorpToken, setClinicorpToken] = useState('')
  const [subscriberId, setSubscriberId] = useState('')
  const [codeLink, setCodeLink] = useState('')
  const [submitError, setSubmitError] = useState('')

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
    setSelectedPanelId('')
    setAgendadoStepId('')
    try {
      const res = await fetch(`/api/helena-preview?token=${encodeURIComponent(helenaToken.trim())}&_t=${Date.now()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao verificar token')
      const panels = data.panels ?? []
      setHelenaPanels(panels)
      if (panels.length > 0) {
        setSelectedPanelId(panels[0].id)
        if (panels[0].steps?.length > 0) setAgendadoStepId(panels[0].steps[0].id)
      }
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
        body: JSON.stringify({ clinicName, slug, helenaToken, helenaPanelId: selectedPanelId, agendadoStepId, clinicorpUser, clinicorpToken, subscriberId: subscriberId || clinicorpUser, codeLink: codeLink || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Erro HTTP ${res.status}`)
      onSuccess({
        clinicName,
        slug,
        professionalsCount:   data.professionalsCount,
        helenaAccountId:      data.helenaAccountId,
        accountAutoDetected:  data.accountAutoDetected,
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
                  onChange={e => { setHelenaToken(e.target.value); setHelenaSteps([]); setAgendadoStepId('') }}
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

            {helenaPanels.length > 0 && (
              <>
                <div className="admin-field">
                  <label>Painel CRC (destino dos cards) *</label>
                  <select
                    value={selectedPanelId}
                    onChange={e => {
                      setSelectedPanelId(e.target.value)
                      const panel = helenaPanels.find(p => p.id === e.target.value)
                      setAgendadoStepId(panel?.steps?.[0]?.id ?? '')
                    }}
                    className="step-select"
                    required
                  >
                    {helenaPanels.map(p => (
                      <option key={p.id} value={p.id}>{p.title}</option>
                    ))}
                  </select>
                  <span className="admin-field-hint">Cards serão criados neste painel.</span>
                </div>

                {panelSteps.length > 0 && (
                  <div className="admin-field">
                    <label>Etapa que aciona o calendário do Clinicorp *</label>
                    <select
                      value={agendadoStepId}
                      onChange={e => setAgendadoStepId(e.target.value)}
                      className="step-select"
                      required
                    >
                      {panelSteps.map(s => (
                        <option key={s.id} value={s.id}>{s.title}</option>
                      ))}
                    </select>
                    <span className="admin-field-hint">
                      Quando o operador selecionar esta etapa, o calendário do Clinicorp abrirá.
                    </span>
                  </div>
                )}
              </>
            )}

            <div className="admin-actions">
              <button type="button" className="admin-btn-secondary" onClick={handleBack}>← Voltar</button>
              <button type="submit" className="admin-btn-primary" disabled={!helenaToken || !agendadoStepId}>
                Próximo →
              </button>
            </div>
          </form>
        )}

        {/* ── Passo 3: Clinicorp ── */}
        {step === 3 && (
          <form onSubmit={handleSubmit} className="admin-form">
            <div className="admin-step-header">
              <h2>Clinicorp</h2>
              <p>Credenciais da API. Encontre em <strong>Sistema → Gerenciar Assinatura → Acesso Externo</strong>.</p>
            </div>

            <div className="admin-field">
              <label>Usuário da API *</label>
              <input
                type="text"
                value={clinicorpUser}
                onChange={e => setClinicorpUser(e.target.value)}
                placeholder="Ex: clinicasorriso"
                required
                autoFocus
                autoComplete="off"
              />
            </div>

            <div className="admin-field">
              <label>Token da API *</label>
              <input
                type="password"
                value={clinicorpToken}
                onChange={e => setClinicorpToken(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                required
              />
            </div>

            <div className="admin-field">
              <label>Code Link <span style={{fontWeight:400, color:'#94a3b8'}}>(opcional)</span></label>
              <input
                type="text"
                value={codeLink}
                onChange={e => setCodeLink(e.target.value.replace(/\D/g, ''))}
                placeholder="Ex: 75094"
              />
              <span className="admin-field-hint">
                Encontre em Sistema → Gerenciar Assinatura → Acesso Externo e Integrações. Se não informado, o sistema tenta buscar automaticamente.
              </span>
            </div>

            <div className="admin-field">
              <label>Subscriber ID <span style={{fontWeight:400, color:'#94a3b8'}}>(opcional)</span></label>
              <input
                type="text"
                value={subscriberId}
                onChange={e => setSubscriberId(e.target.value.trim())}
                placeholder={clinicorpUser || 'Deixe em branco para usar o usuário da API'}
              />
              <span className="admin-field-hint">
                Geralmente igual ao usuário da API. Preencha apenas se diferente (ex: CNPJ sem pontuação).
              </span>
            </div>

            <div className="admin-info-box">
              <strong>O que será buscado automaticamente:</strong>
              <ul>
                <li>Unidades da clínica</li>
                <li>Profissionais e avaliadores</li>
                <li>Categorias de agendamento</li>
              </ul>
            </div>

            {submitError && (
              <div className="admin-error-box">{submitError}</div>
            )}

            <div className="admin-actions">
              <button type="button" className="admin-btn-secondary" onClick={handleBack}>← Voltar</button>
              <button type="submit" className="admin-btn-primary" disabled={!clinicorpUser || !clinicorpToken || !subscriberId || loading}>
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
          {data.professionalsCount > 0 && ` ${data.professionalsCount} profissional(is) importado(s).`}
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
