const nameSegments = new Intl.Segmenter('en', { granularity: 'grapheme' })
const invalidNameCharacters = /[\p{Cc}\p{Bidi_Control}\p{Cs}]/u

export function normalizePlayerName(name: string): string | null {
  const trimmed = name.trim().normalize('NFC')
  if (!/[\p{L}\p{N}\p{P}\p{S}]/u.test(trimmed) || invalidNameCharacters.test(trimmed)) return null

  let end = 0
  let length = 0
  for (const { segment } of nameSegments.segment(trimmed)) {
    end += segment.length
    length += 1
    if (length === 20) break
  }
  return trimmed.slice(0, end).trimEnd()
}
