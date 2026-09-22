import { describe, expect, it } from 'vitest'
import { renderTemplate } from './variables.js'

const contact = { name: 'Maria Silva', phone: '5511999999999' }

describe('renderTemplate', () => {
  it('replaces the contact variables', () => {
    expect(renderTemplate('Olá {{contato.primeiro_nome}} ({{contato.nome}}, {{contato.telefone}})', contact)).toBe(
      'Olá Maria (Maria Silva, 5511999999999)',
    )
  })

  it('tolerates spaces inside the braces', () => {
    expect(renderTemplate('Oi {{ contato.primeiro_nome }}!', contact)).toBe('Oi Maria!')
  })

  it('falls back to the phone when the contact has no name', () => {
    expect(renderTemplate('Oi {{contato.primeiro_nome}}', { name: null, phone: '5511' })).toBe('Oi 5511')
    expect(renderTemplate('Oi {{contato.nome}}', { name: '  ', phone: '5511' })).toBe('Oi 5511')
  })

  it('turns unknown variables into empty strings', () => {
    expect(renderTemplate('a{{pedido.total}}b', contact)).toBe('ab')
  })

  it('leaves text without variables unchanged', () => {
    expect(renderTemplate('Sem variáveis {chaves}', contact)).toBe('Sem variáveis {chaves}')
  })
})
