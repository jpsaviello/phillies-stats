interface Props {
  /** The section's name. Rendered as the panel's own heading. */
  title: string
  /**
   * What the reader can do here, when that isn't obvious from looking.
   *
   * Written for the row-opens-a-modal case: the stats tables carry the app's
   * richest surface behind a plain table row, and a row that opens something
   * announces itself to a mouse (cursor, hover tint) and to a screen reader
   * (`role="button"`), but to nobody reading the page on a phone. One line of
   * fine print is the affordance that reaches every reader.
   */
  hint?: string
  /** Right-hand slot — a count, a control. Drops below the heading on a phone. */
  children?: React.ReactNode
}

/**
 * The heading over a tab's primary content.
 *
 * The season tables shipped with no heading at all while the smaller panels
 * above them (Hot & Cold, Bullpen Usage) each had one, so on both stats tabs
 * the labelled thing was the secondary panel and the table the reader came for
 * was the unlabelled one below it. Matches the `text-lg font-semibold` heading
 * those panels already use, so the two now read as peers.
 */
export default function SectionHead({ title, hint, children }: Props) {
  return (
    <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
      </div>
      {children}
    </div>
  )
}
