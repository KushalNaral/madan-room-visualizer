export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'surface'
  )
}

/** A slug from the label that no other surface uses ("wall", "wall-2", …). */
export function uniqueId(label: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  const base = slugify(label)
  if (!used.has(base)) return base
  for (let i = 2; ; i++) if (!used.has(`${base}-${i}`)) return `${base}-${i}`
}

/** "Wall", "Wall 2", … for a new surface of a kind. */
export function nextLabel(base: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  if (!used.has(base)) return base
  for (let i = 2; ; i++) if (!used.has(`${base} ${i}`)) return `${base} ${i}`
}
