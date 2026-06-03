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
  const [clicks, setClicks] = useState(0)
  const timerRef = useRef(null)

  const handleLockClick = () => {
    clearTimeout(timerRef.current)
    const next = clicks + 1
    setClicks(next)
    if (next >= 1) { onUnlock(); setClicks(0); return }
    timerRef.current = setTimeout(() => setClicks(0), 2000)
  }

  return (
    <div className="landing">
      <nav className="landing-nav">
        <div className="landing-logo">
          <div className="landing-logo-mark">S</div>
          <span className="landing-logo-text">Schedule Button</span>
        </div>
        <span className="landing-nav-tag">by contactIA</span>
      </nav>

      <section className="landing-hero">
        <div className="landing-hero-badge">Integração dupla · Helena + Clinicorp</div>
        <h1 className="landing-hero-title">
          Agendamentos clínicos<br />
          <em>em um único clique</em>
        </h1>
        <p className="landing-hero-sub">
          Conecte seu CRM ao sistema de gestão da clínica. O operador seleciona
          a etapa, escolhe o horário — o sistema cuida do resto.
        </p>
        <div className="landing-hero-url">
          <span className="landing-hero-url-prefix">app.contactia.com.br</span>
          <span className="landing-hero-url-param">?clinic=<em>sua-clinica</em>&amp;contactId=...</span>
        </div>
      </section>

      <section className="landing-features">
        <div className="landing-feature-card">
          <div className="landing-feature-icon">⚡</div>
          <h3>Zero configuração manual</h3>
          <p>Cole o token, o sistema busca painéis, etapas, profissionais e categorias automaticamente.</p>
        </div>
        <div className="landing-feature-card">
          <div className="landing-feature-icon">🏥</div>
          <h3>Multi-clínica</h3>
          <p>Um único deploy atende todas as clínicas. Cada uma identificada pelo seu slug único na URL.</p>
        </div>
        <div className="landing-feature-card">
          <div className="landing-feature-icon">🔗</div>
          <h3>Integração dupla</h3>
          <p>Cria cards no CRM Helena e agenda diretamente na agenda do Clinicorp — simultaneamente.</p>
        </div>
      </section>

      <section className="landing-how">
        <h2 className="landing-section-title">Como funciona</h2>
        <div className="landing-steps">
          <div className="landing-step">
            <div className="landing-step-num">1</div>
            <div>
              <strong>Operador abre o botão</strong>
              <p>A partir de uma conversa no WhatsApp, com o contactId na URL.</p>
            </div>
          </div>
          <div className="landing-step-divider" />
          <div className="landing-step">
            <div className="landing-step-num">2</div>
            <div>
              <strong>Seleciona a etapa de destino</strong>
              <p>Dropdown com todas as etapas do funil CRM da clínica.</p>
            </div>
          </div>
          <div className="landing-step-divider" />
          <div className="landing-step">
            <div className="landing-step-num">3</div>
            <div>
              <strong>Escolhe o horário (se Agendado)</strong>
              <p>Calendário com slots disponíveis direto do Clinicorp.</p>
            </div>
          </div>
          <div className="landing-step-divider" />
          <div className="landing-step">
            <div className="landing-step-num">4</div>
            <div>
              <strong>Tudo salvo automaticamente</strong>
              <p>Card criado/movido no CRM + agendamento criado no Clinicorp.</p>
            </div>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <p>© 2026 contactIA · Schedule Button</p>
        <button
          className="landing-lock-trigger"
          onClick={handleLockClick}
          title="Admin"
          aria-label="Admin access"
        >
          ⚙
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
  const [clinicorpUser, setClinicorpUser] = useState('')
  const [clinicorpToken, setClinicorpToken] = useState('')
  const [subscriberId, setSubscriberId] = useState('')
  const [submitError, setSubmitError] = useState('')

  const handleNameChange = (val) => {
    setClinicName(val)
    if (!slugEdited) setSlug(toSlug(val))
  }

  const handleSlugChange = (val) => {
    setSlug(toSlug(val))
    setSlugEdited(true)
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
        body: JSON.stringify({ clinicName, slug, helenaToken, clinicorpUser, clinicorpToken, subscriberId }),
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
                  onChange={e => setHelenaToken(e.target.value)}
                  placeholder="pn_xxxxxxxxxxxxxxxxxxxx"
                  required
                  autoFocus
                />
                <span className="admin-token-prefix">Bearer</span>
              </div>
              <span className="admin-field-hint">
                Após salvar, o sistema buscará automaticamente painéis, etapas e etiquetas.
              </span>
            </div>

            <div className="admin-info-box">
              <strong>O que será buscado automaticamente:</strong>
              <ul>
                <li>Painéis disponíveis</li>
                <li>Etapas do funil</li>
                <li>Etiquetas de contato</li>
              </ul>
            </div>

            <div className="admin-actions">
              <button type="button" className="admin-btn-secondary" onClick={handleBack}>← Voltar</button>
              <button type="submit" className="admin-btn-primary" disabled={!helenaToken}>
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
              <label>CNPJ da clínica (subscriber_id) *</label>
              <input
                type="text"
                value={subscriberId}
                onChange={e => setSubscriberId(e.target.value.replace(/\D/g, ''))}
                placeholder="Ex: 43945422000142"
                required
                maxLength={14}
              />
              <span className="admin-field-hint">Apenas números, sem pontuação.</span>
            </div>

            <div className="admin-info-box">
              <strong>O que será buscado automaticamente:</strong>
              <ul>
                <li>CNPJ (subscriber_id)</li>
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
  const [state, setState] = useState('landing') // landing | password | form | success
  const [successData, setSuccessData] = useState(null)

  return (
    <div className="setup-root">
      {state === 'landing' && (
        <Landing onUnlock={() => setState('password')} />
      )}

      {state === 'password' && (
        <>
          <Landing onUnlock={() => {}} />
          <PasswordModal
            onSuccess={() => setState('form')}
            onCancel={() => setState('landing')}
          />
        </>
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
