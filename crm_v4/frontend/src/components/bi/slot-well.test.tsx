import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeVisual } from '@/lib/bi/test-helpers'
import { FIELD_MIME } from './field-meta'
import { SlotWell } from './slot-well'
import { SOURCE_ID, messagesSource } from './test-utils'

const drop = (field: string, type: string) => ({
  dataTransfer: { types: [FIELD_MIME], getData: () => JSON.stringify({ sourceId: SOURCE_ID, field, type }) },
})

function setup(visual = makeVisual({ sourceId: SOURCE_ID }), slot: 'category' | 'value' = 'category') {
  const dispatch = vi.fn()
  render(<SlotWell visual={visual} slot={slot} sourcesById={{ [SOURCE_ID]: messagesSource }} calculatedFields={[]} dispatch={dispatch} />)
  return { dispatch }
}

describe('SlotWell', () => {
  it('drops an accepted field into the slot', () => {
    const { dispatch } = setup()
    fireEvent.drop(screen.getByRole('group', { name: 'Espaço Categoria' }), drop('agent', 'text'))
    expect(dispatch).toHaveBeenCalledWith({ type: 'dropField', visualId: 'v1', slot: 'category', field: { sourceId: SOURCE_ID, field: 'agent' }, fieldType: 'text' })
  })

  it('rejects a field the slot does not accept', () => {
    const { dispatch } = setup(makeVisual({ type: 'filter_date', sourceId: SOURCE_ID }))
    fireEvent.drop(screen.getByRole('group', { name: 'Espaço Campo' }), drop('agent', 'text'))
    expect(screen.getByRole('alert')).toHaveTextContent('Este campo não serve para Campo.')
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('changes the aggregation and removes a value', async () => {
    const visual = makeVisual({ sourceId: SOURCE_ID, slots: { value: [{ sourceId: SOURCE_ID, field: 'value', aggregation: 'sum' }] } })
    const { dispatch } = setup(visual, 'value')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Agregação de Valor' }), 'Média')
    expect(dispatch).toHaveBeenCalledWith({ type: 'setAggregation', visualId: 'v1', index: 0, aggregation: 'avg' })
    await userEvent.click(screen.getByRole('button', { name: 'Remover Valor de Valor' }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'removeField', visualId: 'v1', slot: 'value', index: 0 })
  })

  it('changes the date grain of a date category', async () => {
    const { dispatch } = setup(makeVisual({ sourceId: SOURCE_ID, slots: { category: [{ sourceId: SOURCE_ID, field: 'sent_at', dateGrain: 'month' }] } }))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Agrupamento de Enviada em' }), 'Ano')
    expect(dispatch).toHaveBeenCalledWith({ type: 'setDateGrain', visualId: 'v1', slot: 'category', index: 0, grain: 'year' })
  })
})
