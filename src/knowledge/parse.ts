export type Frontmatter = Record<string, string>

export interface KbSection {
  id: string
  file: string
  category: string
  patchDate: string
  heading: string
  text: string
}

export interface GlossaryEntry {
  slang: string
  official: string
  meaning: string
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

export function parseFrontmatter(raw: string): { meta: Frontmatter; body: string } {
  const match = raw.match(FRONTMATTER)
  if (!match) return { meta: {}, body: raw }
  const meta: Frontmatter = {}
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
  }
  return { meta, body: raw.slice(match[0].length) }
}

/** Splits a knowledge file into its `##` sections. Text before the first `##` is ignored. */
export function splitSections(file: string, raw: string): KbSection[] {
  const { meta, body } = parseFrontmatter(raw)
  const sections: KbSection[] = []
  const parts = body.split(/^## +/m).slice(1)
  for (const part of parts) {
    const newline = part.indexOf('\n')
    const heading = (newline === -1 ? part : part.slice(0, newline)).trim()
    const text = (newline === -1 ? '' : part.slice(newline + 1)).trim()
    if (!heading) continue
    sections.push({
      id: `${file}#${slugify(heading)}`,
      file,
      category: meta.category ?? 'general',
      patchDate: meta.patch_date ?? 'unknown',
      heading,
      text,
    })
  }
  return sections
}

/** Reads `| slang | official | meaning |` rows from the glossary tables. */
export function parseGlossary(raw: string): GlossaryEntry[] {
  const entries: GlossaryEntry[] = []
  for (const line of raw.split(/\r?\n/)) {
    const cells = line.split('|').slice(1, -1).map((c) => c.trim())
    if (cells.length < 3) continue
    const [slang, official, meaning] = cells
    if (!slang || slang === 'slang' || /^-+$/.test(slang)) continue
    entries.push({ slang, official, meaning })
  }
  return entries
}

/** Turns markdown bold/italics into plain text so the model gets clean sentences. */
export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\n{2,}/g, '\n')
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
