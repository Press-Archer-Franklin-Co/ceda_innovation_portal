import { useEffect, useState } from 'react'
import { Handshake } from 'lucide-react'
import Button from '../ui/Button'
import Card from '../ui/Card'
import Tag from '../ui/Tag'
import { useI18n } from '../../i18n'
import { assistantService, type MyIntroduction } from '../../services/assistant.service'

/**
 * C3: introductions an officer suggested. Shown only when there is at least one; the other
 * person's name and contact appear only after both innovators said yes (the API decides).
 */
export default function MyIntroductions() {
  const { t } = useI18n()
  const [items, setItems] = useState<MyIntroduction[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    assistantService
      .myIntroductions()
      .then((list) => alive && setItems(list))
      .catch(() => alive && setItems(null)) // optional card: nothing to say when it fails
    return () => {
      alive = false
    }
  }, [])

  const shown = (items ?? []).filter((item) => item.status !== 'declined')
  if (shown.length === 0) return null

  async function answer(id: string, agree: boolean) {
    setBusy(id)
    setError(null)
    try {
      const updated = await assistantService.answerIntroduction(id, agree)
      setItems((prev) => (prev ?? []).map((item) => (item.id === id ? updated : item)))
    } catch {
      setError(id)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card padding="md" className="flex flex-col gap-4 lg:col-span-2">
      <div>
        <h2 className="flex items-center gap-2 font-heading text-d-h4 text-text">
          <Handshake size={20} aria-hidden className="text-accent" />
          {t('ai.intro.title')}
        </h2>
        <p className="mt-1 text-d-body-s text-muted">{t('ai.intro.body')}</p>
      </div>
      <ul className="flex flex-col gap-3">
        {shown.map((item) => (
          <li key={item.id} className="flex flex-col gap-2 rounded-control border border-border p-4">
            <p className="text-d-label text-text">{t('ai.intro.yourIdea', { title: item.my_idea.title })}</p>
            {item.reason && <p className="text-d-body-s text-text">{item.reason}</p>}
            {item.status === 'agreed' && item.other ? (
              <>
                <Tag tone="green" className="self-start">{t('ai.intro.agreed')}</Tag>
                <p className="text-d-body-s text-text">
                  {t('ai.intro.contact', { name: item.other.name || item.other.idea_title, contact: [item.other.email, item.other.phone].filter(Boolean).join(', ') })}
                </p>
              </>
            ) : item.my_answer === 'yes' ? (
              <Tag tone="blue" className="self-start">{t('ai.intro.waiting')}</Tag>
            ) : (
              <div className="flex flex-wrap gap-3">
                <Button size="sm" onClick={() => answer(item.id, true)} loading={busy === item.id}>{t('ai.intro.yes')}</Button>
                <Button size="sm" variant="ghost" onClick={() => answer(item.id, false)} disabled={busy === item.id}>{t('ai.intro.no')}</Button>
              </div>
            )}
            {error === item.id && <p role="alert" className="text-d-cap text-danger">{t('ai.intro.error')}</p>}
          </li>
        ))}
      </ul>
    </Card>
  )
}
