import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AutomationLabel } from './automation-label'

describe('AutomationLabel', () => {
  it('labels flow and agent messages', () => {
    const { rerender } = render(<AutomationLabel automation={{ kind: 'flow', name: 'Boas-vindas' }} />)
    expect(screen.getByText('Automação: Boas-vindas')).toBeInTheDocument()
    rerender(<AutomationLabel automation={{ kind: 'agent', name: 'Qualificação' }} />)
    expect(screen.getByText('IA: Qualificação')).toBeInTheDocument()
  })

  it('renders nothing for human messages', () => {
    const { container } = render(<AutomationLabel automation={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})
