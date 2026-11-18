const CLAUSES = [
  {
    n: 1,
    text: 'I confirm that I am authorized to submit the material for publication on the Portal and that the submission is made in full compliance with all applicable legislation and/or policy.',
  },
  {
    n: 2,
    text: 'I understand that the material I am submitting is intended to be made publicly available, and I confirm that the material contains no confidential information and that all necessary steps have been taken to protect intellectual property appropriately.',
  },
  {
    n: 3,
    text: 'I confirm that, to the best of my knowledge, the material is accurate, does not violate any relevant legislation, and does not infringe upon the intellectual property rights of any third party.',
  },
  {
    n: 4,
    text: 'I agree that I may not hold Citizen Entrepreneurial Development Agency (CEDA) liable for any breach in regard to clauses 1 to 3 above.',
  },
  {
    n: 5,
    text: 'I provide consent to Citizen Entrepreneurial Development Agency (CEDA) to edit and/or curate the material for the purpose of clarity, consistency, and/or space. I understand that failure to respond within two weeks of a written request for such approval shall be deemed as consent that Citizen Entrepreneurial Development Agency (CEDA) may publish the material concerned.',
  },
  {
    n: 6,
    text: 'I undertake to respond promptly to any requests from Citizen Entrepreneurial Development Agency (CEDA) for further information, revision, or clarification.',
  },
  {
    n: 7,
    text: "I authorize Citizen Entrepreneurial Development Agency (CEDA) to use the material submitted for publication on the Portal and for reasonable related purposes, including (without limitation) on relevant social media platforms, for the sole purpose of promoting the Portal and the technologies listed there.",
  },
  {
    n: 8,
    text: 'I acknowledge that Citizen Entrepreneurial Development Agency (CEDA) may upload and/or remove information about the technology/technologies I submit at its sole discretion, and that Citizen Entrepreneurial Development Agency (CEDA) has no obligation to notify me when my submitted material is uploaded or removed.',
  },
  {
    n: 9,
    text: 'I acknowledge that Citizen Entrepreneurial Development Agency (CEDA) may choose not to upload any material submitted.',
  },
  {
    n: 10,
    text: 'Should I require any material that I have submitted to the Portal to be removed or amended, Citizen Entrepreneurial Development Agency (CEDA) shall remove or amend the material concerned (as the case may be) within two weeks of receipt of a written request.',
  },
]

export default function TermsOfAgreement() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">

      <div className="mb-10">
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>Draft for demonstration.</strong> This text is a placeholder and has not been approved by CEDA. The official version will replace it before launch.
        </div>
        <p className="eyebrow mb-3">Legal</p>
        <h1 className="text-3xl font-extrabold text-gray-900 mb-4">
          Innovation Portal<br />Terms of Agreement
        </h1>
        <div className="h-1 w-12 rounded-full" style={{ background: '#A01E0A' }} />
      </div>

      <div
        className="rounded-xl px-5 py-4 mb-10 text-sm font-semibold"
        style={{ background: '#fff3cd', color: '#856404', border: '1px solid #ffc107' }}
      >
        PLEASE NOTE THAT BY SUBMITTING YOUR IDEA YOU AGREE TO THESE TERMS
      </div>

      <ol className="space-y-6">
        {CLAUSES.map(({ n, text }) => (
          <li key={n} className="flex gap-4">
            <span
              className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white mt-0.5"
              style={{ background: '#A01E0A' }}
            >
              {n}
            </span>
            <p className="text-[15px] text-gray-700 leading-relaxed">{text}</p>
          </li>
        ))}
      </ol>

      <div className="mt-12 pt-8 border-t border-gray-100">
        <p className="text-xs text-gray-400">
          Citizen Entrepreneurial Development Agency (CEDA)
        </p>
      </div>
    </div>
  )
}
