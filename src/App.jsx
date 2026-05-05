import { useState, useEffect } from 'react'
import { createCard, getContact, findCardByContact, updateCardStep, addCardNote } from './api'
import { STEPS, TAGS } from './config'
import './App.css'

function App() {
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [origem, setOrigem] = useState('crcA')
  const [dor, setDor] = useState('')
  const [urgencia, setUrgencia] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)
  const [contactId, setContactId] = useState(null)
  const [isLoadingContact, setIsLoadingContact] = useState(false)
  const [existingCard, setExistingCard] = useState(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const cid = params.get('contactid') || params.get('contactId')
    
    if (cid) {
      setContactId(cid)
      setIsLoadingContact(true)
      
      getContact(cid)
        .then(contactData => {
          if (contactData && contactData.name) {
            setNome(contactData.name)
          }
          return findCardByContact(cid, contactData?.name)
        })
        .then(cardData => {
          if (cardData) {
            setExistingCard(cardData)
          }
        })
        .catch(err => console.warn('Erro ao carregar dados:', err))
        .finally(() => {
          setIsLoadingContact(false)
        })
    }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!nome.trim()) return

    setLoading(true)
    setMessage(null)

    try {
      const stepId = STEPS[origem]
      
      let finalDescription = descricao.trim()
      let extraInfo = []
      const selectedTags = [TAGS.Agendado] // Sempre inclui a tag Agendado
      
      if (dor) {
        extraInfo.push(`Dor: ${dor}`)
        if (TAGS[dor]) selectedTags.push(TAGS[dor])
      }
      if (urgencia) {
        extraInfo.push(`Urgência: ${urgencia}`)
        if (TAGS[urgencia]) selectedTags.push(TAGS[urgencia])
      }
      
      if (extraInfo.length > 0) {
        finalDescription = extraInfo.join('\n') + (finalDescription ? `\n\nObservações:\n${finalDescription}` : '')
      }
      
      let card = existingCard;
      if (!card && contactId) {
        card = await findCardByContact(contactId, nome.trim()).catch(() => null)
      }

      if (card) {
        const existingTags = card.tagIds || []
        const newTags = Array.from(new Set([...existingTags, ...selectedTags]))
        
        await updateCardStep(card.id, stepId, newTags)
        if (finalDescription) {
          await addCardNote(card.id, finalDescription)
        }
        setMessage({ type: 'success', text: 'Card atualizado e movido com sucesso!' })
      } else {
        await createCard(stepId, nome.trim(), finalDescription, contactId, selectedTags)
        setMessage({ type: 'success', text: 'Novo card criado com sucesso!' })
      }
      
      setNome('')
      setDescricao('')
      setDor('')
      setUrgencia('')
      setOrigem('crcA')
      
      setTimeout(() => {
        setMessage(null)
      }, 3000)
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <header className="header">
        <div className="brand">
          <div className="brand-mark">
            <span className="brand-initials">P</span>
          </div>
          <div className="brand-text">
            <h1 className="brand-name">Prime Agendamento</h1>
            <p className="brand-sub">Criação Rápida de Cards no CRM</p>
          </div>
        </div>
      </header>

      <main className="main">
        <div className="form-container">
          <div className="form-header">
            <div className="header-title-row">
              <h3>{existingCard ? 'Atualizar Agendamento' : 'Novo Agendamento'}</h3>
              {existingCard && <span className="badge badge-found">Card Localizado</span>}
              {!existingCard && contactId && !isLoadingContact && <span className="badge badge-not-found">Novo Card</span>}
            </div>
            <p>{existingCard ? 'Este paciente já possui um card. Ele será movido para a nova etapa.' : 'Preencha os dados abaixo para criar o card.'}</p>
          </div>
          
          <form onSubmit={handleSubmit} className="card-form">
            {message && (
              <div className={`alert alert-${message.type}`}>
                {message.text}
              </div>
            )}

            <div className="form-group">
              <label>Nome do Paciente *</label>
              <input 
                type="text" 
                value={nome} 
                onChange={(e) => setNome(e.target.value)} 
                placeholder={isLoadingContact ? "Buscando nome..." : "Ex: João da Silva"}
                disabled={isLoadingContact}
                required
              />
            </div>

            <div className="form-group">
              <label>Classificação</label>
              <div className="segmented-control">
                <label className={`segment ${dor === 'Mastigação' ? 'active' : ''}`}>
                  <input type="radio" name="dor" value="Mastigação" checked={dor === 'Mastigação'} onChange={(e) => setDor(e.target.value)} className="sr-only" />
                  <span className="segment-text">🦷 Mastigação</span>
                </label>
                <label className={`segment ${dor === 'Estética' ? 'active' : ''}`}>
                  <input type="radio" name="dor" value="Estética" checked={dor === 'Estética'} onChange={(e) => setDor(e.target.value)} className="sr-only" />
                  <span className="segment-text">✨ Estética</span>
                </label>
              </div>
            </div>

            <div className="form-group">
              <label>Urgência</label>
              <div className="segmented-control">
                <label className={`segment ${urgencia === 'Alta' ? 'active urgent' : ''}`}>
                  <input type="radio" name="urgencia" value="Alta" checked={urgencia === 'Alta'} onChange={(e) => setUrgencia(e.target.value)} className="sr-only" />
                  <span className="segment-text">🔴 Alta</span>
                </label>
                <label className={`segment ${urgencia === 'Baixa' ? 'active normal' : ''}`}>
                  <input type="radio" name="urgencia" value="Baixa" checked={urgencia === 'Baixa'} onChange={(e) => setUrgencia(e.target.value)} className="sr-only" />
                  <span className="segment-text">🟢 Baixa</span>
                </label>
              </div>
            </div>

            <div className="form-group">
              <label>Descrição (Opcional)</label>
              <textarea 
                value={descricao} 
                onChange={(e) => setDescricao(e.target.value)} 
                placeholder="Informações adicionais do paciente..."
                rows="3"
              />
            </div>

            <div className="form-group">
              <label>Origem do Agendamento</label>
              <select value={origem} onChange={(e) => setOrigem(e.target.value)}>
                <option value="crcA">CRC A</option>
                <option value="crcB">CRC B</option>
              </select>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? 'Salvando...' : 'Salvar Card'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}

export default App
