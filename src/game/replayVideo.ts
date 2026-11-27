import { fixWebmDuration } from '@fix-webm-duration/fix'
import type { ReplayScene } from './replayTimeline'

const width = 540
const height = 960
const fps = 15
const fontStack = '"Space Grotesk Variable", system-ui, sans-serif'

const formats = [
  { mime: 'video/webm;codecs=vp8', extension: 'webm' },
  { mime: 'video/webm', extension: 'webm' },
  { mime: 'video/mp4', extension: 'mp4' },
] as const

export function supportsReplayVideo() {
  return typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function' &&
    formats.some(({ mime }) => MediaRecorder.isTypeSupported(mime))
}

function label(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, color: string, maxWidth: number) {
  ctx.font = `700 ${size}px ${fontStack}`
  ctx.fillStyle = color
  ctx.fillText(value, x, y, maxWidth)
}

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 20)
  ctx.fillStyle = color
  ctx.fill()
}

function paint(ctx: CanvasRenderingContext2D, scene: ReplayScene, category: string) {
  const sky = ctx.createRadialGradient(245, 350, 35, 245, 350, 550)
  sky.addColorStop(0, '#382a52')
  sky.addColorStop(1, '#0b1020')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, width, height)
  label(ctx, 'Bid Brawl', 45, 90, 22, '#c6abff', 415)
  label(ctx, category, 45, 136, 37, '#f8fafc', 415)
  scene.players.forEach((player, index) => {
    const x = 45 + index * 230
    const accent = index === 0 ? '#c6abff' : '#22d3ee'
    panel(ctx, x, 178, 220, 145, '#171f35')
    label(ctx, `PLAYER ${index + 1}`, x + 15, 216, 16, accent, 190)
    label(ctx, player.name, x + 15, 251, 26, '#f8fafc', 190)
    label(ctx, `$${player.budget}  ·  ${player.picks}/5 picks`, x + 15, 293, 22, accent, 190)
  })

  panel(ctx, 45, 363, 450, 388, '#171f35')
  ctx.textAlign = 'center'
  label(ctx, scene.round === null ? 'FINAL RESULTS' : `CARD ${scene.round}`, 270, 418, 22, '#c6abff', 375)
  label(ctx, scene.item?.emoji ?? '🏆', 270, 555, 90, '#fbbf24', 165)
  label(ctx, scene.item?.title ?? 'Final Showdown', 270, 631, 40, '#f8fafc', 368)
  label(ctx, scene.message, 270, 706, 26, '#fbbf24', 372)
  ctx.textAlign = 'left'
  label(ctx, 'LIVE AUCTION REPLAY', 45, 830, 22, '#a6b2ca', 420)
}

function duration(scene: ReplayScene) {
  if (scene.kind === 'final') return 1600
  if (scene.kind === 'outcome') return 1000
  return scene.kind === 'reveal' ? 750 : 550
}

export async function recordReplayVideo(
  category: string, scenes: readonly ReplayScene[], signal: AbortSignal, onProgress: (percent: number) => void,
): Promise<{ blob: Blob; extension: string }> {
  if (scenes.length === 0 || !supportsReplayVideo() || document.hidden) throw new Error('Video export is unavailable')
  await document.fonts?.ready
  signal.throwIfAborted()
  if (document.hidden) throw new Error('Keep the replay tab visible while exporting.')
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is unavailable')
  paint(context, scenes[0]!, category)
  const stream = canvas.captureStream(fps)

  try {
    let encoder: { recorder: MediaRecorder; format: typeof formats[number] } | undefined
    for (const format of formats) {
      if (!MediaRecorder.isTypeSupported(format.mime)) continue
      try {
        encoder = { recorder: new MediaRecorder(stream, { mimeType: format.mime, videoBitsPerSecond: 1_400_000 }), format }
        break
      } catch { /* Try the next available container. */ }
    }
    if (!encoder) throw new Error('Video encoder is unavailable')
    const { recorder, format } = encoder
    const chunks: Blob[] = []
    const naturalDuration = scenes.reduce((total, entry) => total + duration(entry), 0)
    const scale = Math.min(1, 45_000 / naturalDuration)
    const total = naturalDuration * scale

    const blob = await new Promise<Blob>((resolve, reject) => {
      const start = performance.now()
      let index = 0
      let boundary = duration(scenes[0]!) * scale
      let frame = 0
      let deadline = 0
      let lastPaint = start
      let percent = 0
      let finished = false

      function cleanup() {
        window.cancelAnimationFrame(frame)
        window.clearTimeout(deadline)
        signal.removeEventListener('abort', abort)
        document.removeEventListener('visibilitychange', visibility)
      }
      function fail(error: Error) {
        cleanup()
        if (recorder.state !== 'inactive') recorder.stop()
        reject(error)
      }
      function abort() { fail(new DOMException('Video export cancelled', 'AbortError')) }
      function visibility() {
        if (document.hidden) fail(new Error('Keep the replay tab visible while exporting.'))
      }
      function render(now: number) {
        const elapsed = now - start
        if (elapsed >= total) {
          finished = true
          onProgress(100)
          if (recorder.state !== 'inactive') recorder.stop()
          return
        }
        while (elapsed >= boundary && index < scenes.length - 1) {
          index += 1
          boundary += duration(scenes[index]!) * scale
        }
        if (now - lastPaint >= 1000 / fps) {
          paint(context!, scenes[index]!, category)
          lastPaint = now
        }
        const current = Math.floor(elapsed / total * 100)
        if (percent !== current) onProgress(percent = current)
        frame = window.requestAnimationFrame(render)
      }

      recorder.ondataavailable = ({ data }) => { if (data.size) chunks.push(data) }
      recorder.onerror = () => fail(new Error('The browser could not encode the video.'))
      recorder.onstop = () => {
        cleanup()
        if (finished && chunks.length) resolve(new Blob(chunks, { type: format.extension === 'webm' ? 'video/webm' : 'video/mp4' }))
        else reject(new Error('Video encoding ended early. Try exporting the current round.'))
      }
      signal.addEventListener('abort', abort, { once: true })
      document.addEventListener('visibilitychange', visibility)
      try {
        recorder.start(1000)
        frame = window.requestAnimationFrame(render)
        deadline = window.setTimeout(() => fail(new Error('Video encoding timed out.')), total + 8000)
      } catch { fail(new Error('The video export could not start.')) }
    })
    const video = format.extension === 'webm' ? await fixWebmDuration(blob, total, { logger: false }) : blob
    signal.throwIfAborted()
    return { blob: video, extension: format.extension }
  } finally {
    stream.getTracks().forEach((track) => track.stop())
  }
}
