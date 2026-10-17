import { describe, expect, it } from 'vitest'
import { loadKnowledgeBase } from './index'

const knowledgeBase = await loadKnowledgeBase()

describe('knowledge base', () => {
  it('loads the system prompt, glossary and sections', () => {
    expect(knowledgeBase.skill).toContain('{user_name}')
    expect(knowledgeBase.glossary.some((g) => g.slang === 'PEN')).toBe(true)
    expect(knowledgeBase.sections.length).toBeGreaterThan(5)
  })
})
