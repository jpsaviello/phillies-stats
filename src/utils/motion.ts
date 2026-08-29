/**
 * Shared by every scripted scroll in the app (Schedule's jump-to-today,
 * BackToTop). Wrapped because `matchMedia` is absent in non-browser contexts and
 * an unsupported query string throws in older engines — a scroll helper must
 * never be the thing that breaks a render.
 */
export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/** `'smooth'` unless the visitor asked for less motion. */
export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? 'auto' : 'smooth'
}
