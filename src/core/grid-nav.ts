/** Where something is on screen, as `getBoundingClientRect` reports it. */
export type Box = {
  left: number
  top: number
}

/**
 * The order Up and Down go through the cards of one grid: down the first
 * column, then from the top of the next one, so every card is reached.
 * Returns indexes into `boxes`.
 */
export function columnOrder(boxes: readonly Box[]): number[] {
  // Rounded: cards in one column can differ by a fraction of a pixel.
  const left = (i: number) => Math.round(boxes[i].left)
  return boxes
    .map((_, i) => i)
    .toSorted((a, b) => left(a) - left(b) || boxes[a].top - boxes[b].top)
}
