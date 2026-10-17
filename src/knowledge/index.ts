import { KnowledgeBase } from './search'

let instance: KnowledgeBase | null = null
let loading: Promise<KnowledgeBase> | null = null

/**
 * The knowledge base is a few hundred KB of text, so it loads on demand instead of with the
 * first page. Calls await this before starting.
 */
export function loadKnowledgeBase(): Promise<KnowledgeBase> {
  loading ??= import('./data').then(({ files }) => (instance = new KnowledgeBase(files)))
  return loading
}

/** The loaded knowledge base. Only valid once `loadKnowledgeBase()` has resolved. */
export function getKnowledgeBase(): KnowledgeBase {
  if (!instance) throw new Error('The knowledge base is not loaded yet.')
  return instance
}
