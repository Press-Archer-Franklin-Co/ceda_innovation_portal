import { useCallback, useEffect, useMemo, useState } from 'react'
import { useToast } from '../ui/toast'
import { useConfirm } from '../ui/confirm'
import { useJourney, useNodeTypes, usePublishJourney, useSaveNodes, useValidateJourney } from '../../lib/queries/channels'
import { useI18n } from '../../i18n/context'
import { connect, fromJourney, newNode, pick, portsOf, toPayload, typeMap, unlinkTarget } from './journeyModel'

function snapshot(nodes, start) {
  return JSON.stringify({ n: toPayload(nodes), s: start })
}

/**
 * Editing state shared by the USSD (3.31) and WhatsApp (3.31b) builders: the journey's steps are
 * edited locally, then saved with one PUT. Check and Publish save first.
 */
export function useJourneyEditor(id) {
  const { t, lang } = useI18n()
  const toast = useToast()
  const confirm = useConfirm()
  const journeyQuery = useJourney(id)
  const typesQuery = useNodeTypes()
  const saveNodes = useSaveNodes()
  const validate = useValidateJourney()
  const publish = usePublishJourney()
  const journey = journeyQuery.data
  const types = useMemo(() => typeMap(typesQuery.data), [typesQuery.data])

  const [nodes, setNodes] = useState([])
  const [startKey, setStartKey] = useState('')
  const [baseline, setBaseline] = useState('')
  const [selected, setSelected] = useState(null)
  const [problems, setProblems] = useState(null)

  useEffect(() => {
    if (!journey) return
    const list = fromJourney(journey)
    setNodes(list)
    setStartKey(journey.start_key || '')
    setBaseline(snapshot(list, journey.start_key || ''))
    setProblems(null)
    setSelected((key) => (list.some((n) => n.key === key) ? key : journey.start_key || list[0]?.key || null))
    // Reload only when another journey opens or the server copy changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journey?.id, journey?.updated_at])

  const dirty = journey ? snapshot(nodes, startKey) !== baseline : false

  useEffect(() => {
    if (!dirty) return undefined
    const warn = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const problemsByNode = useMemo(() => {
    const map = {}
    for (const p of problems ?? []) if (p.node) (map[p.node] = map[p.node] ?? []).push(p)
    return map
  }, [problems])

  const updateNode = useCallback((next) => setNodes((list) => list.map((n) => (n.key === next.key ? next : n))), [])

  /** Add a step; when `from` is { key, port }, that port now leads to it. */
  const addNode = useCallback((type, from) => {
    const created = newNode(type, nodes, types)
    const linked = from ? nodes.map((n) => (n.key === from.key ? connect(n, from.port, created.key) : n)) : nodes
    setNodes([...linked, created])
    if (!startKey) setStartKey(created.key)
    setSelected(created.key)
    return created
  }, [nodes, startKey, types])

  /** Put a new step on a branch: the branch now leads to it, and it leads on to where the branch went. */
  const addOnBranch = useCallback((type, from) => {
    const created = newNode(type, nodes, types)
    const source = nodes.find((n) => n.key === from?.key)
    const port = source ? portsOf(source, types).find((p) => p.id === from.port) : null
    const onward = port?.target || ''
    if (onward && portsOf(created, types).some((p) => p.id === 'next')) created.next = onward
    const linked = source ? nodes.map((n) => (n.key === source.key ? connect(n, from.port, created.key) : n)) : nodes
    setNodes([...linked, created])
    if (!startKey) setStartKey(created.key)
    setSelected(created.key)
    return created
  }, [nodes, startKey, types])

  const removeNode = useCallback(async (node, { stranded = 0 } = {}) => {
    const name = node.title || pick(node.text, lang) || pick({ en: types[node.type]?.label, tn: types[node.type]?.label_tn }, lang)
    const body = stranded ? t('ch.flow.deleteStranded', { count: stranded }) : t('ch.builder.deleteBody')
    const ok = await confirm({ title: t('ch.builder.deleteTitle', { name }), body, confirmLabel: t('ch.step.delete') })
    if (!ok) return
    setNodes((list) => list.filter((n) => n.key !== node.key).map((n) => unlinkTarget(n, node.key, types)))
    setStartKey((key) => (key === node.key ? '' : key))
    setSelected(null)
  }, [confirm, lang, t, types])

  const save = useCallback(async ({ quiet = false } = {}) => {
    try {
      const saved = await saveNodes.mutateAsync({ id, body: { nodes: toPayload(nodes), start_key: startKey } })
      setBaseline(snapshot(fromJourney(saved), saved.start_key || ''))
      if (!quiet) toast.show({ title: t('ch.builder.saved'), tone: 'success' })
      return true
    } catch (error) {
      toast.show({ title: t('ch.builder.saveFailed'), body: error.message, tone: 'error' })
      return false
    }
  }, [id, nodes, saveNodes, startKey, t, toast])

  const check = useCallback(async () => {
    if (dirty && !(await save({ quiet: true }))) return
    try {
      const result = await validate.mutateAsync(id)
      setProblems(result.problems)
      const errors = result.problems.filter((p) => p.level === 'error').length
      toast.show({ title: errors ? t('ch.builder.checkProblems', { count: errors }) : t('ch.builder.checkOk'), tone: errors ? 'warning' : 'success' })
    } catch (error) {
      toast.show({ title: t('ch.builder.checkFailed'), body: error.message, tone: 'error' })
    }
  }, [dirty, id, save, t, toast, validate])

  const doPublish = useCallback(async () => {
    if (dirty && !(await save({ quiet: true }))) return
    try {
      const version = await publish.mutateAsync(id)
      setProblems(version.warnings ?? [])
      toast.show({ title: t('ch.builder.published', { version: version.number }), body: t('ch.builder.publishedBody'), tone: 'success' })
    } catch (error) {
      const list = error.data?.errors?.problems
      if (list) {
        setProblems(list)
        toast.show({ title: t('ch.builder.publishRefused'), body: t('ch.builder.publishRefusedBody'), tone: 'warning' })
      } else {
        toast.show({ title: t('ch.builder.publishFailed'), body: error.message, tone: 'error' })
      }
    }
  }, [dirty, id, publish, save, t, toast])

  return {
    journey, journeyQuery, typesQuery, types,
    nodes, setNodes, startKey, setStartKey, selected, setSelected,
    selectedNode: nodes.find((n) => n.key === selected) ?? null,
    dirty, problems, problemsByNode,
    updateNode, addNode, addOnBranch, removeNode, save, check, publish: doPublish,
    saving: saveNodes.isPending, checking: validate.isPending, publishing: publish.isPending,
  }
}
