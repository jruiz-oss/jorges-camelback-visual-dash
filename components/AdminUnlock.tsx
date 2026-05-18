'use client'

import { useState } from 'react'
import { useSegmentOverride } from './SegmentOverrideContext'

// Floating lock button in the bottom-right corner. Click to enter/exit admin
// edit mode. When locked, shows a PIN dialog before granting access.

export default function AdminUnlock() {
  const { editMode, unlock, lock } = useSegmentOverride()
  const [open, setOpen]   = useState(false)
  const [pin, setPin]     = useState('')
  const [error, setError] = useState(false)

  async function handleUnlock() {
    // unlock() now POSTs to /api/admin-unlock so the PIN is no longer
    // bundled into client JS. Await the result and show the error inline.
    const ok = await unlock(pin)
    if (ok) {
      setOpen(false)
      setPin('')
      setError(false)
    } else {
      setError(true)
    }
  }

  if (editMode) {
    return (
      <button
        className="admin-lock unlocked"
        onClick={lock}
        title="Lock segment editing"
        aria-label="Lock segment editing"
      >
        🔓
      </button>
    )
  }

  return (
    <>
      <button
        className="admin-lock"
        onClick={() => setOpen(true)}
        title="Admin: edit segment names"
        aria-label="Admin: edit segment names"
      >
        🔒
      </button>

      {open && (
        <div
          className="admin-modal-overlay"
          onClick={() => { setOpen(false); setPin(''); setError(false) }}
        >
          <div className="admin-modal" onClick={e => e.stopPropagation()}>
            <h3>Admin Access</h3>
            <input
              type="password"
              value={pin}
              onChange={e => { setPin(e.target.value); setError(false) }}
              onKeyDown={e => {
                if (e.key === 'Enter')  handleUnlock()
                if (e.key === 'Escape') { setOpen(false); setPin(''); setError(false) }
              }}
              placeholder="Enter PIN"
              autoFocus
            />
            {error && <p className="admin-error">Incorrect PIN</p>}
            <div className="admin-modal-btns">
              <button onClick={handleUnlock}>Unlock</button>
              <button onClick={() => { setOpen(false); setPin(''); setError(false) }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
