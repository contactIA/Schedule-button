export default function SlotPicker({ loading, error, slots, selectedSlot, onSelectSlot, professionals = [], emptyMessage }) {
  if (loading) {
    return (
      <div className="slots-loading-row">
        <span className="spinner spinner-dark" />
        Buscando horários...
      </div>
    )
  }

  if (error) {
    return <p className="slots-msg slots-msg-error">⚠ {error}</p>
  }

  if (slots.length === 0) {
    return <p className="slots-msg">{emptyMessage || 'Nenhum horário disponível para esta data.'}</p>
  }

  return (
    <div className="slots-list">
      {slots.map((slot, i) => {
        const prof    = professionals.find(p => p.id === slot.professionalId || p.clinicorp_id === slot.professionalId)
        const isActive = selectedSlot?.from === slot.from && selectedSlot?.professionalId === slot.professionalId
        return (
          <button
            key={`${slot.from}-${slot.professionalId}-${i}`}
            type="button"
            className={`slot-row${isActive ? ' slot-row-active' : ''}`}
            onClick={() => onSelectSlot(isActive ? null : slot)}
          >
            <span className="slot-row-time">{slot.from} às {slot.to}</span>
            {prof && <span className="slot-row-prof">{prof.name.split(' ')[0]}</span>}
          </button>
        )
      })}
    </div>
  )
}
