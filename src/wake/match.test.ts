import { describe, expect, it } from 'vitest'
import { matchesWakePhrase } from './match'

describe('wake phrase matching', () => {
  it.each([
    'Hoy Condoriano',
    'hey condoriano',
    'oi, Condo Riano!',
    'hey condo rio no',
    'okay kondoriano',
  ])('matches "%s" at every sensitivity', (heard) => {
    expect(matchesWakePhrase(heard, 'low')).toBe(true)
    expect(matchesWakePhrase(heard, 'medium')).toBe(true)
    expect(matchesWakePhrase(heard, 'high')).toBe(true)
  })

  it('accepts near misses only at higher sensitivity', () => {
    expect(matchesWakePhrase('hey condorione', 'low')).toBe(false)
    expect(matchesWakePhrase('hey condorione', 'high')).toBe(true)
    expect(matchesWakePhrase('condoriano', 'low')).toBe(false)
    expect(matchesWakePhrase('condoriano', 'medium')).toBe(true)
  })

  it('ignores normal conversation', () => {
    for (const s of ['hey how are you', 'the condor flew over', 'conditioner is on sale', '']) {
      expect(matchesWakePhrase(s, 'high')).toBe(false)
    }
  })
})
