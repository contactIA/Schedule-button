// Padrão de nome para identificar a etapa que aciona o Clinicorp.
// Quando migrar para Supabase, cada clínica terá agendado_step_id explícito —
// este fallback só é usado se agendadoStepId não vier na config.
export const AGENDADO_STEP_NAME = 'agendado'
