import MiniSearch from 'minisearch'
import { parseFrontmatter, parseGlossary, splitSections, stripMarkdown } from './parse'
import type { GlossaryEntry, KbSection } from './parse'

/** Files that live in knowledge-base/ but are never searched. */
const NOT_SEARCHED = new Set(['skill.md', 'synonyms.md'])

const STOP_WORDS = new Set(
  (
    'a an and are can could do does for from get go have how i if in is it me my of on or ' +
    'should so that the this to up what when where which who why will with you your'
  ).split(' '),
)

/**
 * Light English stemming so plural and singular match ("accessories" ↔ "accessory",
 * "stones" ↔ "stone"). Prefix search already covers "enhance" → "enhancement".
 */
export function stem(term: string): string {
  if (term.length <= 3) return term
  if (term.endsWith('ies') && term.length > 4) return `${term.slice(0, -3)}y`
  if (/(s|x|z|ch|sh)es$/.test(term)) return term.slice(0, -2)
  if (term.endsWith('s') && !term.endsWith('ss') && !term.endsWith('us')) return term.slice(0, -1)
  return term
}

/** A section as indexed: table rows get their own, lower-weight field so big tables don't drown prose. */
interface IndexedSection {
  id: string
  heading: string
  prose: string
  table: string
  category: string
}

function toIndexed(section: KbSection): IndexedSection {
  const lines = section.text.split('\n')
  const isRow = (line: string) => line.trimStart().startsWith('|')
  return {
    id: section.id,
    heading: section.heading,
    prose: lines.filter((l) => !isRow(l)).join('\n'),
    table: lines.filter(isRow).join('\n'),
    category: section.category,
  }
}

export interface SearchHit {
  section: KbSection
  score: number
}

export interface ToolResult {
  results: { title: string; category: string; patch_date: string; text: string }[]
  note: string
}

export class KnowledgeBase {
  readonly sections: KbSection[]
  readonly glossary: GlossaryEntry[]
  readonly skill: string
  readonly version: string
  private index: MiniSearch<IndexedSection>
  private byId: Map<string, KbSection>

  /** @param files map of path (e.g. `/knowledge-base/enhancement.md`) to raw markdown */
  constructor(files: Record<string, string>) {
    this.sections = []
    this.glossary = []
    this.skill = ''
    let latest = ''

    for (const [path, raw] of Object.entries(files)) {
      const file = path.replace(/^.*knowledge-base\//, '')
      const { meta, body } = parseFrontmatter(raw)
      if (meta.patch_date && meta.patch_date > latest) latest = meta.patch_date
      if (file === 'skill.md') {
        this.skill = body.trim()
        continue
      }
      // Both tables widen searches; only the glossary is also searchable itself.
      if (file === 'glossary.md' || file === 'synonyms.md') this.glossary.push(...parseGlossary(body))
      if (NOT_SEARCHED.has(file)) continue
      this.sections.push(...splitSections(file, raw))
    }

    this.version = `${latest || 'unknown'} (${this.sections.length} sections)`
    this.byId = new Map(this.sections.map((s) => [s.id, s]))
    this.index = new MiniSearch<IndexedSection>({
      fields: ['heading', 'prose', 'table', 'category'],
      storeFields: ['id'],
      processTerm: (term) => {
        const t = term.toLowerCase()
        return STOP_WORDS.has(t) ? null : stem(t)
      },
      searchOptions: { boost: { heading: 3, prose: 1, table: 0.35, category: 1.5 }, fuzzy: 0.2, prefix: true },
    })
    this.index.addAll(this.sections.map(toIndexed))
  }

  /** Adds official names for player slang and game words for everyday phrasing ("PEN" → "V (Penta)"). */
  expandQuery(query: string): string {
    const asked = new Set(query.toLowerCase().match(/[a-z0-9']+/g) ?? [])
    const extra = new Set<string>()
    for (const entry of this.glossary) {
      const pattern = new RegExp(`\\b${escapeRegExp(entry.slang)}\\b`, 'i')
      if (!pattern.test(query)) continue
      // Only add new words: "TRI" → "III (Tri)" adds "III", not a second "Tri".
      for (const word of entry.official.toLowerCase().match(/[a-z0-9']+/g) ?? []) {
        if (!asked.has(word)) extra.add(word)
      }
    }
    return extra.size ? `${query} ${[...extra].join(' ')}` : query
  }

  search(query: string, limit = 4): SearchHit[] {
    const expanded = this.expandQuery(query)
    return this.index
      .search(expanded, { combineWith: 'OR' })
      .slice(0, limit)
      .map((r) => ({ section: this.byId.get(r.id as string)!, score: r.score }))
  }

  /** The payload returned to the model for `search_bdo_knowledge`. */
  toolResult(query: string, limit = 4): ToolResult {
    const hits = this.search(query, limit)
    return {
      results: hits.map(({ section }) => ({
        title: section.heading,
        category: section.category,
        patch_date: section.patchDate,
        text: stripMarkdown(section.text),
      })),
      note: hits.length
        ? 'Answer only from these results. If they do not answer the question, say you do not have that information yet.'
        : 'No results. Tell the player you do not have that information yet.',
    }
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
