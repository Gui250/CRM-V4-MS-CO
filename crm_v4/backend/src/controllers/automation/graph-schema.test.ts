import { describe, expect, it } from 'vitest'
import { durationMs, flowGraphSchema, triggerTypeOf } from './graph-schema.js'

const pos = { x: 0, y: 0 }
const welcome = {
  nodes: [
    { id: 'n1', type: 'trigger.message_received', position: pos, config: { match: 'first_message' } },
    { id: 'n2', type: 'wait', position: pos, config: { amount: 5, unit: 'seconds' } },
    { id: 'n3', type: 'send_text', position: pos, config: { text: 'Olá, {{contato.primeiro_nome}}!' } },
  ],
  edges: [
    { id: 'e1', source: 'n1', sourceHandle: 'next', target: 'n2' },
    { id: 'e2', source: 'n2', sourceHandle: 'next', target: 'n3' },
  ],
}

const withNode = (node: object) => ({ nodes: [node], edges: [] })
const messages = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues.map((i) => i.message) ?? []

describe('flowGraphSchema', () => {
  it('accepts the welcome flow from the contract', () => {
    expect(flowGraphSchema.safeParse(welcome).success).toBe(true)
  })

  it('accepts an empty draft', () => {
    expect(flowGraphSchema.safeParse({ nodes: [], edges: [] }).success).toBe(true)
  })

  it('rejects unknown block types', () => {
    expect(flowGraphSchema.safeParse(withNode({ id: 'x', type: 'http_request', position: pos, config: {} })).success).toBe(false)
  })

  it('rejects invalid ids and duplicated ids', () => {
    expect(flowGraphSchema.safeParse(withNode({ id: 'has space', type: 'end', position: pos, config: {} })).success).toBe(false)
    const dup = { nodes: [welcome.nodes[0], { ...welcome.nodes[1], id: 'n1' }], edges: [] }
    expect(messages(flowGraphSchema.safeParse(dup))).toContain('Identificador repetido: n1.')
  })

  it('requires keywords only for keyword triggers', () => {
    const trigger = (config: object) => withNode({ id: 't', type: 'trigger.message_received', position: pos, config })
    expect(flowGraphSchema.safeParse(trigger({ match: 'keyword', keywords: ['preço'] })).success).toBe(true)
    expect(flowGraphSchema.safeParse(trigger({ match: 'keyword' })).success).toBe(false)
    expect(flowGraphSchema.safeParse(trigger({ match: 'any', keywords: ['x'] })).success).toBe(false)
    expect(flowGraphSchema.safeParse(trigger({ match: 'keyword', keywords: Array(21).fill('a') })).success).toBe(false)
  })

  it('limits text to 4.096 characters', () => {
    const text = (t: string) => withNode({ id: 's', type: 'send_text', position: pos, config: { text: t } })
    expect(flowGraphSchema.safeParse(text('a'.repeat(4096))).success).toBe(true)
    expect(flowGraphSchema.safeParse(text('a'.repeat(4097))).success).toBe(false)
    expect(flowGraphSchema.safeParse(text('   ')).success).toBe(false)
  })

  it('limits waits to 30 days', () => {
    const wait = (amount: number, unit: string) => withNode({ id: 'w', type: 'wait', position: pos, config: { amount, unit } })
    expect(flowGraphSchema.safeParse(wait(30, 'days')).success).toBe(true)
    expect(flowGraphSchema.safeParse(wait(31, 'days')).success).toBe(false)
    expect(flowGraphSchema.safeParse(wait(0, 'seconds')).success).toBe(false)
  })

  it('requires wait_reply timeout between 1 minute and 30 days', () => {
    const reply = (amount: number, unit: string) =>
      withNode({ id: 'r', type: 'wait_reply', position: pos, config: { timeout: { amount, unit } } })
    expect(flowGraphSchema.safeParse(reply(1, 'minutes')).success).toBe(true)
    expect(flowGraphSchema.safeParse(reply(30, 'seconds')).success).toBe(false)
  })

  it('defaults the agent inactivity timeout to 24 hours', () => {
    const agentId = '0b9a3a8e-8d6f-4b1e-9d3a-2f0c6d0e1a11'
    const parsed = flowGraphSchema.parse(withNode({ id: 'a', type: 'ai_agent', position: pos, config: { agentId } }))
    expect(parsed.nodes[0]).toMatchObject({ config: { agentId, inactivityTimeout: { amount: 24, unit: 'hours' } } })
  })

  it('only accepts media stored under automation/', () => {
    const media = (mediaPath: string) =>
      withNode({ id: 'm', type: 'send_media', position: pos, config: { mediaPath, mime: 'application/pdf', filename: 'a.pdf' } })
    expect(flowGraphSchema.safeParse(media('automation/0b9a3a8e/tabela.pdf')).success).toBe(true)
    expect(flowGraphSchema.safeParse(media('media/2026/09/abc')).success).toBe(false)
    expect(flowGraphSchema.safeParse(media('automation/../secret')).success).toBe(false)
  })

  it('rejects edges to missing nodes, wrong outputs and into triggers', () => {
    const base = welcome.nodes
    const edge = (e: object) => ({ nodes: base, edges: [e] })
    expect(flowGraphSchema.safeParse(edge({ id: 'e', source: 'n1', sourceHandle: 'next', target: 'zz' })).success).toBe(false)
    expect(flowGraphSchema.safeParse(edge({ id: 'e', source: 'n1', sourceHandle: 'yes', target: 'n2' })).success).toBe(false)
    expect(flowGraphSchema.safeParse(edge({ id: 'e', source: 'n2', sourceHandle: 'next', target: 'n1' })).success).toBe(false)
  })

  it('caps the graph at 200 nodes', () => {
    const nodes = Array.from({ length: 201 }, (_, i) => ({ id: `n${i}`, type: 'end', position: pos, config: {} }))
    expect(flowGraphSchema.safeParse({ nodes, edges: [] }).success).toBe(false)
  })
})

describe('helpers', () => {
  it('converts durations to milliseconds', () => {
    expect(durationMs({ amount: 2, unit: 'hours' })).toBe(7_200_000)
  })

  it('derives the trigger type', () => {
    expect(triggerTypeOf(flowGraphSchema.parse(welcome))).toBe('message_received')
    expect(triggerTypeOf({ nodes: [], edges: [] })).toBeNull()
  })
})
