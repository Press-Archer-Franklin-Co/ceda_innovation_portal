import LegalPage from '../components/legal/LegalPage'
import { useI18n } from '../i18n'

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
  const { t } = useI18n()
  return (
    <LegalPage id="agreement-title" title={t('legal.agreementTitle')}>
      <p className="rounded-control border border-border bg-surface2 px-4 py-3 text-d-label text-text">{t('legal.agreementNote')}</p>
      <ol className="flex flex-col gap-5">
        {CLAUSES.map(({ n, text }) => (
          <li key={n} className="flex gap-3">
            <span aria-hidden className="w-7 h-7 rounded-full bg-primary text-on-primary flex items-center justify-center text-d-label-s shrink-0">{n}</span>
            <p className="text-d-body text-text">{text}</p>
          </li>
        ))}
      </ol>
    </LegalPage>
  )
}
