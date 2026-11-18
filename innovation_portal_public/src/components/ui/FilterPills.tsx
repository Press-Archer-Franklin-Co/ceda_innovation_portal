import clsx from 'clsx'

interface FilterOption<T extends string> {
  value: T
  label: string
}

interface FilterPillsProps<T extends string> {
  options: FilterOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
}

export default function FilterPills<T extends string>({
  options,
  value,
  onChange,
  className,
}: FilterPillsProps<T>) {
  return (
    <div className={clsx('flex gap-2 flex-wrap', className)}>
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={clsx(
            'px-4 py-2 rounded-xl text-xs font-semibold transition-colors',
            value === opt.value
              ? 'text-white bg-[#A01E0A]'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
