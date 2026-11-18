import { Users } from 'lucide-react'
import StandardHero from '../components/ui/StandardHero'

export default function Skills() {
  return (
    <div className="bg-white">
      <StandardHero
        eyebrow="Community"
        title="Member Directory"
        subtitle="Connect with developers, designers, and domain experts in Botswana's innovation community."
      />

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20 flex flex-col items-center text-center">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
          style={{ background: '#A01E0A' }}
        >
          <Users size={28} className="text-white" />
        </div>
        <h2 className="text-2xl font-extrabold text-gray-900 mb-3">Coming Soon</h2>
        <p className="text-gray-500 text-sm leading-relaxed max-w-sm">
          The Member Directory is under development. You'll soon be able to discover and connect
          with innovators, developers, and domain experts across Botswana.
        </p>
      </section>
    </div>
  )
}
