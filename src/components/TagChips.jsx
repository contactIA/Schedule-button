export default function TagChips({ tags, selectedIds, onToggle }) {
  if (tags.length === 0) return null

  return (
    <div className="tag-chips">
      {tags.map(tag => {
        const active = selectedIds.has(tag.id)
        return (
          <button
            key={tag.id}
            type="button"
            className={`tag-chip${active ? ' tag-chip-active' : ''}`}
            style={active ? { background: tag.bgColor, color: tag.nameColor } : undefined}
            onClick={() => onToggle(tag.id)}
          >
            {active && <span className="tag-chip-check">✓</span>}
            {tag.label}
          </button>
        )
      })}
    </div>
  )
}
