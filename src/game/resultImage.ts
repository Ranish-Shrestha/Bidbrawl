import type { Showdown } from './showdown'

const colors = {
  midnight: '#0B1020', panel: '#171F35', raised: '#202A46', ink: '#F8FAFC', muted: '#A6B2CA',
  violet: '#C6ABFF', cyan: '#22D3EE', gold: '#FBBF24', edge: '#34405D',
}
const display = '"Space Grotesk Variable", system-ui, sans-serif'

function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, font: string, color: string, maxWidth: number) {
  ctx.font = `${font} ${display}`
  ctx.fillStyle = color
  ctx.fillText(text, x, y, maxWidth)
}

function drawPickTitle(ctx: CanvasRenderingContext2D, title: string, x: number, y: number, maxWidth: number) {
  const font = '700 29px'
  ctx.font = `${font} ${display}`
  if (ctx.measureText(title).width <= maxWidth) {
    drawText(ctx, title, x, y + 12, font, colors.ink, maxWidth)
    return
  }
  const words = title.split(' ')
  let split = 1
  while (split < words.length - 1 && ctx.measureText(words.slice(0, split + 1).join(' ')).width <= maxWidth) split += 1
  const first = words.slice(0, split).join(' ')
  const second = words.slice(split).join(' ')
  drawText(ctx, first, x, second ? y - 3 : y + 12, font, colors.ink, maxWidth)
  if (second) drawText(ctx, second, x, y + 29, font, colors.ink, maxWidth)
}

export async function createResultImage(showdown: Showdown): Promise<Blob> {
  await document.fonts?.ready
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1350
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')

  const wash = ctx.createRadialGradient(820, 60, 10, 820, 60, 850)
  wash.addColorStop(0, '#302455')
  wash.addColorStop(1, colors.midnight)
  ctx.fillStyle = wash
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.fillStyle = colors.violet
  ctx.fillRect(64, 76, 42, 5)
  drawText(ctx, 'Bid Brawl', 122, 90, '700 27px', colors.violet, 870)
  drawText(ctx, 'Final Showdown', 64, 188, '700 90px', colors.ink, 952)
  drawText(ctx, showdown.categoryTitle, 68, 258, '700 48px', colors.violet, 944)
  drawText(ctx, `5 picks each  ·  ${showdown.discardedCount} discarded`, 69, 316, '500 29px', colors.muted, 944)

  for (const [index, player] of showdown.players.entries()) {
    const left = 64 + index * 488
    const accent = index === 0 ? colors.violet : colors.cyan
    ctx.beginPath()
    ctx.roundRect(left, 366, 464, 834, 32)
    ctx.fillStyle = colors.panel
    ctx.fill()
    ctx.strokeStyle = colors.edge
    ctx.lineWidth = 2
    ctx.stroke()

    drawText(ctx, `PLAYER ${index + 1}`, left + 30, 431, '700 23px', accent, 404)
    drawText(ctx, player.name, left + 30, 496, '700 52px', colors.ink, 404)

    for (const [row, pick] of player.picks.entries()) {
      const rowTop = 534 + row * 100
      ctx.beginPath()
      ctx.roundRect(left + 24, rowTop, 416, 82, 14)
      ctx.fillStyle = colors.raised
      ctx.fill()
      drawPickTitle(ctx, pick.title, left + 43, rowTop + 40, 309)
      ctx.textAlign = 'right'
      drawText(ctx, `$${pick.paid}`, left + 421, rowTop + 52, '700 31px', accent, 58)
      ctx.textAlign = 'left'
    }

    drawText(ctx, `Spent $${player.spent}`, left + 30, 1106, '700 31px', colors.gold, 404)
    drawText(ctx, `$${player.remaining} remaining`, left + 30, 1151, '500 28px', colors.muted, 404)
  }

  drawText(ctx, 'Who built the better lineup?', 64, 1283, '700 40px', colors.ink, 952)

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('PNG encoding failed'))
    }, 'image/png')
  })
}
