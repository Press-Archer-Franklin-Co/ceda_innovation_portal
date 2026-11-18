import { useState } from 'react'
import { CheckCircle2, ChevronRight } from 'lucide-react'
import Button from '../components/ui/Button'
import { supportService } from '../services/support.service'
import { parseApiError }  from '../utils/apiError'

const categories = [
  'Product or Service Improvement',
  'New Challenge or Hackathon Idea',
  'Platform Feature Request',
  'Partnership Opportunity',
  'Process or Policy Improvement',
  'Other',
]

const steps = ['Your Details', 'Suggestion', 'Review & Submit']

export default function Suggestions() {
  const [step,      setStep]      = useState(0)
  const [submitted, setSubmitted] = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [form, setForm] = useState({
    name: '', email: '', organization: '',
    category: '', title: '', description: '', impact: '', anonymous: false,
  })

  const up = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    setLoading(true)
    setError('')
    try {
      await supportService.submitRequest({
        subject:      form.title,
        description:  form.impact ? `${form.description}\n\nExpected Impact: ${form.impact}` : form.description,
        email:        form.anonymous ? 'anonymous@placeholder.ceda' : form.email,
        request_type: form.category || undefined,
        phone_number: undefined,
      })
      setSubmitted(true)
    } catch (err) {
      setError(parseApiError(err))
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: '#A01E0A' }}>
            <CheckCircle2 size={32} className="text-white" />
          </div>
          <h2 className="text-2xl font-extrabold text-gray-900 mb-3">Suggestion Submitted!</h2>
          <p className="text-gray-500 text-sm mb-6 leading-relaxed">
            Thank you — our team reviews all submissions and will follow up if needed. Your feedback shapes CEDA's innovation journey.
          </p>
          <button
            onClick={() => { setSubmitted(false); setStep(0); setError(''); setForm({ name: '', email: '', organization: '', category: '', title: '', description: '', impact: '', anonymous: false }) }}
            className="btn-white px-6 py-2.5"
            style={{ background: '#A01E0A', borderColor: '#A01E0A' }}
          >
            Submit Another
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white">
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="relative rounded-3xl px-10 py-12 overflow-hidden" style={{ background: 'linear-gradient(125deg, #2E1E18 0%, #5A3C32 55%, #6B4A3E 100%)' }}>
          <div className="absolute inset-0 opacity-[0.5]" style={{ backgroundImage: 'radial-gradient(circle, rgba(148,163,184,0.9) 1px, transparent 1px)', backgroundSize: '26px 26px' }} />
          <div className="relative z-10">
            <p className="eyebrow-white mb-3">Feedback Xchange</p>
            <h1 className="text-4xl font-extrabold text-white mb-4">Suggestions &amp; Improvements</h1>
            <p className="text-white/70 text-sm max-w-lg">
              Help CEDA build better programmes and services for entrepreneurs. Share your ideas and recommendations directly with our innovation team.
            </p>
          </div>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-8 pb-16">
        <div className="flex items-center mb-8">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center flex-1">
              <div className="flex flex-col items-center gap-1">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors"
                  style={i <= step ? { background: '#A01E0A', color: 'white' } : { background: '#f3f4f6', color: '#9ca3af' }}
                >
                  {i < step ? '✓' : i + 1}
                </div>
                <span className="text-xs font-medium hidden sm:block" style={{ color: i <= step ? '#A01E0A' : '#9ca3af' }}>{s}</span>
              </div>
              {i < steps.length - 1 && (
                <div className="flex-1 h-px mx-2 mb-5 transition-colors" style={{ background: i < step ? '#A01E0A' : '#e5e7eb' }} />
              )}
            </div>
          ))}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm mb-5">{error}</div>
        )}

        <div className="rounded-2xl border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.06)] p-6">
          {step === 0 && (
            <div className="space-y-4">
              <h3 className="font-bold text-gray-900 text-base mb-4">Your Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name <span className="text-red-500">*</span></label>
                  <input className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#A01E0A]/30" placeholder="Kagiso Molefe" value={form.name} onChange={e => up('name', e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Email <span className="text-red-500">*</span></label>
                  <input type="email" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#A01E0A]/30" placeholder="kagiso@example.com" value={form.email} onChange={e => up('email', e.target.value)} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Organization</label>
                <input className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#A01E0A]/30" placeholder="Company / University" value={form.organization} onChange={e => up('organization', e.target.value)} />
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={form.anonymous} onChange={e => up('anonymous', e.target.checked)} className="w-4 h-4 rounded accent-[#A01E0A]" />
                <span className="text-sm text-gray-600">Submit anonymously</span>
              </label>
              <div className="flex justify-end pt-2">
                <Button onClick={() => setStep(1)} disabled={!form.name || !form.email}>
                  Continue <ChevronRight size={15} />
                </Button>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <h3 className="font-bold text-gray-900 text-base mb-4">Your Suggestion</h3>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Category <span className="text-red-500">*</span></label>
                <select className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#A01E0A]/30" value={form.category} onChange={e => up('category', e.target.value)}>
                  <option value="">Select a category...</option>
                  {categories.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Title <span className="text-red-500">*</span></label>
                <input className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#A01E0A]/30" placeholder="Brief title for your suggestion" value={form.title} onChange={e => up('title', e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Description <span className="text-red-500">*</span></label>
                <textarea rows={4} className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#A01E0A]/30 resize-none" placeholder="Describe your suggestion in detail..." value={form.description} onChange={e => up('description', e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Expected Impact</label>
                <textarea rows={3} className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#A01E0A]/30 resize-none" placeholder="What impact do you expect?" value={form.impact} onChange={e => up('impact', e.target.value)} />
              </div>
              <div className="flex justify-between pt-2">
                <Button variant="ghost" onClick={() => setStep(0)}>Back</Button>
                <Button onClick={() => setStep(2)} disabled={!form.category || !form.title || !form.description}>
                  Review <ChevronRight size={15} />
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h3 className="font-bold text-gray-900 text-base mb-5">Review Submission</h3>
              <div className="space-y-3 mb-6">
                {[
                  { label: 'Name',        value: form.anonymous ? 'Anonymous' : form.name },
                  { label: 'Email',       value: form.email },
                  { label: 'Category',    value: form.category },
                  { label: 'Title',       value: form.title },
                  { label: 'Description', value: form.description },
                  { label: 'Impact',      value: form.impact || '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="flex flex-col sm:flex-row sm:items-start gap-1 py-2.5 border-b border-gray-100 last:border-0">
                    <span className="text-xs font-semibold text-gray-500 w-28 shrink-0">{label}</span>
                    <span className="text-sm text-gray-900 flex-1 whitespace-pre-wrap">{value}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
                <Button loading={loading} onClick={handleSubmit}>Submit Suggestion</Button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
