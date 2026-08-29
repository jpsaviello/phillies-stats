import { useCallback, useEffect, useRef, useState } from 'react'

interface Props {
  children: React.ReactNode
  className?: string
}

/**
 * Horizontal scroll container with a right-edge fade that shows only while
 * there is more content to the right.
 *
 * The stats tables render 17 and 14 columns. At 375px the viewport shows the
 * sticky Player column, POS and about four stats, ending at a hard edge that
 * looks like the table simply stops — OPS, arguably the column people came for,
 * is off screen with nothing saying so.
 *
 * Right edge only: the first column is `sticky left-0` over an opaque
 * background, so a matching left fade would sit on top of the frozen Player
 * cell and suggest the NAME was cut off, which it isn't.
 */
export default function ScrollX({ children, className = '' }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState(false)

  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    // The 1px slack absorbs fractional device-pixel widths, which otherwise
    // leave the fade permanently on even when scrolled fully right.
    setMore(el.scrollWidth - el.clientWidth - el.scrollLeft > 1)
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    measure()
    el.addEventListener('scroll', measure, { passive: true })
    // Not optional: the tables gain a star column on sign-in and lose it on
    // sign-out, so a mount-time-only measurement is stale from that moment on.
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => {
      el.removeEventListener('scroll', measure)
      observer.disconnect()
    }
  }, [measure])

  return (
    <div className="relative">
      <div ref={ref} className={`overflow-x-auto ${className}`}>
        {children}
      </div>
      {more && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white to-transparent"
        />
      )}
    </div>
  )
}
