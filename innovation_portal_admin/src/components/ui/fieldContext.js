import { createContext, useContext } from 'react'
import { cn } from '../../lib/cn'

/** { controlId, describedBy, invalid, required } from the surrounding <Field>. */
export const FieldContext = createContext(null)

export function useField() {
  return useContext(FieldContext)
}

/** Shared look for text-like controls: white, 1px border, 2px red border and soft ring on focus, 2px danger on error. */
export function controlClasses(invalid, className) {
  return cn(
    'w-full rounded-control bg-surface font-body text-[13px] 2xl:text-[14px] text-text placeholder:text-muted',
    'border transition-[border-color,box-shadow] duration-150',
    'focus:outline-none focus-visible:ring-0',
    invalid
      ? 'border-2 border-danger focus:shadow-[0_0_0_3px_rgb(var(--c-danger)/0.15)]'
      : 'border-border hover:border-muted/50 focus:border-2 focus:border-primary focus:shadow-focus',
    'disabled:bg-surface2 disabled:text-muted disabled:cursor-not-allowed',
    className,
  )
}

// Compact staff control height: 34px (38px from 2xl).
export const CONTROL_HEIGHT = 'h-[34px] 2xl:h-[38px]'
