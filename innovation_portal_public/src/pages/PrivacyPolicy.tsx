import LegalPage from '../components/legal/LegalPage'
import { useI18n } from '../i18n'


const SECTIONS = [
  {
    title: 'Introduction',
    body: `Citizen Entrepreneurial Development Agency ("CEDA", "we", "our", or "us") is committed to protecting your personal information. This Privacy Policy explains how we collect, use, disclose, and safeguard information you provide when you use the CEDA Innovation Portal ("Portal").

By registering for or using the Portal, you consent to the practices described in this Privacy Policy. If you do not agree with the terms of this Privacy Policy, please do not access the Portal.`,
  },
  {
    title: 'Information We Collect',
    body: `We may collect the following categories of personal information when you register and use the Portal:

• Identity information: your full name
• Contact information: email address, phone number
• Account credentials: password (stored in hashed form; we never store plain-text passwords)
• Submitted content: ideas, innovation proposals, and any supporting material you upload
• Usage data: pages visited, features used, time and date of access
• Device information: browser type, operating system, IP address

We collect information you voluntarily provide during registration and when submitting material through the Portal.`,
  },
  {
    title: 'How We Use Your Information',
    body: `CEDA uses the information collected for the following purposes:

• To create and manage your Portal account
• To receive, process, and evaluate your submitted ideas and innovations
• To communicate with you about your submissions, account status, or Portal updates
• To publish approved material on the Portal and related platforms in accordance with the Terms of Agreement
• To improve the Portal's functionality and user experience
• To comply with applicable laws and regulations
• To prevent fraudulent activity and ensure platform security`,
  },
  {
    title: 'Disclosure of Your Information',
    body: `CEDA does not sell, trade, or rent your personal information to third parties. We may share your information in the following limited circumstances:

• With CEDA staff and authorised personnel involved in reviewing and managing Portal submissions
• With third-party service providers who assist us in operating the Portal (e.g. hosting, email delivery), subject to appropriate confidentiality obligations
• When required by law, regulation, court order, or governmental authority
• In connection with a merger, acquisition, or transfer of CEDA's business assets, where the receiving party will be bound by equivalent privacy obligations`,
  },
  {
    title: 'Data Retention',
    body: `We retain your personal information for as long as your account is active or as necessary to fulfil the purposes described in this Privacy Policy. If you request deletion of your account or submitted material, we will action your request within two weeks in accordance with the Terms of Agreement, unless retention is required by applicable law.`,
  },
  {
    title: 'Security',
    body: `CEDA implements appropriate technical and organisational measures to protect your personal information against unauthorised access, alteration, disclosure, or destruction. These include encrypted data transmission (HTTPS), hashed password storage, and access controls.

No method of transmission or storage is completely secure. While we strive to protect your information, we cannot guarantee absolute security and encourage you to use a strong, unique password for your account.`,
  },
  {
    title: 'Your Rights',
    body: `Subject to applicable Botswana data protection legislation, you have the right to:

• Access the personal information we hold about you
• Request correction of inaccurate or incomplete information
• Request deletion of your personal information, subject to legal retention requirements
• Withdraw consent where processing is based on consent
• Lodge a complaint with the relevant data protection authority

To exercise any of these rights, contact us at innovation@ceda.co.bw.`,
  },
  {
    title: 'Cookies and Tracking',
    body: `The Portal may use session cookies and local storage to maintain your login state and preferences. These are essential for the Portal to function correctly. We do not use tracking cookies for advertising purposes.

You may disable cookies through your browser settings; however, this may affect your ability to use certain features of the Portal.`,
  },
  {
    title: 'Third-Party Links',
    body: `The Portal may contain links to external websites or resources. CEDA is not responsible for the privacy practices or content of those third-party sites. We encourage you to review the privacy policies of any external sites you visit.`,
  },
  {
    title: 'Changes to This Privacy Policy',
    body: `CEDA reserves the right to update this Privacy Policy at any time. Material changes will be communicated via the Portal or by email. Your continued use of the Portal following notification of changes constitutes acceptance of the updated Privacy Policy.`,
  },
  {
    title: 'Contact Us',
    body: `If you have any questions or concerns about this Privacy Policy or our data practices, please contact:

Citizen Entrepreneurial Development Agency (CEDA)
Innovation Portal
innovation@ceda.co.bw
CEDA Head Office, Gaborone, Botswana`,
  },
]

export default function PrivacyPolicy() {
  const { t } = useI18n()
  return (
    <LegalPage id="privacy-title" title={t('legal.privacyTitle')}>
      {SECTIONS.map(({ title, body }, i) => (
        <section key={title} aria-labelledby={`privacy-${i}`} className="flex flex-col gap-3">
          <h2 id={`privacy-${i}`} className="flex items-center gap-2.5 text-d-h4 font-heading text-text">
            <span aria-hidden className="w-7 h-7 rounded-full bg-primary text-on-primary flex items-center justify-center text-d-label-s shrink-0">{i + 1}</span>
            {title}
          </h2>
          <div className="pl-[38px] flex flex-col gap-3">
            {body.split('\n\n').map((para, j) => (
              <p key={j} className="text-d-body text-text whitespace-pre-line">{para}</p>
            ))}
          </div>
        </section>
      ))}
    </LegalPage>
  )
}
