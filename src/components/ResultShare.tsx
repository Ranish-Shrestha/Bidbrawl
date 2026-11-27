import { useEffect, useRef, useState } from 'react'
import { Clipboard, Download, Share2 } from 'lucide-react'
import { formatShowdownText } from '../game/showdown'
import type { Showdown } from '../game/showdown'
import { downloadBlob } from '../download'
import { Button } from './ui/Button'
import { Dialog } from './ui/Dialog'

export function ResultShare({ showdown }: { showdown: Showdown }) {
  const [open, setOpen] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [manualCopy, setManualCopy] = useState(false)
  const textArea = useRef<HTMLTextAreaElement>(null)
  const text = formatShowdownText(showdown)

  useEffect(() => {
    if (!manualCopy) return
    textArea.current?.focus()
    textArea.current?.select()
  }, [manualCopy])

  async function download() {
    setDownloading(true)
    setFeedback('')
    try {
      const { createResultImage } = await import('../game/resultImage')
      const image = await createResultImage(showdown)
      downloadBlob(image, 'bid-brawl-showdown.png')
      setFeedback('Your PNG is ready to save.')
    } catch {
      setFeedback('The image could not be generated. You can still copy the result text.')
    } finally {
      setDownloading(false)
    }
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text)
      setManualCopy(false)
      setFeedback('Result text copied.')
    } catch {
      setManualCopy(true)
      setFeedback('Select and copy the result text below.')
    }
  }

  async function shareText() {
    try {
      await navigator.share({ title: 'Bid Brawl · Final Showdown', text })
      setFeedback('Share options opened.')
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      setFeedback('Sharing is unavailable here. Try copying the text.')
    }
  }

  return (
    <>
      <Button variant="secondary" aria-haspopup="dialog" onClick={() => {
        setManualCopy(false)
        setFeedback('')
        setOpen(true)
      }}><Share2 size={18} aria-hidden="true" /> Share Results</Button>
      <Dialog open={open} title="Share results" onDismiss={() => setOpen(false)}>
        <div className="share-panel">
          <p>Share both lineups, including player names, picks, and spending.</p>
          <div className="share-panel__actions">
            <Button disabled={downloading} onClick={download}><Download size={18} aria-hidden="true" /> {downloading ? 'Creating image…' : 'Download PNG'}</Button>
            <Button variant="secondary" onClick={copyText}><Clipboard size={18} aria-hidden="true" /> Copy Text</Button>
            {typeof navigator.share === 'function' && <Button variant="secondary" onClick={shareText}><Share2 size={18} aria-hidden="true" /> Share Text</Button>}
          </div>
          <p className="share-panel__feedback" role="status">{feedback}</p>
          {manualCopy && (
            <label className="share-panel__manual">
              Result text
              <textarea ref={textArea} value={text} readOnly rows={7} />
            </label>
          )}
        </div>
      </Dialog>
    </>
  )
}
