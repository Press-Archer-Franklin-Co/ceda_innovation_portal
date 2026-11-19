import { clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// Teach tailwind-merge the Option D font sizes (text-d-h1 … text-d-btn-s, see tailwind.tokens.js),
// otherwise it treats them as text colours and drops either the size or the colour.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['d-h1', 'd-mh1', 'd-h2', 'd-h3', 'd-h4', 'd-h5', 'd-body', 'd-body-s', 'd-label', 'd-label-s', 'd-cap', 'd-over', 'd-btn', 'd-btn-s', '2xs'] }],
    },
  },
})

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}
