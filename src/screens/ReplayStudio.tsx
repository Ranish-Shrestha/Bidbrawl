import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Film, Pause, Play } from 'lucide-react'
import { AppShell } from '../components/AppShell'
import { ScreenHeading } from '../components/ScreenHeading'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Dialog } from '../components/ui/Dialog'
import { categories } from '../data/categories'
import { downloadBlob } from '../download'
import { getLiveReplay } from '../game/liveReplay'
import { loadLiveAuction } from '../game/liveStorage'
import { buildReplayTimeline, MAX_REPLAY_BYTES } from '../game/replayTimeline'
import type { ReplayScene } from '../game/replayTimeline'
import { recordReplayVideo, supportsReplayVideo } from '../game/replayVideo'
import './replayStudio.css'

function currentReplay() {
  const { state } = loadLiveAuction()
  const category = categories.find(({ id }) => id === state?.categoryId)
  return state && category ? buildReplayTimeline(getLiveReplay(state, category)) : null
}

export default function ReplayStudio() {
  const [timeline, setTimeline] = useState(currentReplay)
  const [videoSupported] = useState(supportsReplayVideo)
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [range, setRange] = useState<'round' | 'full'>('round')
  const [progress, setProgress] = useState<number | null>(null)
  const [video, setVideo] = useState<{ blob: Blob; extension: string } | null>(null)
  const [fileError, setFileError] = useState('')
  const [readingFile, setReadingFile] = useState(false)
  const [videoStatus, setVideoStatus] = useState('')
  const [info, setInfo] = useState<'help' | 'privacy' | null>(null)
  const task = useRef<AbortController | null>(null)
  const importSequence = useRef(0)
  const scenes = timeline?.scenes ?? []
  const active = scenes[step]
  const last = scenes.length - 1
  const advancing = playing && step < last
  const exporting = progress !== null
  const roundNumbers = [...new Set(scenes.map(({ round }) => round))]

  useEffect(() => {
    if (!advancing) return
    const timer = window.setTimeout(() => setStep(step + 1), 950)
    return () => window.clearTimeout(timer)
  }, [advancing, step])

  useEffect(() => () => {
    importSequence.current += 1
    const current = task.current
    task.current = null
    current?.abort()
  }, [])

  function seek(index: number) {
    setPlaying(false)
    setStep(Math.max(0, Math.min(last, index)))
  }

  async function openFile(file: File) {
    const request = ++importSequence.current
    setFileError('')
    if (file.size > MAX_REPLAY_BYTES) { setFileError('Choose a Live Auction replay JSON file under 256 KB.'); return }
    setReadingFile(true)
    try {
      const parsed: unknown = JSON.parse(await file.text())
      const loaded = buildReplayTimeline(parsed)
      if (importSequence.current !== request) return
      if (!loaded) throw new Error('Invalid replay')
      setTimeline(loaded)
      setPlaying(false)
      setStep(0)
      setVideo(null)
      setVideoStatus('')
    } catch {
      if (importSequence.current === request) setFileError('This file isn’t a valid finished Live Auction replay. Choose a replay JSON exported by the game.')
    } finally {
      if (importSequence.current === request) setReadingFile(false)
    }
  }

  async function createVideo() {
    if (!timeline || !active || task.current) return
    const selection = range === 'full' ? scenes : scenes.filter(({ round }) => round === active.round)
    const controller = new AbortController()
    task.current = controller
    setPlaying(false)
    setVideo(null)
    setVideoStatus('')
    setProgress(0)
    try {
      const encoded = await recordReplayVideo(timeline.category, selection, controller.signal, setProgress)
      if (!controller.signal.aborted) {
        setVideo(encoded)
        setVideoStatus('Your portrait video is ready to save.')
      }
    } catch (error) {
      if (task.current === controller) {
        if (controller.signal.aborted) setVideoStatus('Video export cancelled.')
        else setVideoStatus(error instanceof Error ? error.message : 'The video could not be created. Try exporting the current round.')
      }
    } finally {
      if (task.current === controller) {
        task.current = null
        setProgress(null)
      }
    }
  }

  return (
    <>
      <AppShell gamePage onHome={() => window.location.assign('/')} onShowRules={() => setInfo('help')} onShowPrivacy={() => setInfo('privacy')}>
        <section className="game-page replay-studio" aria-labelledby="replay-title">
          <div className="game-intro">
            <span className="mode-label"><Film size={16} aria-hidden="true" /> Creator Tools</span>
            <ScreenHeading id="replay-title">Replay Studio</ScreenHeading>
            <p>Review a finished Live Auction and save a portrait clip.</p>
          </div>
          <Card className="replay-import">
            <label>Open replay JSON
              <input type="file" aria-describedby={fileError ? 'replay-file-error' : undefined} accept=".json,application/json" disabled={exporting || readingFile}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0]
                  event.currentTarget.value = ''
                  if (file) void openFile(file)
                }} />
            </label>
            {fileError && <p id="replay-file-error" role="alert">{fileError}</p>}
            {!timeline && <p>Finish a <a href="/live">Live Auction</a> or choose an exported replay file.</p>}
          </Card>
          {timeline && active && (
            <div className="replay-layout">
              <ReplayPreview scene={active} category={timeline.category} />
              <div className="replay-actions">
                <Card className="replay-panel">
                  <h2>Playback</h2>
                  <label>Jump to a round <select value={active.round ?? ''} onChange={(event) => {
                    const target = event.target.value === '' ? null : Number(event.target.value)
                    seek(scenes.findIndex(({ round }) => round === target))
                  }}>{roundNumbers.map((number) => <option key={number ?? 'final'} value={number ?? ''}>{number === null ? 'Final Showdown' : `Card ${number}`}</option>)}</select></label>
                  <label>Replay progress <input type="range" min={0} max={last} value={step}
                    aria-valuetext={`Step ${step + 1} of ${scenes.length}`} onChange={(event) => seek(event.target.valueAsNumber)} /></label>
                  <div className="replay-playback">
                    <Button variant="icon" aria-label="Previous event" disabled={step === 0} onClick={() => seek(step - 1)}><ChevronLeft size={19} aria-hidden="true" /></Button>
                    <Button onClick={() => {
                      if (advancing) setPlaying(false)
                      else { if (step === last) setStep(0); setPlaying(true) }
                    }}>{advancing ? <Pause size={17} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}{advancing ? 'Pause' : 'Play Replay'}</Button>
                    <Button variant="icon" aria-label="Next event" disabled={step === last} onClick={() => seek(step + 1)}><ChevronRight size={19} aria-hidden="true" /></Button>
                  </div>
                  <p role="status" aria-live={advancing ? 'off' : 'polite'}>{active.round === null ? 'Final Showdown' : active.item?.title} · {active.message}</p>
                </Card>
                <Card className="replay-panel">
                  <h2>Portrait video</h2>
                  {videoSupported ? <>
                    <label>Video range <select value={range} disabled={exporting} onChange={(event) => setRange(event.target.value === 'full' ? 'full' : 'round')}>
                      <option value="round">{active.round === null ? 'Final Showdown' : `Current round · Card ${active.round}`}</option><option value="full">Full replay</option>
                    </select></label>
                    <p>Silent 9:16 video. Keep this tab visible while it renders.</p>
                    {exporting ? <>
                      <progress aria-label="Video export progress" value={progress} max={100} />
                      <Button variant="secondary" onClick={() => task.current?.abort()}>Cancel Export</Button>
                    </> : <Button disabled={readingFile} onClick={() => void createVideo()}><Film size={17} aria-hidden="true" /> Create Video</Button>}
                    {video && <Button variant="secondary" onClick={() => {
                      try { downloadBlob(video.blob, `bid-brawl-replay.${video.extension}`) }
                      catch { setVideoStatus('The video could not be saved. Try again.') }
                    }}><Download size={17} aria-hidden="true" /> Save Video</Button>}
                    {videoStatus && <p role="status">{videoStatus}</p>}
                  </> : <p>Video export is unavailable in this browser. You can still replay each event or use your device’s screen recorder.</p>}
                </Card>
              </div>
            </div>
          )}
        </section>
      </AppShell>
      <Dialog open={info !== null} title={info === 'privacy' ? 'Replay privacy' : 'Using Replay Studio'} onDismiss={() => setInfo(null)}>
        <p className="privacy-notice">{info === 'privacy' ? 'Replay files are opened on this device. The video uses public auction events and includes player names. Studio doesn’t access your camera, microphone, or screen.' : 'Open a Live Auction replay JSON, then play, pause, or step through each event. Pick the current round or full replay when creating a portrait video.'}</p>
      </Dialog>
    </>
  )
}

function ReplayPreview({ scene, category }: { scene: ReplayScene; category: string }) {
  return (
    <div className="replay-frame" role="group" aria-label="9:16 replay preview">
      <div className="replay-frame__players">
        {scene.players.map((player) => <div key={player.id} className={`replay-seat player-${player.id}`}>
          <span className="player-status__label">{player.id === 'p1' ? 'Player 1' : 'Player 2'}</span>
          <strong>{player.name}</strong><span className="replay-seat__budget">${player.budget}</span><span>{player.picks}/5 picks</span>
        </div>)}
      </div>
      <div className="replay-frame__item">
        <span className="mystery-card__theme">{category}</span>
        <span className="replay-frame__symbol" aria-hidden="true">{scene.item?.emoji ?? '🏆'}</span>
        <h2>{scene.item?.title ?? 'Final Showdown'}</h2>
        <p>{scene.message}</p>
      </div>
    </div>
  )
}
