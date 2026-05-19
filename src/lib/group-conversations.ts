import type { ConversationRow } from './chat-history'

export type ConversationGroup = {
  label: 'Pinned' | 'Today' | 'Yesterday' | 'Last 7 days' | 'Older'
  items: ConversationRow[]
}

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function groupConversations(rows: ConversationRow[]): ConversationGroup[] {
  const now = new Date()
  const today = startOfDay(now)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const sevenDaysAgo = new Date(today)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const groups: Record<ConversationGroup['label'], ConversationRow[]> = {
    Pinned: [],
    Today: [],
    Yesterday: [],
    'Last 7 days': [],
    Older: [],
  }

  for (const c of rows) {
    if (c.pinned) {
      groups.Pinned.push(c)
      continue
    }
    const updated = new Date(c.updated_at)
    if (updated >= today) groups.Today.push(c)
    else if (updated >= yesterday) groups.Yesterday.push(c)
    else if (updated >= sevenDaysAgo) groups['Last 7 days'].push(c)
    else groups.Older.push(c)
  }

  return (Object.keys(groups) as ConversationGroup['label'][])
    .map((label) => ({ label, items: groups[label] }))
    .filter((g) => g.items.length > 0)
}
