import clsx from 'clsx'

interface SectionHeaderProps {
  eyebrow?: string
  title: string
  subtitle?: string
  align?: 'left' | 'center'
  className?: string
}

export default function SectionHeader({
  eyebrow,
  title,
  subtitle,
  align = 'center',
  className,
}: SectionHeaderProps) {
  return (
    <div className={clsx(align === 'center' ? 'text-center' : 'text-left', 'mb-12', className)}>
      {eyebrow && (
        <p className="text-ceda-600 font-semibold text-sm uppercase tracking-widest mb-3">
          {eyebrow}
        </p>
      )}
      <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 text-balance leading-tight">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-4 text-lg text-gray-500 text-balance max-w-2xl mx-auto">
          {subtitle}
        </p>
      )}
    </div>
  )
}
