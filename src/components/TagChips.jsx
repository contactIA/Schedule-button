import { TAG_LIST } from '../config'

export default function TagChips({ tagIds, onToggle }) {
  return (
    <div className="tag-chips">
      {TAG_LIST.map(tag => (
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
