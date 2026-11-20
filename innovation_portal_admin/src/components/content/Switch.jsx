/** A compact on/off switch for a row in a list; `label` names what it switches. */
export default function Switch({ checked, onChange, label }) {
  return (
    <span className="relative flex shrink-0">
      <input type="checkbox" role="switch" checked={checked} aria-checked={checked} aria-label={label} onChange={(e) => onChange(e.target.checked)}
        className="peer absolute inset-0 z-10 cursor-pointer opacity-0" />
      <span aria-hidden className="flex h-6 w-10 rounded-full bg-muted/40 p-0.5 transition-colors peer-checked:bg-success peer-checked:[&>span]:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2">
        <span className="h-5 w-5 rounded-full bg-white shadow transition-transform" />
      </span>
    </span>
  )
}
