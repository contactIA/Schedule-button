export default function TagChips({ tagIds, onToggle, tagList = [] }) {
  if (tagList.length === 0) return null

  return (
    <div className="tag-chips">
      {tagList.map(tag => (
        <button
          key={tag.id}
          type="button"
          className={[
            'tag-chip',
            tagIds.has(tag.id) ? 'tag-chip-active' : '',
            tag.locked ? 'tag-chip-locked' : '',
          ].filter(Boolean).join(' ')}
          onClick={() => onToggle(tag.id)}
          title={tag.locked ? 'Etiqueta sempre aplicada' : undefined}
        >
          {tagIds.has(tag.id) && <span className="tag-chip-check">✓</span>}
          {tag.label}
        </button>
      ))}
    </div>
  )
}
