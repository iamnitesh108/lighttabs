const months = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

/** "30 min", "2 h", "1 day": for timer settings and countdowns. */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`
  if (minutes < 1440) return `${Math.round(minutes / 60)} h`
  const days = Math.round(minutes / 1440)
  return days === 1 ? '1 day' : `${days} days`
}

/** "Today, 14:03", "Yesterday, 09:15" or "25 Sep 2026, 18:40". */
export function formatSavedAt(time: number, now: number): string {
  const date = new Date(time)
  const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  const day = startOfDay(time)
  const today = startOfDay(now)
  if (day === today) return `Today, ${clock}`
  // Not "today minus 24 h": days around daylight-saving changes are 23 or 25 h long.
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (day === yesterday.getTime()) return `Yesterday, ${clock}`
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}, ${clock}`
}

/** The toolbar badge: empty when there's nothing to count (the badge then hides). */
export function badgeText(count: number): string {
  if (count === 0) return ''
  return count > 999 ? '999+' : String(count)
}

export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

function startOfDay(time: number): number {
  const d = new Date(time)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
