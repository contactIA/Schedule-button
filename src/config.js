export const TOKEN = 'Bearer pn_22zvaOtn9H6mmwNKktsuKd91F8UDdLnuu085N5bw'
export const PANEL_ID = 'fd4df083-7422-4171-9ee2-1c098e799798'

// Etapa cujo nome contenha este padrão aciona o calendário do Clinicorp.
// Quando migrar para Supabase, cada clínica terá um agendado_step_id explícito.
export const AGENDADO_STEP_NAME = 'agendado'

export const TAGS = {
  Mastigação: '5c735bac-3286-45cb-95aa-bcd6e97a2ffc',
  Estética: '8f57a996-bc26-47ac-b8b8-ee72da1044fe',
  Alta: '19b22c78-dcd0-44b0-9b27-16aa67c9d58d',
  Baixa: '1e3fabcf-905f-4902-9758-4758c4324547',
  Agendado: '47870808-399c-45c3-b056-a2c66c8ae337'
}

export const TAG_LIST = [
  { id: TAGS.Agendado,   label: 'Agendado',      locked: true  },
  { id: TAGS.Mastigação, label: 'Mastigação',     locked: false },
  { id: TAGS.Estética,   label: 'Estética',       locked: false },
  { id: TAGS.Alta,       label: 'Alta Urgência',  locked: false },
  { id: TAGS.Baixa,      label: 'Baixa Urgência', locked: false },
]

export const CLINICORP_PROFESSIONALS = [
  { id: '4693001712435200', name: 'Rafael da Cunha Santos' },
  { id: '5010362672742400', name: 'Anayle Paixão Silva' },
  { id: '6525572572774400', name: 'Alex Fernando Santos da Silva' },
  { id: '6548129122615296', name: 'Emerson Gomes' },
]
