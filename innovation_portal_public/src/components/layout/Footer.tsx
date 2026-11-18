import { Link } from 'react-router-dom'
import logoSrc from '../../assets/logo.png'

const platform = [
  { to: '/challenges',  label: 'Challenges' },
  { to: '/news',        label: 'News & Updates' },
  { to: '/innovate',    label: 'Submit Idea' },
  { to: '/skills',      label: 'Community' },
  { to: '/suggestions', label: 'Feedback Xchange' },
]

const company = [
  { to: '/about',      label: 'About Us' },
  { to: '/guidelines', label: 'Guidelines' },
  { to: '/faq',        label: 'FAQ' },
]

const legal = [
  { to: '/terms-of-use',       label: 'Terms of Use' },
  { to: '/terms-of-agreement', label: 'Terms of Agreement' },
  { to: '/privacy-policy',     label: 'Privacy Policy' },
]

const socials = [
  {
    href: 'https://www.ceda.co.bw', label: 'Website',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  },
]

export default function Footer() {
  return (
    <footer className="bg-white border-t border-gray-100">

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-10 lg:gap-6">

          <div className="sm:col-span-2 lg:col-span-1">
            <Link to="/" className="inline-flex items-center gap-3 mb-5">
              <img src={logoSrc} alt="CEDA" className="h-9 w-auto" />
              <div className="w-px h-8 bg-gray-200" />
              <div className="flex flex-col leading-none">
                <span style={{ fontFamily: 'Poppins', fontWeight: 900, fontSize: 22, color: '#A01E0A', lineHeight: 1 }}>ceda</span>
                <span className="text-[10px] font-semibold text-gray-400 tracking-[0.05em] mt-[4px]">Innovation Portal</span>
              </div>
            </Link>
            <p className="text-[13px] text-gray-400 leading-relaxed mb-6 max-w-[220px]">
              Botswana's platform for innovation, collaboration, and digital transformation.
            </p>
            <div className="flex items-center gap-2.5">
              {socials.map(({ href, label, icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`CEDA on ${label}`}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-white transition-all duration-200 hover:scale-105"
                  style={{ background: '#f3f4f6' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#A01E0A')}
                  onMouseLeave={e => (e.currentTarget.style.background = '#f3f4f6')}
                >
                  {icon}
                </a>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-bold tracking-[0.16em] uppercase text-gray-900 mb-5">Platform</p>
            <ul className="space-y-3">
              {platform.map(({ to, label }) => (
                <li key={to}>
                  <Link to={to} className="text-[13px] text-gray-500 hover:text-[#A01E0A] transition-colors duration-150">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-[11px] font-bold tracking-[0.16em] uppercase text-gray-900 mb-5">Company</p>
            <ul className="space-y-3">
              {company.map(({ to, label }) => (
                <li key={to}>
                  <Link to={to} className="text-[13px] text-gray-500 hover:text-[#A01E0A] transition-colors duration-150">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-[11px] font-bold tracking-[0.16em] uppercase text-gray-900 mb-5">Legal</p>
            <ul className="space-y-3">
              {legal.map(({ to, label }) => (
                <li key={to}>
                  <Link to={to} className="text-[13px] text-gray-500 hover:text-[#A01E0A] transition-colors duration-150">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-[11px] font-bold tracking-[0.16em] uppercase text-gray-900 mb-5">Contact</p>
            <ul className="space-y-3">
              <li>
                <a href="mailto:innovation@ceda.co.bw" className="text-[13px] text-gray-500 hover:text-[#A01E0A] transition-colors duration-150">
                  innovation@ceda.co.bw
                </a>
              </li>
              <li className="text-[13px] text-gray-500">Gaborone, Botswana</li>
              <li className="text-[13px] text-gray-500">CEDA Head Office</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-[12px] text-gray-400">
            © {new Date().getFullYear()} Citizen Entrepreneurial Development Agency (CEDA). All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            {legal.map(({ to, label }) => (
              <Link key={to} to={to} className="text-[12px] text-gray-400 hover:text-[#A01E0A] transition-colors duration-150">
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>

    </footer>
  )
}
