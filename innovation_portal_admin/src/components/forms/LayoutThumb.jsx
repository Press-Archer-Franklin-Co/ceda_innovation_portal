const SPAN = { quarter: 'col-span-1', half: 'col-span-2', three_quarter: 'col-span-3', full: 'col-span-4' }

/** A sketch of the form's first rows (`layout_preview` from the forms list), for the card picture. */
export default function LayoutThumb({ rows }) {
  const shown = (rows ?? []).slice(0, 4)
  return (
    <div aria-hidden className="flex h-24 flex-col justify-center gap-1.5 bg-surface2 px-4">
      {shown.length === 0 ? (
        <span className="h-2.5 w-2/3 rounded bg-border" />
      ) : (
        shown.map((row, i) => (
          <span key={i} className="grid grid-cols-4 gap-1.5">
            {row.map((width, j) => (
              <span key={j} className={`${SPAN[width] ?? SPAN.full} h-2.5 rounded bg-border`} />
            ))}
          </span>
        ))
      )}
    </div>
  )
}
