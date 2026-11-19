import React, { useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { Plus, HelpCircle, ChevronUp, ChevronDown, Trash2, Pencil, Eye, EyeOff, ArrowLeft } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import PageHeader from '../../components/ui/PageHeader'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import { SkeletonCards } from '../../components/ui/LoadingSkeleton'
import { support } from '../../lib/api/endpoints'
import { useConfirm } from '../../components/ui/confirm'

export default function FaqList({ embedded = false }) {
  const confirm = useConfirm()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin-faqs'],
    queryFn: () => support.listFaqs().then(r => Array.isArray(r) ? r : (r?.results ?? [])),
  })

  const faqs = data ?? []

  const deleteMut = useMutation({
    mutationFn: (id) => support.deleteFaq(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-faqs'] }),
  })

  const reorderMut = useMutation({
    mutationFn: (items) => support.reorderFaqs(items),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-faqs'] }),
  })

  const toggleMut = useMutation({
    mutationFn: ({ id, is_public }) => support.updateFaq(id, { is_public }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-faqs'] }),
  })

  function move(index, dir) {
    const ordered = [...faqs].sort((a, b) => (a.ordering ?? 0) - (b.ordering ?? 0))
    const swap = index + dir
    if (swap < 0 || swap >= ordered.length) return
    const payload = ordered.map((f, i) => {
      if (i === index) return { id: f.id, ordering: swap + 1 }
      if (i === swap)  return { id: f.id, ordering: index + 1 }
      return { id: f.id, ordering: i + 1 }
    })
    reorderMut.mutate(payload)
  }

  async function handleDelete(id) {
    if (await confirm({ title: 'Delete this question?', body: 'It disappears from the help pages straight away.', confirmLabel: 'Delete question' })) deleteMut.mutate(id)
  }

  const sorted = [...faqs].sort((a, b) => (a.ordering ?? 0) - (b.ordering ?? 0))

  return (
    <div className="space-y-4">
      {!embedded && (
        <PageHeader
          title="FAQ Management"
          subtitle="Create and manage frequently asked questions shown on the public FAQ page"
          icon={<HelpCircle size={20} />}
          actions={
            <button className="btn-primary flex items-center gap-1.5" onClick={() => navigate('/content/faqs/new')}>
              <Plus size={15} />New FAQ
            </button>
          }
        />
      )}

      {isLoading && <SkeletonCards count={5} />}
      {isError && <ErrorState message={error?.message ?? 'Failed to load FAQs'} onRetry={refetch} />}

      {!isLoading && !isError && sorted.length === 0 && (
        <EmptyState
          icon={HelpCircle}
          title="No FAQ items yet"
          message="Add questions and answers to help users find information quickly."
          action={
            <button className="btn-primary flex items-center gap-1.5" onClick={() => navigate('/content/faqs/new')}>
              <Plus size={14} />New FAQ
            </button>
          }
        />
      )}

      {!isLoading && !isError && sorted.length > 0 && (
        <div className="space-y-2">
          {sorted.map((faq, idx) => (
            <div key={faq.id} className="bg-white border border-ceda-border rounded-xl p-4 flex items-start gap-3 shadow-sm">
              <div className="flex flex-col gap-0.5 pt-0.5 shrink-0">
                <button
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0 || reorderMut.isPending}
                  className="p-0.5 rounded text-ceda-muted hover:text-ceda-dark disabled:opacity-30 transition-colors"
                >
                  <ChevronUp size={15} />
                </button>
                <button
                  onClick={() => move(idx, 1)}
                  disabled={idx === sorted.length - 1 || reorderMut.isPending}
                  className="p-0.5 rounded text-ceda-muted hover:text-ceda-dark disabled:opacity-30 transition-colors"
                >
                  <ChevronDown size={15} />
                </button>
              </div>

              <span className="shrink-0 w-6 h-6 rounded-full bg-ceda-surface text-ceda-muted text-[10px] font-bold flex items-center justify-center mt-0.5">
                {idx + 1}
              </span>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-ceda-dark leading-snug">{faq.question}</p>
                <p className="text-xs text-ceda-muted mt-1 line-clamp-2">{faq.answer}</p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  title={faq.is_public ? 'Visible to public — click to hide' : 'Hidden — click to publish'}
                  onClick={() => toggleMut.mutate({ id: faq.id, is_public: !faq.is_public })}
                  disabled={toggleMut.isPending}
                  className={`p-1.5 rounded-lg transition-colors ${faq.is_public ? 'text-ceda-green hover:bg-green-50' : 'text-ceda-muted hover:bg-ceda-surface'}`}
                >
                  {faq.is_public ? <Eye size={15} /> : <EyeOff size={15} />}
                </button>
                <button
                  onClick={() => navigate(`/content/faqs/${faq.id}`)}
                  className="p-1.5 rounded-lg text-ceda-muted hover:text-ceda-dark hover:bg-ceda-surface transition-colors"
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={() => handleDelete(faq.id)}
                  disabled={deleteMut.isPending}
                  className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && !isError && sorted.length > 0 && (
        <p className="text-xs text-ceda-muted text-center">
          {sorted.filter(f => f.is_public).length} of {sorted.length} FAQ{sorted.length !== 1 ? 's' : ''} visible to the public
        </p>
      )}
    </div>
  )
}

export function FaqEditor() {
  const { id } = useParams()
  const isNew = !id || id === 'new'
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [question, setQuestion] = useState('')
  const [answer,   setAnswer]   = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [error,    setError]    = useState('')
  const [loaded,   setLoaded]   = useState(isNew)

  useQuery({
    queryKey: ['admin-faq', id],
    queryFn: () => support.getFaq(id).then(r => {
      setQuestion(r.question ?? '')
      setAnswer(r.answer ?? '')
      setIsPublic(!!r.is_public)
      setLoaded(true)
      return r
    }),
    enabled: !isNew,
  })

  const saveMut = useMutation({
    mutationFn: (body) => isNew
      ? support.createFaq(body)
      : support.updateFaq(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-faqs'] })
      navigate('/content?tab=faqs')
    },
    onError: (err) => {
      const d = err?.data
      setError(d?.detail ?? d?.question?.[0] ?? d?.answer?.[0] ?? err?.message ?? 'Save failed.')
    },
  })

  function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!question.trim()) { setError('Question is required.'); return }
    if (!answer.trim())   { setError('Answer is required.');   return }
    saveMut.mutate({ question: question.trim(), answer: answer.trim(), is_public: isPublic })
  }

  if (!loaded) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4 max-w-2xl">
          <div className="h-6 bg-ceda-surface rounded w-1/3" />
          <div className="h-10 bg-ceda-surface rounded" />
          <div className="h-32 bg-ceda-surface rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl">
      <PageHeader
        title={isNew ? 'New FAQ' : 'Edit FAQ'}
        subtitle={isNew ? 'Add a new question and answer' : 'Update this FAQ item'}
        icon={<HelpCircle size={20} />}
        back={
          <Link to="/content?tab=faqs" className="inline-flex items-center gap-1 text-xs text-ceda-muted hover:text-ceda-dark transition-colors">
            <ArrowLeft size={13} /> Back to FAQs
          </Link>
        }
      />

      <form onSubmit={handleSubmit} className="mt-6 space-y-5 bg-white border border-ceda-border rounded-xl p-6 shadow-sm">
        <div>
          <label className="block text-xs font-semibold text-ceda-dark mb-1.5">Question <span className="text-red-500">*</span></label>
          <input
            value={question}
            onChange={e => setQuestion(e.target.value)}
            placeholder="e.g. Who can participate in CEDA innovation programs?"
            className="input w-full"
            maxLength={255}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-ceda-dark mb-1.5">Answer <span className="text-red-500">*</span></label>
          <textarea
            value={answer}
            onChange={e => setAnswer(e.target.value)}
            placeholder="Write a clear, helpful answer..."
            rows={6}
            className="input w-full resize-y"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsPublic(!isPublic)}
            className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${isPublic ? 'bg-ceda-green' : 'bg-gray-300'}`}
          >
            <span className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transition-transform ${isPublic ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </button>
          <span className="text-sm text-ceda-dark">{isPublic ? 'Visible to public' : 'Hidden (draft)'}</span>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saveMut.isPending} className="btn-primary">
            {saveMut.isPending ? 'Saving…' : isNew ? 'Create FAQ' : 'Save Changes'}
          </button>
          <button type="button" onClick={() => navigate('/content?tab=faqs')} className="btn-secondary">
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
