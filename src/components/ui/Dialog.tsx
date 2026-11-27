import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { Button } from './Button'

type DialogProps = {
  open: boolean
  title: string
  onDismiss: () => void
  children: ReactNode
}

export function Dialog({ open, title, onDismiss, children }: DialogProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open) {
      if (!dialog.open) dialog.showModal()
      dialog.scrollTop = 0
      titleRef.current?.focus()
    } else if (dialog.open) {
      dialog.close()
    }
  }, [open, title])

  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onDismiss()
      }}
    >
      <div className="dialog-heading">
        <h2 id={titleId} ref={titleRef} tabIndex={-1}>{title}</h2>
        <Button variant="icon" onClick={onDismiss} aria-label="Close dialog">
          <X size={20} aria-hidden="true" />
        </Button>
      </div>
      {children}
    </dialog>
  )
}
