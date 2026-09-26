/**
 * Runs `task` for every item, at most `limit` at a time, and resolves when
 * all are done. A task that fails doesn't stop the others.
 */
export async function runLimited<T>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<unknown>,
): Promise<void> {
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++]
      await task(item).catch(() => {})
    }
  }
  const workers = Math.min(limit, items.length)
  await Promise.all(Array.from({ length: workers }, worker))
}
