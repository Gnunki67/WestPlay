import { useLayoutEffect, type RefObject } from 'react'

interface Box {
  left: number
  right: number
  top: number
  bottom: number
}

/** Move the pair only when the actual arrival text intersects its normal position. */
export function speedLift(speed: Box, arrival: Box | null, gap: number): number {
  if (
    !arrival ||
    speed.right <= arrival.left ||
    speed.left >= arrival.right ||
    speed.top >= arrival.bottom ||
    speed.bottom <= arrival.top - gap
  )
    return 0
  return Math.max(0, speed.bottom - arrival.top + gap)
}

/** Observe rendered text, not a language or font-size guess. No route restores the normal position. */
export function useSpeedLift(ref: RefObject<HTMLDivElement | null>, enabled: boolean) {
  useLayoutEffect(() => {
    const root = ref.current
    if (!root || !enabled) return
    let pill: Element | null = null
    const update = () => {
      const speed = root.querySelector('.speed-stack')
      const nextPill = root.querySelector('.eta-pill')
      if (pill !== nextPill) {
        if (pill) sizes.unobserve(pill)
        pill = nextPill
        if (pill) sizes.observe(pill)
      }
      if (!speed) return
      const scale = root.getBoundingClientRect().height / root.offsetHeight || 1
      const previous = parseFloat(root.style.getPropertyValue('--speed-lift')) || 0
      const rect = speed.getBoundingClientRect()
      // Undo the current lift for measurement, so the result remains stable after moving.
      const normal = {
        left: rect.left,
        right: rect.right,
        top: rect.top + previous * scale,
        bottom: rect.bottom + previous * scale,
      }
      const lift = Math.ceil(speedLift(normal, pill?.getBoundingClientRect() ?? null, 10 * scale) / scale)
      if (Math.abs(lift - previous) >= 1) root.style.setProperty('--speed-lift', `${lift}px`)
    }
    const sizes = new ResizeObserver(update)
    sizes.observe(root)
    const speed = root.querySelector('.speed-stack')
    if (speed) sizes.observe(speed)
    const content = new MutationObserver(update)
    content.observe(root, { childList: true, subtree: true, characterData: true })
    update()
    return () => {
      sizes.disconnect()
      content.disconnect()
      root.style.removeProperty('--speed-lift')
    }
  }, [ref, enabled])
}
