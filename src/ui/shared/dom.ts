type Attributes = Record<string, string | number | boolean | undefined>
type Child = Node | string | null | undefined | false

/**
 * Creates an element: el('button', { class: 'button', type: 'button' }, 'Save').
 * Text children are inserted as text, never as HTML, so page titles can't
 * inject markup.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Attributes = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag)
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined || value === false) continue
    element.setAttribute(name, value === true ? '' : String(value))
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue
    element.append(child)
  }
  return element
}

/** Finds a required element, failing loudly if the page's HTML changed. */
export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Missing element #${id}`)
  return element as T
}
