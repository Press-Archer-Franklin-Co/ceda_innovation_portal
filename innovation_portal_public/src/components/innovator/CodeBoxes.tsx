import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react'
import clsx from 'clsx'
import { useI18n } from '../../i18n'

const LENGTH = 6

interface CodeBoxesProps {
  value: string
  onChange: (value: string) => void
  /** Called once when the sixth digit is typed or pasted. */
  onComplete: (value: string) => void
  invalid?: boolean
  disabled?: boolean
  describedBy?: string
}

/**
 * Six separate digit boxes (2.0). Accepts paste of the whole code anywhere,
 * moves focus forward and back, and submits on the sixth digit.
 */
export default function CodeBoxes({ value, onChange, onComplete, invalid, disabled, describedBy }: CodeBoxesProps) {
  const { t } = useI18n()
  const refs = useRef<Array<HTMLInputElement | null>>([])
  const digits = Array.from({ length: LENGTH }, (_, i) => value[i] ?? '')

  function setFrom(index: number, typed: string) {
    const clean = typed.replace(/\D/g, '')
    if (!clean) return
    const next = (value.slice(0, index) + clean).slice(0, LENGTH)
    onChange(next)
    const focusAt = Math.min(next.length, LENGTH - 1)
    refs.current[focusAt]?.focus()
    if (next.length === LENGTH) onComplete(next)
  }

  function onKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace') {
      event.preventDefault()
      if (digits[index]) {
        onChange(value.slice(0, index))
      } else if (index > 0) {
        onChange(value.slice(0, index - 1))
        refs.current[index - 1]?.focus()
      }
    } else if (event.key === 'ArrowLeft' && index > 0) {
      refs.current[index - 1]?.focus()
    } else if (event.key === 'ArrowRight' && index < LENGTH - 1) {
      refs.current[index + 1]?.focus()
    }
  }

  function onPaste(index: number, event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault()
    setFrom(index, event.clipboardData.getData('text'))
  }

  return (
    <div className="flex gap-2 sm:gap-2.5" role="group" aria-describedby={describedBy}>
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          value={digit}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          pattern="[0-9]*"
          maxLength={LENGTH}
          disabled={disabled}
          aria-label={t('signin.digit', { n: i + 1 })}
          aria-invalid={invalid || undefined}
          onChange={(e) => setFrom(i, e.target.value.slice(digit ? 1 : 0))}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={(e) => onPaste(i, e)}
          onFocus={(e) => e.target.select()}
          className={clsx(
            'h-14 w-11 sm:w-[54px] rounded-control border bg-surface text-center font-heading text-d-h3 text-text',
            'focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary',
            invalid ? 'border-danger' : 'border-border',
            disabled && 'opacity-60',
          )}
        />
      ))}
    </div>
  )
}
