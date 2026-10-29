import type { CabSound } from '../../../shared/host'

interface SoundGraph {
  head(head: CabSound['head']): void
  speakers(speakers: CabSound['speakers']): void
  outside(on: boolean, distance: number): void
  equalizer(equalizer: CabSound['equalizer']): void
  tick(): void
}
declare global {
  interface Window {
    westplayCabSound?: (media: () => HTMLMediaElement | null) => SoundGraph
  }
}
let graphs: SoundGraph[] = []
let latest: CabSound | null = null
function apply(graph: SoundGraph, sound: CabSound) {
  graph.head(sound.head)
  graph.speakers(sound.speakers)
  graph.outside(sound.outside, sound.distance)
  graph.equalizer(sound.equalizer)
}
/** Each element enters Web Audio only once, including reception static. */
export function attachRadioSound(...elements: HTMLMediaElement[]) {
  if (typeof window === 'undefined' || !window.westplayCabSound || graphs.length) return
  graphs = elements.map((element) => window.westplayCabSound!(() => element))
  if (latest) graphs.forEach((graph) => apply(graph, latest!))
}
export function updateRadioSound(sound: CabSound | null | undefined) {
  if (!sound) return
  // The host sends a whole state for head movement. Keep the speaker array identity,
  // otherwise cab_sound would rebuild its crossover graph on every camera update.
  if (latest && JSON.stringify(sound.speakers) === JSON.stringify(latest.speakers)) {
    sound = { ...sound, speakers: latest.speakers }
  }
  latest = sound
  graphs.forEach((graph) => apply(graph, sound))
}
export function tickRadioSound() {
  graphs.forEach((graph) => graph.tick())
}
