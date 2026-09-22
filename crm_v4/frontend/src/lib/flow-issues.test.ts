import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi } from '@/test/render'
import { activateFlow, issuesByNode, saveFlowGraph } from './flow-issues'

afterEach(() => vi.unstubAllGlobals())

describe('flow-issues', () => {
  it('returns the saved flow', async () => {
    mockApi({ 'PUT /api/flows/f1/graph': () => ({ body: { id: 'f1', name: 'A' } }) })
    await expect(saveFlowGraph('f1', { nodes: [], edges: [] })).resolves.toMatchObject({ ok: true, flow: { id: 'f1' } })
  })

  it('returns the issues of an invalid flow', async () => {
    const issues = [{ nodeId: 'n1', message: 'Bloco desconectado.' }, { message: 'Adicione um gatilho.' }]
    mockApi({ 'POST /api/flows/f1/activate': () => ({ status: 422, body: { code: 'INVALID_FLOW', message: 'Fluxo inválido.', issues } }) })
    await expect(activateFlow('f1')).resolves.toEqual({ ok: false, issues, message: 'Fluxo inválido.' })
  })

  it('throws other errors with their message', async () => {
    mockApi({ 'POST /api/flows/f1/activate': () => ({ status: 409, body: { code: 'X', message: 'Conflito.' } }) })
    await expect(activateFlow('f1')).rejects.toMatchObject({ status: 409, message: 'Conflito.' })
  })

  it('groups issues by node', () => {
    const map = issuesByNode([{ nodeId: 'a', message: '1' }, { nodeId: 'a', message: '2' }, { message: '3' }])
    expect(map.get('a')).toEqual(['1', '2'])
    expect(map.get('')).toEqual(['3'])
  })
})
