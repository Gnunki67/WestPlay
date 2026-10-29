import { describe, expect, it } from 'vitest'
import { automaticCountry, receptionAt, staticLevel, type RadioData } from './reception'
const data: RadioData = {
  cities: [
    { gameName: 'Poznań', country: 'Poland', x: '0', z: '1000' },
    { gameName: 'Berlin', country: 'germany', x: -5000, z: 1000 },
  ],
  countries: {
    poland: { name: 'Polska', name_english: 'Poland', relative_radius: 1 },
    germany: { name: 'Deutschland', name_english: 'Germany', relative_radius: 1 },
  },
  properties: {},
  stations: {
    poland: [{ name: 'PL', url: 'https://example.test/pl' }],
    germany: [{ name: 'DE', url: 'https://example.test/de' }],
  },
}
describe('Local Radio reception in game world coordinates', () => {
  it('finds Poland and Germany along a border crossing, accepting source coordinates stored as strings', () => {
    expect(receptionAt(data, 50, 1000)[0].country).toBe('poland')
    expect(receptionAt(data, -4900, 1000)[0].country).toBe('germany')
  })
  it('holds the current country near a border until reception improves by the Local Radio threshold', () => {
    expect(automaticCountry(receptionAt(data, -2600, 1000), 'poland')).toBe('poland')
    expect(automaticCountry(receptionAt(data, -4000, 1000), 'poland')).toBe('germany')
  })
  it('keeps the nearest transmitter beyond normal range and rejects disconnected positions', () => {
    expect(receptionAt(data, 50000, 1000)).toHaveLength(1)
    expect(receptionAt(data, 0, 0)).toEqual([])
    expect(receptionAt(data, NaN, 1000)).toEqual([])
  })
  it('applies country and city radii and static multipliers', () => {
    const custom = { ...data, properties: { Poznań: { relative_radius: 0.5, relative_whitenoise: 0.5 } } }
    expect(receptionAt(custom, 3000, 1000).find((r) => r.country === 'poland')?.noise).toBeCloseTo(0.4)
    expect(staticLevel(0)).toBe(0)
    expect(staticLevel(1)).toBe(0.85)
    expect(staticLevel(3)).toBe(1)
  })
})
