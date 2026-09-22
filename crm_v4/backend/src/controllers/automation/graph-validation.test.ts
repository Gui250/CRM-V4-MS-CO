import { describe, expect, it, vi } from 'vitest'
import { type FlowGraph, flowGraphSchema } from './graph-schema.js'
import { validateForActivation } from './graph-validation.js'

const pos = { x: 0, y: 0 }
const AGENT_ID = '0b9a3a8e-8d6f-4b1e-9d3a-2f0c6d0e1a11'

const graph = (nodes: object[], edges: object[]): FlowGraph => flowGraphSchema.parse({ nodes, edges })
const trigger = { id: 't', type: 'trigger.message_received', position: pos, config: { match: 'any' } }
const text = (id: string) => ({ id, type: 'send_text', position: pos, config: { text: 'oi' } })
const edge = (id: string, source: string, sourceHandle: string, target: string) => ({ id, source, sourceHandle, target })

const lookups = (agent: { isActive: boolean } | null = { isActive: true }, mediaExists = true) => ({
  findAgent: vi.fn().mockResolvedValue(agent),
  mediaExists: vi.fn().mockResolvedValue(mediaExists),
})

describe('validateForActivation', () => {
  it('accepts a connected flow whose last output dangles into the end of the run', async () => {
    const g = graph([trigger, text('a'), { id: 'z', type: 'end', position: pos, config: {} }], [
      edge('e1', 't', 'next', 'a'),
      edge('e2', 'a', 'next', 'z'),
    ])
    expect(await validateForActivation(g, lookups())).toEqual([])
  })

  it('requires a trigger', async () => {
    const issues = await validateForActivation(graph([text('a')], []), lookups())
    expect(issues).toContainEqual({ message: 'Adicione um gatilho para o fluxo começar.' })
  })

  it('allows only one trigger', async () => {
    const second = { ...trigger, id: 't2', type: 'trigger.manual', config: {} }
    const issues = await validateForActivation(graph([trigger, second], []), lookups())
    expect(issues).toContainEqual({ nodeId: 't2', message: 'O fluxo só pode ter um gatilho.' })
  })

  it('flags blocks not reachable from the trigger', async () => {
    const g = graph([trigger, text('a'), text('lost')], [edge('e1', 't', 'next', 'a')])
    const issues = await validateForActivation(g, lookups())
    expect(issues).toContainEqual({ nodeId: 'lost', message: 'Bloco desconectado: ligue-o ao fluxo ou remova.' })
  })

  it('requires the trigger to be connected', async () => {
    const issues = await validateForActivation(graph([trigger], []), lookups())
    expect(issues).toContainEqual({ nodeId: 't', message: 'Conecte o gatilho ao primeiro bloco do fluxo.' })
  })

  it('lets branch outputs dangle: an unconnected output ends the run', async () => {
    const condition = { id: 'c', type: 'condition', position: pos, config: { source: 'last_message', operator: 'contains', value: 'preço' } }
    const g = graph([trigger, condition, text('a')], [edge('e1', 't', 'next', 'c'), edge('e2', 'c', 'yes', 'a')])
    expect(await validateForActivation(g, lookups())).toEqual([])
  })

  it('rejects two edges on the same output', async () => {
    const g = graph([trigger, text('a'), text('b')], [edge('e1', 't', 'next', 'a'), edge('e2', 't', 'next', 'b')])
    const issues = await validateForActivation(g, lookups())
    expect(issues).toContainEqual({ nodeId: 't', edgeId: 'e2', message: 'Cada saída pode ter só uma conexão.' })
  })

  it('rejects missing or inactive agents', async () => {
    const agent = { id: 'ag', type: 'ai_agent', position: pos, config: { agentId: AGENT_ID } }
    const g = graph([trigger, agent, text('a')], [edge('e1', 't', 'next', 'ag'), edge('e2', 'ag', 'completed', 'a')])
    expect(await validateForActivation(g, lookups(null))).toContainEqual({ nodeId: 'ag', message: 'O agente escolhido não existe mais.' })
    expect(await validateForActivation(g, lookups({ isActive: false }))).toContainEqual({
      nodeId: 'ag',
      message: 'O agente escolhido está desativado.',
    })
  })

  it('rejects media that is no longer in storage', async () => {
    const media = {
      id: 'm',
      type: 'send_media',
      position: pos,
      config: { mediaPath: 'automation/abc/tabela.pdf', mime: 'application/pdf', filename: 'tabela.pdf' },
    }
    const g = graph([trigger, media], [edge('e1', 't', 'next', 'm')])
    const issues = await validateForActivation(g, lookups({ isActive: true }, false))
    expect(issues).toEqual([{ nodeId: 'm', message: 'O arquivo deste bloco não foi encontrado. Envie de novo.' }])
  })
})
