'use client'

import { useState } from 'react'
import { useSegmentOverride } from './SegmentOverrideContext'

// Renders a segment name. In normal mode it's a plain div. In admin edit mode
// it shows a pencil hint and becomes click-to-edit with an inline input.

interface Props {
  id:   string
  name: string  // server-side fallback — used when no override exists
}

export default function SegmentNameDisplay({ id, name }: Props) {
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
    )
  }

  if (editMode) {
    return (
      <div
        className="segment-name segment-name-editable"
        onClick={startEdit}
        title="Click to rename"
      >
        {displayName}
        <span className="segment-name-edit-hint">✏</span>
      </div>
    )
  }

  return <div className="segment-name">{displayName}</div>
}
