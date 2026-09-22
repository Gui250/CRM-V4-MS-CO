import { describe, expect, it } from 'vitest'
import { containsAnyKeyword, isOptOutMessage, normalizeText } from './text.js'

describe('normalizeText', () => {
  it('removes accents, case and surrounding spaces', () => {
    expect(normalizeText('  Preço À VISTA ')).toBe('preco a vista')
  })
})

describe('isOptOutMessage', () => {
  it.each(['parar', 'SAIR', ' Descadastrar! ', 'parar.', 'Sair!!'])('treats "%s" as opt-out', (text) => {
    expect(isOptOutMessage(text)).toBe(true)
  })

  it.each(['não quero sair agora', 'pode parar de mandar?', 'sairia', ''])('does not treat "%s" as opt-out', (text) => {
    expect(isOptOutMessage(text)).toBe(false)
  })
})

describe('containsAnyKeyword', () => {
  it('matches ignoring case and accents', () => {
    expect(containsAnyKeyword('Qual o PRECO?', ['preço', 'valor'])).toBe(true)
  })

  it('does not match when no keyword is present', () => {
    expect(containsAnyKeyword('bom dia', ['preço'])).toBe(false)
  })
})
