import { useId, useLayoutEffect, useRef } from 'react'
import { LockKeyhole } from 'lucide-react'
import { Button } from './ui/Button'

type Props = {
  playerName: string | undefined
  onContinue: () => void
  onExit: () => void
}

export function PrivacyHandoff({ playerName, onContinue, onExit }: Props) {
  const titleId = useId()
  const descriptionId = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)

  useLayoutEffect(() => {
    const current = dialog.current
    if (!current) return
    current.showModal()
    heading.current?.focus()
    return () => current.close()
  }, [])

  const resuming = playerName === undefined

  return (
    <dialog className="privacy-screen" ref={dialog} aria-labelledby={titleId} aria-describedby={descriptionId}
      onCancel={(event) => event.preventDefault()}>
      <div className="privacy-screen__content">
        <div className="privacy-screen__mark"><LockKeyhole size={38} aria-hidden="true" /></div>
        <p className="mode-label"><span aria-hidden="true" /> {resuming ? 'Private round' : 'Bid locked'}</p>
        <h1 id={titleId} ref={heading} tabIndex={-1} className="stage-heading">
          {resuming ? 'Resume match privately' : `Pass the device to ${playerName}`}
        </h1>
        <p id={descriptionId}>{resuming
          ? 'Make sure only the player taking the next turn can see the screen.'
          : 'Player 2 can continue when they have the device. The first bid stays hidden.'}</p>
        <Button onClick={onContinue}>{resuming ? 'Resume privately' : 'I’m ready'}</Button>
        <Button variant="quiet" onClick={onExit}>Exit match</Button>
      </div>
    </dialog>
  )
}
