// Reception model adapted from ETS2/ATS Local Radio's refresh(), MPL-2.0.
// Original source: Koenvh1/ets2-local-radio, web/lib/js/main.js.
export interface City {
  gameName: string
  country: string
  x: number | string
  z: number | string
}
export interface Country {
  name: string
  name_english: string
  relative_radius: number
}
export interface Station {
  name: string
  url: string
  logo?: string
  relative_radius?: number
}
export interface RadioData {
  cities: City[]
  countries: Record<string, Country>
  properties: Record<string, { relative_radius?: number; relative_whitenoise?: number }>
  stations: Record<string, Station[]>
}
export interface Reception {
  country: string
  city: string
  distance: number
  noise: number
}
export const RADIUS = 7500
export const THRESHOLD = 0.15

/** Game world X/Z in metres, never latitude/longitude or the truck's local cabin position. */
export function receptionAt(data: RadioData, x: number, z: number): Reception[] {
  if (!Number.isFinite(x) || !Number.isFinite(z) || (x === 0 && z === 0)) return []
  const nearby = new Map<string, Reception>()
  let nearest: Reception | null = null
  for (const city of data.cities) {
    const country = city.country.toLowerCase()
    if (!data.stations[country]?.length) continue
    const distance = Math.hypot(x - Number(city.x), z - Number(city.z))
    if (!Number.isFinite(distance)) continue
    const properties = data.properties[city.gameName]
    const radius = RADIUS * (data.countries[country]?.relative_radius ?? 1) * (properties?.relative_radius ?? 1)
    const noise = (distance / radius) * (properties?.relative_whitenoise ?? 1)
    const found = { country, city: city.gameName, distance, noise }
    if (!nearest || distance < nearest.distance) nearest = found
    if (distance < radius && (!nearby.has(country) || noise < nearby.get(country)!.noise)) nearby.set(country, found)
  }
  // As in Local Radio, keep the nearest transmitter even beyond its normal range.
  if (nearest && !nearby.has(nearest.country)) nearby.set(nearest.country, nearest)
  return [...nearby.values()].sort((a, b) => a.noise - b.noise)
}

export function automaticCountry(nearby: Reception[], current: string | null): string | null {
  const best = nearby[0]
  if (!best) return null
  if (current === 'global') return current
  const tuned = nearby.find((entry) => entry.country === current)
  return !tuned || best.noise + THRESHOLD < tuned.noise ? best.country : current
}

export function staticLevel(noise: number): number {
  return Math.max(0, Math.min(1, noise ** 2 - 0.15))
}

export function availableStations(data: RadioData, nearby: Reception[]): { country: string; station: Station }[] {
  return [
    ...nearby.flatMap((entry) =>
      (data.stations[entry.country] ?? [])
        .filter((station) => !station.relative_radius || entry.distance / station.relative_radius < RADIUS)
        .map((station) => ({ country: entry.country, station })),
    ),
    ...(data.stations.global ?? []).map((station) => ({ country: 'global', station })),
  ]
}
