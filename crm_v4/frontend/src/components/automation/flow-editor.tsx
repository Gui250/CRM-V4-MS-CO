'use client'

import { useQueryClient } from '@tanstack/react-query'
import {
  Background,
  type Connection,
  Controls,
  type EdgeChange,
  type NodeChange,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
} from '@xyflow/react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Flow, FlowNode, GraphIssue, NodeType } from '@/lib/automation-types'
import { activateFlow, issuesByNode, saveFlowGraph } from '@/lib/flow-issues'
import { automationKeys, useDeactivateFlow } from '@/lib/use-automation'
import { ErrorAlert, errorMessage } from './error-alert'
import { STATUS_LABELS } from './flow-list'
import { canConnect, type EditorNode, fromReactFlow, isTriggerType, newEdge, newNode, toReactFlow } from './graph-convert'
import { NodeConfigPanel } from './node-config-panel'
import { NODE_LABELS } from './node-defaults'
import { nodeTypes } from './node-types'

const UNSAVED_MESSAGE = 'Há alterações não salvas. Sair mesmo assim?'
const NEW_NODE_X = 80
const NEW_NODE_Y_STEP = 140
const PALETTE: NodeType[] = Object.keys(NODE_LABELS) as NodeType[]

/** Selection and measurement changes never dirty the graph; everything else does. */
const isEdit = (change: NodeChange | EdgeChange) => change.type !== 'select' && change.type !== 'dimensions'

export function FlowEditor(props: { flow: Flow; readOnly?: boolean }) {
  return (
    <ReactFlowProvider>
      <Editor {...props} />
    </ReactFlowProvider>
  )
}

