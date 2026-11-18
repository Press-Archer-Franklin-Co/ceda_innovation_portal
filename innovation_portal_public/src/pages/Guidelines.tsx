import { CheckCircle2, ChevronRight } from 'lucide-react'

const ideaCategories = [
  { title: 'Technological Innovations', desc: 'New technologies or advancements' },
  { title: 'Process Improvements', desc: 'Enhancements in existing processes to improve efficiency' },
  { title: 'Product Innovations', desc: 'New products or significant improvements to existing products' },
  { title: 'Service Innovations', desc: 'New services or enhancements to current service offerings' },
]

const submissionFormat = [
  { field: 'Title', detail: 'A concise title of your idea.' },
  { field: 'Abstract', detail: 'A brief summary (150–200 words) of your idea.' },
  { field: 'Problem Statement', detail: 'Clearly define the problem your idea addresses.' },
  { field: 'Proposed Solution', detail: 'Describe your innovative idea in detail.' },
  { field: 'Impact', detail: 'Explain the potential impact on CEDA and its stakeholders.' },
  { field: 'Feasibility', detail: 'Provide an initial assessment including required resources.' },
  { field: 'Timeline', detail: 'Outline key milestones and expected timeline for implementation.' },
  { field: 'Business Canvas Model', detail: 'To be addressed in your presentation.' },
  { field: 'Supporting Materials', detail: 'Diagrams, prototypes, or any additional documents.' },
]

const evaluationCriteria = [
  { label: 'Originality', desc: 'How unique and novel is the idea?' },
  { label: 'Impact', desc: 'What is the potential benefit or value to CEDA?' },
  { label: 'Alignment with CEDA Goals', desc: "Does the idea align with CEDA's strategic objectives and values?" },
  { label: 'Feasibility', desc: 'Can the idea be realistically implemented within existing constraints? (Technical, Legal & Regulatory, Operational)' },
  { label: 'Desirability', desc: 'The level of consumer interest and willingness to purchase the product or service, determined by analysing customer needs and market trends.' },
  { label: 'Financial Viability', desc: 'The economic sustainability and profitability of idea; assessing costs, revenue streams, ROI, and financial projections.' },
  { label: 'Scalability', desc: 'Can the idea be scaled up or adapted for broader application?' },
]

const reviewProcess = [
  { step: '01', title: 'Initial Screening', desc: 'The Innovation Committee reviews submissions for completeness and eligibility.' },
  { step: '02', title: 'Evaluation Phase', desc: 'Qualified submissions are evaluated based on the published criteria.' },
  { step: '03', title: 'Feedback', desc: 'Submitters receive feedback within 4–6 weeks of submission.' },
  { step: '04', title: 'Selection', desc: 'Selected ideas are presented to the Executive Committee for potential implementation.' },
]

const tips = [
  'Be clear and concise.',
  'Focus on the problem and the innovative aspect of your solution.',
  'Provide evidence or examples to support your claims.',
  'Highlight the potential impact and benefits.',
  'Consider the feasibility and practical aspects of your idea.',
]

