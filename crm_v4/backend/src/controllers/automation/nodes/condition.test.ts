import { describe, expect, it } from 'vitest'
import { evaluateCondition } from './condition.js'

const facts = { lastMessage: 'Qual o PREÇO do plano?', contactName: 'Ana Souza', contactPhone: '5511999999999' }

describe('evaluateCondition', () => {
  it('matches "contains" ignoring case and accents', () => {
    expect(evaluateCondition({ source: 'last_message', operator: 'contains', value: 'preco' }, facts)).toBe('yes')
    expect(evaluateCondition({ source: 'last_message', operator: 'contains', value: 'boleto' }, facts)).toBe('no')
  })

  it('matches "equals" on the whole trimmed value', () => {
    expect(evaluateCondition({ source: 'contact_name', operator: 'equals', value: ' ana souza ' }, facts)).toBe('yes')
    expect(evaluateCondition({ source: 'contact_name', operator: 'equals', value: 'Ana' }, facts)).toBe('no')
  })

  it('matches "starts_with" on the phone', () => {
    expect(evaluateCondition({ source: 'contact_phone', operator: 'starts_with', value: '5511' }, facts)).toBe('yes')
    expect(evaluateCondition({ source: 'contact_phone', operator: 'starts_with', value: '5521' }, facts)).toBe('no')
  })

  it('treats media or missing values as empty', () => {
    const noText = { ...facts, lastMessage: null, contactName: null }
    expect(evaluateCondition({ source: 'last_message', operator: 'is_empty', value: '' }, noText)).toBe('yes')
    expect(evaluateCondition({ source: 'contact_name', operator: 'is_empty', value: '' }, noText)).toBe('yes')
    expect(evaluateCondition({ source: 'last_message', operator: 'is_empty', value: '' }, facts)).toBe('no')
  })
})
