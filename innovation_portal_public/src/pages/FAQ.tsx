import { useState, useEffect } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { faqsService } from '../services/faqs.service'
import type { ApiFAQ } from '../types/api'
import { parseApiError } from '../utils/apiError'
import clsx from 'clsx'
import StandardHero from '../components/ui/StandardHero'
import AskHelper from '../components/assistant/AskHelper'

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={clsx('border rounded-2xl overflow-hidden transition-all', open ? 'border-[#A01E0A]/20 shadow-sm' : 'border-gray-100')}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-4 p-5 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="font-semibold text-gray-900 text-sm leading-relaxed">{question}</span>
        <ChevronDown size={17} className={clsx('shrink-0 text-[#A01E0A] transition-transform duration-300', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="px-5 pb-5 pt-3 bg-gray-50/60 border-t border-gray-100">
          <p className="text-gray-600 text-sm leading-relaxed">{answer}</p>
        </div>
      )}
    </div>
  )
}

export default function FAQ() {
  const [faqs,           setFaqs]           = useState<ApiFAQ[]>([])
  const [loading,        setLoading]        = useState(true)
  const [apiError,       setApiError]       = useState('')
  const [search,         setSearch]         = useState('')
  const [activeCategory, setActiveCategory] = useState('All')

  useEffect(() => {
    faqsService.getPublic()
      .then(data => setFaqs(data.sort((a, b) => (a.ordering ?? 0) - (b.ordering ?? 0))))
      .catch(err => setApiError(parseApiError(err)))
      .finally(() => setLoading(false))
  }, [])

  const faqCategories = ['All']

  const filtered = faqs.filter((f) => {
    const q = search.toLowerCase()
    return !q || f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q)
  })

  return (
    <div className="bg-white">
      <StandardHero
        eyebrow="Help Center"
        title="Frequently Asked Questions"
        subtitle="Find answers to common questions about the CEDA Innovation Portal."
        image={{ src: '/pages/faq.png' }}
        actions={
          <div className="relative max-w-lg">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search questions..."
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/10 text-white placeholder-white/40 border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/30 text-sm"
            />
          </div>
        }
      />

      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-6 pb-16">
        <AskHelper className="mb-8" />
        {faqCategories.length > 1 && (
          <div className="flex flex-wrap gap-2 mb-8">
            {faqCategories.map((cat) => (
              <button key={cat} onClick={() => setActiveCategory(cat)}
                className={clsx('px-4 py-1.5 rounded-full text-sm font-medium transition-colors',
                  activeCategory === cat ? 'text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                )}
                style={activeCategory === cat ? { background: '#A01E0A' } : {}}
              >{cat}</button>
            ))}
          </div>
        )}

        {loading && (
          <div className="space-y-3">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="rounded-2xl border border-gray-100 p-5 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4" />
              </div>
            ))}
          </div>
        )}

        {apiError && (
          <div className="text-center py-16 text-gray-400">{apiError}</div>
        )}

        {!loading && !apiError && filtered.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            {faqs.length === 0 ? 'No FAQs available yet.' : 'No results found — try a different search term.'}
          </div>
        )}

        {!loading && !apiError && filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map((faq) => (
              <FAQItem key={faq.id} question={faq.question} answer={faq.answer} />
            ))}
          </div>
        )}

        <div className="relative mt-12 rounded-3xl px-8 py-8 text-center overflow-hidden" style={{ background: 'linear-gradient(125deg, #2E1E18 0%, #5A3C32 55%, #6B4A3E 100%)' }}>
          <div className="absolute inset-0 opacity-[0.5]" style={{ backgroundImage: 'radial-gradient(circle, rgba(148,163,184,0.9) 1px, transparent 1px)', backgroundSize: '26px 26px' }} />
          <div className="relative z-10">
            <h3 className="font-bold text-white text-xl mb-2">Still have questions?</h3>
            <p className="text-white/70 text-sm mb-6">Our team is ready to help.</p>
            <a href="mailto:innovation@ceda.co.bw" className="btn-white inline-flex">Contact Us</a>
          </div>
        </div>
      </section>
    </div>
  )
}
