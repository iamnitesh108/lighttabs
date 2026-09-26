/**
 * Runs async tasks one after another. Storage updates are read-modify-write:
 * two running at once could both read the old value, and one change would
 * be lost. Queuing them makes each update see the previous one's result.
 */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve()

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task)
    // The queue continues even if a task fails; the caller still sees the error.
    this.tail = result.catch(() => {})
    return result
  }
}
