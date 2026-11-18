import { Link } from 'react-router-dom'
import { FileText, ShieldCheck, ArrowRight } from 'lucide-react'

const DOCS = [
  {
    icon: <FileText size={20} />,
    title: 'Terms of Agreement',
    description:
      'The terms that apply when you submit ideas, innovations, or any material to the CEDA Innovation Portal. By submitting content you confirm that you have read and agree to these terms.',
    to: '/terms-of-agreement',
    label: 'Read Terms of Agreement',
  },
  {
    icon: <ShieldCheck size={20} />,
    title: 'Privacy Policy',
    description:
      'Explains how Citizen Entrepreneurial Development Agency (CEDA) collects, uses, and protects your personal information when you register and use the Portal.',
    to: '/privacy-policy',
    label: 'Read Privacy Policy',
  },
]

export default function TermsOfUse() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">

      <div className="mb-10">
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>Draft for demonstration.</strong> This text is a placeholder and has not been approved by CEDA. The official version will replace it before launch.
        </div>
        <p className="eyebrow mb-3">Legal</p>
        <h1 className="text-3xl font-extrabold text-gray-900 mb-3">Terms of Use</h1>
        <p className="text-[15px] text-gray-500 leading-relaxed max-w-xl">
          By registering for and using the CEDA Innovation Portal, you agree to the applicable
          policies and submission terms set out in the documents below. Please read them carefully
          before creating an account or submitting material.
        </p>
        <div className="h-1 w-12 rounded-full mt-6" style={{ background: '#A01E0A' }} />
      </div>

      <div className="space-y-4 mb-12">
        {DOCS.map(({ icon, title, description, to, label }) => (
          <Link
            key={to}
            to={to}
            className="flex items-start gap-5 p-6 rounded-2xl border border-gray-100 bg-white hover:border-[#A01E0A]/20 hover:shadow-md transition-all duration-200 group"
          >
            <span
              className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-white mt-0.5"
              style={{ background: '#A01E0A' }}
            >
              {icon}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold text-gray-900 mb-1">{title}</p>
              <p className="text-[13.5px] text-gray-500 leading-relaxed mb-3">{description}</p>
              <span className="inline-flex items-center gap-1 text-sm font-semibold group-hover:underline" style={{ color: '#A01E0A' }}>
                {label} <ArrowRight size={14} />
              </span>
            </div>
          </Link>
        ))}
      </div>

      <div className="rounded-xl border border-gray-100 bg-gray-50 px-6 py-5">
        <p className="text-[13.5px] text-gray-600 leading-relaxed">
          If you have any questions about these policies, contact us at{' '}
          <a href="mailto:innovation@ceda.co.bw" className="font-medium hover:underline" style={{ color: '#A01E0A' }}>
            innovation@ceda.co.bw
          </a>
          . Nothing in these terms creates obligations beyond what is stated in the linked documents.
        </p>
      </div>

      <div className="mt-12 pt-8 border-t border-gray-100">
        <p className="text-xs text-gray-400">
          Citizen Entrepreneurial Development Agency (CEDA)
        </p>
      </div>
    </div>
  )
}