function Editor({ flow, readOnly = false }: { flow: Flow; readOnly?: boolean }) {
  const queryClient = useQueryClient()
  const [current, setCurrent] = useState(flow)
  const [initial] = useState(() => toReactFlow(flow.graph))
  const [nodes, setNodes, onNodesChange] = useNodesState<EditorNode>(initial.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const deactivate = useDeactivateFlow()

  const selected = nodes.find((n) => n.selected)
  const hasTrigger = nodes.some((n) => isTriggerType(n.type))

  useEffect(() => setCurrent(flow), [flow])

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function touch() {
    setDirty(true)
    setNotice(null)
  }

  function addNode(type: NodeType) {
    const node = newNode(type, { x: NEW_NODE_X, y: NEW_NODE_X + nodes.length * NEW_NODE_Y_STEP })
    setNodes((current) => [...current.map((n) => ({ ...n, selected: false })), node])
    touch()
  }

  function removeSelected() {
    if (!selected) return
    setNodes((current) => current.filter((n) => n.id !== selected.id))
    setEdges((current) => current.filter((e) => e.source !== selected.id && e.target !== selected.id))
    touch()
  }

  function updateConfig(config: FlowNode['config']) {
    if (!selected) return
    setNodes((current) => current.map((n) => (n.id === selected.id ? { ...n, data: { ...n.data, config } } : n)))
    touch()
  }

  function connect(connection: Connection) {
    if (!canConnect(connection, nodes, edges)) return
    setEdges((current) => [...current, newEdge(connection)])
    touch()
  }

  function applyIssues(issues: GraphIssue[], message: string) {
    const byNode = issuesByNode(issues)
    setNodes((current) => current.map((n) => ({ ...n, data: { ...n.data, issues: byNode.get(n.id) ?? [] } })))
    setError([message, ...(byNode.get('') ?? [])].join(' '))
  }

  function accept(saved: Flow) {
    setCurrent(saved)
    queryClient.setQueryData(automationKeys.flow(saved.id), saved)
    void queryClient.invalidateQueries({ queryKey: ['flows'] })
    setNodes((current) => current.map((n) => ({ ...n, data: { ...n.data, issues: [] } })))
    setDirty(false)
  }

  /** Returns false when the server rejected the graph (issues already shown). */
  async function persist() {
    const result = await saveFlowGraph(flow.id, fromReactFlow(nodes, edges))
    if (!result.ok) {
      applyIssues(result.issues, result.message)
      return false
    }
    accept(result.flow)
    return true
  }

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await action()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const save = () =>
    run(async () => {
      if (await persist()) setNotice('Fluxo salvo.')
    })

  const activate = () =>
    run(async () => {
      if (dirty && !(await persist())) return
      const result = await activateFlow(flow.id)
      if (!result.ok) return applyIssues(result.issues, result.message)
      accept(result.flow)
      setNotice('Fluxo ativado.')
    })

  const deactivateFlow = () =>
    run(async () => {
      const saved = await deactivate.mutateAsync(flow.id)
      if (saved) setCurrent(saved)
      setNotice('Fluxo desativado.')
    })

  function guardLeave(event: React.MouseEvent) {
    if (dirty && !window.confirm(UNSAVED_MESSAGE)) event.preventDefault()
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
        <Link href="/automacoes" onClick={guardLeave} className="text-sm font-semibold underline">
          ← Automações
        </Link>
        <h1 className="font-display text-xl font-extrabold uppercase">{flow.name}</h1>
        <Badge tone={current.status === 'active' ? 'brand' : 'neutral'}>{STATUS_LABELS[current.status]}</Badge>
        {current.versionNumber !== null && <span className="text-xs text-muted">v{current.versionNumber}</span>}
        <Link href={`/automacoes/${flow.id}/execucoes`} onClick={guardLeave} className="text-sm font-semibold underline">
          Execuções
        </Link>
        <div className="ml-auto flex items-center gap-2">
          {notice && <span className="text-sm text-muted">{notice}</span>}
          {!readOnly && (
            <Button variant="secondary" onClick={save} disabled={busy || !dirty}>
              Salvar
            </Button>
          )}
          {current.status === 'active' ? (
            <Button variant="danger" onClick={deactivateFlow} disabled={busy}>
              Desativar
            </Button>
          ) : (
            <Button onClick={activate} disabled={busy}>
              Ativar
            </Button>
          )}
        </div>
      </header>
      <div className="px-5 pt-3">
        <ErrorAlert message={error} />
        {readOnly && <p className="text-sm text-muted">A edição exige uma tela maior; aqui você pode ver, ativar e desativar o fluxo.</p>}
      </div>
      <div className="flex min-h-0 flex-1">
        {!readOnly && (
          <aside aria-label="Blocos" className="flex w-44 shrink-0 flex-col gap-1 overflow-y-auto border-r border-line p-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted">Blocos</p>
            {PALETTE.map((type) => (
              <button
                key={type}
                type="button"
                aria-label={`Adicionar ${NODE_LABELS[type]}`}
                disabled={isTriggerType(type) && hasTrigger}
                onClick={() => addNode(type)}
                className="border border-ink/30 px-2 py-1.5 text-left text-sm hover:bg-mist disabled:opacity-40"
              >
                + {NODE_LABELS[type]}
              </button>
            ))}
          </aside>
        )}
        <div className="relative min-w-0 flex-1">
          {nodes.length === 0 && (
            <p className="absolute inset-x-0 top-6 z-10 text-center text-sm text-muted">Fluxo vazio: adicione um gatilho pela paleta.</p>
          )}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={(changes) => {
              onNodesChange(changes)
              if (changes.some(isEdit)) touch()
            }}
            onEdgesChange={(changes) => {
              onEdgesChange(changes)
              if (changes.some(isEdit)) touch()
            }}
            onConnect={connect}
            isValidConnection={(c) => canConnect(c, nodes, edges)}
            nodesDraggable={!readOnly}
            nodesConnectable={!readOnly}
            elementsSelectable={!readOnly}
            deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        {selected && !readOnly && (
          <aside className="w-80 shrink-0 overflow-y-auto border-l border-line">
            <NodeConfigPanel
              node={{ id: selected.id, type: selected.type, position: selected.position, config: selected.data.config } as FlowNode}
              issues={selected.data.issues}
              onChange={updateConfig}
            />
            <div className="px-4 pb-4">
              <Button variant="danger" onClick={removeSelected}>
                Remover bloco
              </Button>
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
