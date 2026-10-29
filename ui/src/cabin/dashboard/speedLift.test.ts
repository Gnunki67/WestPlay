import { expect, it } from 'vitest'
import { speedLift } from './speedLift'

const speed = { left: 20, right: 94, top: 400, bottom: 550 }
it('keeps speed and limit in place without arrival text or when a short label fits beside them', () => {
  expect(speedLift(speed, null, 10)).toBe(0)
  expect(speedLift(speed, { left: 100, right: 400, top: 510, bottom: 560 }, 10)).toBe(0)
})
it('lifts the pair above a wide label and moves higher when larger text makes it taller', () => {
  expect(speedLift(speed, { left: 80, right: 440, top: 510, bottom: 560 }, 10)).toBe(50)
  expect(speedLift(speed, { left: 50, right: 470, top: 470, bottom: 560 }, 10)).toBe(90)
})
it('does not move a pair already separated vertically from the arrival label', () => {
  expect(speedLift(speed, { left: 40, right: 400, top: 570, bottom: 620 }, 10)).toBe(0)
  expect(speedLift(speed, { left: 40, right: 400, top: 300, bottom: 380 }, 10)).toBe(0)
})
