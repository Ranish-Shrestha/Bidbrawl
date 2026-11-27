import { DECK_SIZE } from '../game/types'
import type { Category, Item } from '../game/types'

const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const emojiPattern = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u

function isCleanText(text: string): boolean {
  return text.length > 0 && text === text.trim()
}

export function getActiveItems(category: Category): readonly Item[] {
  return category.items.filter((item) => item.active !== false)
}

export function validateCategory(category: Category): string[] {
  const issues: string[] = []
  if (!slug.test(category.id)) issues.push('Invalid category ID.')
  if (!isCleanText(category.title) || !isCleanText(category.description) || !emojiPattern.test(category.emoji)) {
    issues.push('A category needs a trimmed title, description, and emoji.')
  }

  const ids = new Set<string>()
  const titles = new Set<string>()
  for (const item of category.items) {
    if (!slug.test(item.id) || ids.has(item.id)) issues.push(`Invalid or duplicate item ID: ${item.id}`)
    ids.add(item.id)

    const title = item.title.normalize('NFC').toLowerCase()
    if (!isCleanText(item.title) || titles.has(title) || !emojiPattern.test(item.emoji)) {
      issues.push(`An item needs a unique trimmed title and emoji: ${item.id}`)
    }
    titles.add(title)
  }

  if (getActiveItems(category).length < DECK_SIZE) issues.push(`A category needs at least ${DECK_SIZE} active items.`)
  return issues
}

export function validateCategories(categories: readonly Category[]): string[] {
  const ids = new Set<string>()
  const issues: string[] = []
  for (const category of categories) {
    if (ids.has(category.id)) issues.push(`Duplicate category ID: ${category.id}`)
    ids.add(category.id)
    for (const issue of validateCategory(category)) issues.push(`${category.id}: ${issue}`)
  }
  return issues
}