export default function Guidelines() {
  return (
    <div className="bg-white">

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div
          className="relative rounded-3xl overflow-hidden px-10 py-14"
          style={{ background: 'linear-gradient(120deg, #2E1E18 0%, #5A3C32 50%, #6B4A3E 100%)' }}
        >
          <div className="absolute inset-0 opacity-[0.04]" style={{
            backgroundImage: 'radial-gradient(circle, rgba(148,163,184,0.9) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }} />
          <div className="relative z-10 max-w-2xl">
            <p className="text-[11px] font-bold tracking-[0.25em] text-white/50 uppercase mb-3">
              CEDA Innovation
            </p>
            <h1 className="text-4xl sm:text-5xl font-extrabold text-white leading-tight mb-4 tracking-tight">
              Idea Submission<br />
              <span style={{ color: '#F0641E' }}>Guide</span>
            </h1>
            <p className="text-white/70 text-sm leading-relaxed max-w-lg mb-8">
              Welcome to the CEDA Innovation Submission Guide. We believe that innovation is the
              cornerstone of progress and are excited to hear your ideas that can drive technological
              change and enhance organisational agility.
            </p>
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-16 space-y-10">

        <div className="rounded-2xl border border-gray-100 shadow-card p-7">
          <SectionLabel>Eligibility</SectionLabel>
          <ul className="space-y-2 mt-4">
            {['Open to citizen entrepreneurs, CEDA staff, partners, and external collaborators', 'Individual or team submissions are accepted'].map(item => (
              <li key={item} className="flex items-start gap-2.5">
                <CheckCircle2 size={15} className="text-[#F0641E] shrink-0 mt-0.5" />
                <span className="text-sm text-gray-700">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <SectionLabel>Idea Categories</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
            {ideaCategories.map((cat, i) => (
              <div key={cat.title} className="rounded-2xl p-5 border border-gray-100 shadow-card hover:shadow-card-hover transition-shadow">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-sm font-extrabold mb-3"
                  style={{ background: '#A01E0A' }}
                >
                  {String(i + 1).padStart(2, '0')}
                </div>
                <p className="font-bold text-gray-900 text-sm mb-1">{cat.title}</p>
                <p className="text-xs text-gray-500 leading-relaxed">{cat.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <SectionLabel>Submission Format</SectionLabel>
          <div className="mt-4 rounded-2xl border border-gray-100 shadow-card overflow-hidden">
            {submissionFormat.map((item, i) => (
              <div
                key={item.field}
                className={`flex items-start gap-4 px-6 py-4 ${i !== submissionFormat.length - 1 ? 'border-b border-gray-100' : ''}`}
              >
                <ChevronRight size={15} className="text-[#F0641E] shrink-0 mt-0.5" />
                <div className="flex flex-col sm:flex-row sm:items-start sm:gap-3 flex-1">
                  <span className="font-semibold text-sm text-gray-900 w-44 shrink-0">{item.field}</span>
                  <span className="text-sm text-gray-500 leading-relaxed">{item.detail}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div
          className="rounded-3xl px-8 py-8"
          style={{ background: '#A01E0A' }}
        >
          <SectionLabel white>Submission Process</SectionLabel>
          <div className="mt-5 flex flex-col sm:flex-row gap-6">
            {[
              { n: '1', t: 'Register', d: 'Create your free account on the CEDA Innovation Portal at innovation.ceda.co.bw' },
              { n: '2', t: 'Prepare', d: 'Compile your proposal following the submission format above as a single file.' },
              { n: '3', t: 'Submit', d: 'Upload your idea and any supporting materials directly through the portal.' },
            ].map(({ n, t, d }) => (
              <div key={n} className="flex-1 bg-white/10 rounded-2xl p-5">
                <span className="text-3xl font-extrabold text-white/20 block mb-2 leading-none">{n}</span>
                <p className="font-bold text-white text-sm mb-1">{t}</p>
                <p className="text-white/60 text-xs leading-relaxed">{d}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <SectionLabel>Evaluation Criteria</SectionLabel>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {evaluationCriteria.map((c) => (
              <div key={c.label} className="rounded-2xl border border-gray-100 shadow-card p-5 flex items-start gap-3">
                <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: '#F0641E' }} />
                <div>
                  <p className="font-bold text-gray-900 text-sm">{c.label}</p>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">{c.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <SectionLabel>Review Process</SectionLabel>
          <div className="mt-4 relative">
            <div className="absolute left-6 top-8 bottom-8 w-px bg-gray-200 hidden sm:block" />
            <div className="space-y-4">
              {reviewProcess.map((r) => (
                <div key={r.step} className="flex items-start gap-5">
                  <div
                    className="shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-white text-xs font-extrabold z-10"
                    style={{ background: '#A01E0A' }}
                  >
                    {r.step}
                  </div>
                  <div className="flex-1 rounded-2xl border border-gray-100 shadow-card p-5">
                    <p className="font-bold text-gray-900 text-sm mb-1">{r.title}</p>
                    <p className="text-xs text-gray-500 leading-relaxed">{r.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 shadow-card p-7">
          <SectionLabel>Recognition &amp; Rewards</SectionLabel>
          <ul className="mt-4 space-y-3">
            {[
              { t: 'Acknowledgment', d: 'All submitters will receive acknowledgment for their contribution.' },
              { t: 'Implementation Support', d: 'Selected ideas may receive resources and support for further development and implementation.' },
            ].map(({ t, d }) => (
              <li key={t} className="flex items-start gap-3">
                <CheckCircle2 size={15} className="text-[#F0641E] shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-sm text-gray-900">{t}: </span>
                  <span className="text-sm text-gray-500">{d}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div
          className="rounded-3xl px-8 py-8"
          style={{ background: 'linear-gradient(120deg, #2E1E18 0%, #5A3C32 50%, #6B4A3E 100%)' }}
        >
          <SectionLabel white>Tips for a Successful Submission</SectionLabel>
          <ul className="mt-5 space-y-3">
            {tips.map((tip, i) => (
              <li key={i} className="flex items-start gap-3">
                <span
                  className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-extrabold"
                  style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}
                >
                  {i + 1}
                </span>
                <span className="text-white/80 text-sm leading-relaxed">{tip}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-gray-100 shadow-card p-7 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="font-bold text-gray-900 mb-1">Need Help?</p>
            <p className="text-sm text-gray-500">
              For any questions or assistance, contact the CEDA Innovation Team.
            </p>
          </div>
          <a
            href="mailto:innovation@ceda.co.bw"
            className="btn-white shrink-0 text-[13px]"
            style={{ background: '#A01E0A', borderColor: '#A01E0A' }}
          >
            innovation@ceda.co.bw
          </a>
        </div>

      </div>
    </div>
  )
}

function SectionLabel({ children, white }: { children: React.ReactNode; white?: boolean }) {
  return (
    <p
      className="text-[11px] font-bold tracking-[0.22em] uppercase mb-1"
      style={{ color: white ? 'rgba(255,255,255,0.5)' : '#F0641E' }}
    >
      {children}
    </p>
  )
}
