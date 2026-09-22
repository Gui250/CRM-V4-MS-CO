import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LostReasonDialog } from './lost-reason-dialog'

const setup = () => {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(<LostReasonDialog leadName="Carla" stageName="Perdido" onConfirm={onConfirm} onCancel={onCancel} />)
  return { user: userEvent.setup(), onConfirm, onCancel }
}

describe('LostReasonDialog', () => {
  it('focuses the reason and only confirms a non-blank, trimmed reason', async () => {
    const { user, onConfirm } = setup()
    const field = screen.getByLabelText('Motivo')
    expect(field).toHaveFocus()
    const submit = screen.getByRole('button', { name: 'Marcar como perdido' })
    expect(submit).toBeDisabled()

    await user.type(field, '   ')
    expect(submit).toBeDisabled()
    await user.type(field, 'Preço alto ')
    expect(screen.getByText('14/200')).toBeInTheDocument()
    await user.click(submit)
    expect(onConfirm).toHaveBeenCalledWith('Preço alto')
  })

  it('caps the reason at 200 characters', () => {
    setup()
    expect(screen.getByLabelText('Motivo')).toHaveAttribute('maxLength', '200')
  })

  it('cancels with Escape and with the button', async () => {
    const { user, onCancel } = setup()
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onCancel).toHaveBeenCalledTimes(2)
  })
})
