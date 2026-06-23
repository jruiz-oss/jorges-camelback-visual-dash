'use client'

import { useRef, useState } from 'react'
import { useSegmentOverride } from './SegmentOverrideContext'

// Renders a segment name. In normal mode it's a plain div. In admin edit mode
// it shows a pencil hint and becomes click-to-edit with an inline input, plus a
// color swatch that opens a native color picker to recolor the segment accent.

interface Props {
  id:   string
  name: string  // server-side fallback — used when no override exists
  /** Default accent for this segment (server value) — shown when no override. */
  accent: string
}

// Admin-only control: a swatch button wrapping a hidden <input type="color">.
// Clicking the swatch opens the OS color picker; picking writes the override.
// A small ✕ clears the override back to the segment default.
function ColorControl({ id, accent }: { id: string; accent: string }) {
  const { getColor, setColor, resetColor, colorOverrides } = useSegmentOverride()
  const current    = getColor(id, accent)
  const hasOverride = id in colorOverrides
  const inputRef   = useRef<HTMLInputElement>(null)

  return (
    <span className="segment-color-control" onClick={e => e.stopPropagation()}>
      <button
        type="button"
        className="segment-color-swatch"
        style={{ background: current }}
        onClick={() => inputRef.current?.click()}
        title="Change segment color"
        aria-label="Change segment color"
      />
      <input
        ref={inputRef}
        type="color"
        value={current}
        onChange={e => setColor(id, e.target.value)}
        className="segment-color-input"
        aria-hidden
        tabIndex={-1}
      />
      {hasOverride && (
        <button
          type="button"
          className="segment-color-reset"
          onClick={() => resetColor(id)}
          title="Reset to default color"
          aria-label="Reset to default color"
        >
          ✕
        </button>
      )}
    </span>
  )
}

export default function SegmentNameDisplay({ id, name, accent }: Props) {
  const { editMode, getName, setName } = useSegmentOverride()
  const displayName = getName(id, name)

  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState('')

  function startEdit() {
    setDraft(displayName)
    setEditing(true)
  }

  function save() {
    if (draft.trim()) setName(id, draft)
    setEditing(false)
  }

  if (editMode && editing) {
    return (
      <span className="segment-name-row">
        <input
          className="segment-name segment-name-input"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter')  save()
            if (e.key === 'Escape') setEditing(false)
          }}
          onBlur={save}
          autoFocus
        />
        <ColorControl id={id} accent={accent} />
      </span>
    )
  }

  if (editMode) {
    return (
      <span className="segment-name-row">
        <span
          className="segment-name segment-name-editable"
          onClick={startEdit}
          title="Click to rename"
        >
          {displayName}
          <span className="segment-name-edit-hint">✏</span>
        </span>
        <ColorControl id={id} accent={accent} />
      </span>
    )
  }

  return <div className="segment-name">{displayName}</div>
}
