import { useCallback, useEffect, useState } from 'react'
import { useSimulate } from '../../lib/queries/channels'
import { USSD_LIMIT } from './journeyModel'

// Runs a journey for real through POST /api/channels/simulate/ (the saved steps, published or not); no
// provider needed. onEvent reports every screen and answer for the 3.32 test log.

export function useSimulatorRun({ journeyId, channel, asRegistered, onEvent }) {
  const simulate = useSimulate()
  const [run, setRun] = useState(null)
  const [chat, setChat] = useState([])

  const reset = useCallback(() => { setRun(null); setChat([]) }, [])
  useEffect(() => { reset() }, [journeyId, channel, asRegistered, reset])

  const send = useCallback(async (body, shownAnswer) => {
    try {
      const answer = await simulate.mutateAsync({ journey: journeyId, channel, version: 'draft', ...body })
      if (shownAnswer !== undefined) onEvent?.({ channel, kind: 'answer', text: shownAnswer, node: run?.screen })
      setRun(answer)
      setChat((c) => [...c, ...(shownAnswer !== undefined ? [{ from: 'person', text: shownAnswer }] : []), { from: 'bot', screen: answer.screen }])
      onEvent?.({ channel, kind: 'screen', screen: answer.screen, draft: answer.draft, handedOver: !!answer.conversation_id })
    } catch {
      // shown from simulate.isError
    }
  }, [channel, journeyId, onEvent, run?.screen, simulate])

  const start = useCallback(() => {
    reset()
    send({ restart: !!run, session_id: run?.session_id ?? null, as_registered: asRegistered })
  }, [asRegistered, reset, run, send])

  const answer = useCallback((value, label) => {
    if (!run || run.screen.end || simulate.isPending) return
    send({ session_id: run.session_id, input: value }, label ?? value)
  }, [run, send, simulate.isPending])

  // A pretend file for an "Ask for a file" step: nothing is uploaded (POST /simulate/ attachment).
  const sendFile = useCallback((label) => {
    if (!run || run.screen.end || simulate.isPending) return
    send({ session_id: run.session_id, attachment: { name: 'idea.pdf', content_type: 'application/pdf', size: 120000 } }, label)
  }, [run, send, simulate.isPending])

  return { run, chat, start, answer, sendFile, reset, pending: simulate.isPending, failed: simulate.isError }
}

export function overLimit(screen) {
  return screen?.characters !== undefined && screen.characters > USSD_LIMIT
}
