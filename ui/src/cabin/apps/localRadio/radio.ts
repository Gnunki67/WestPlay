import { create } from 'zustand'
import Hls from 'hls.js'
import type { MediaSource } from '../../../shared/media'
import type { MusicPlayer } from '../musicWithGame'
import { useLive } from '../../state/store'
import type { RadioError } from './words'
import {
  automaticCountry,
  availableStations,
  receptionAt,
  staticLevel,
  type RadioData,
  type Reception,
  type Station,
} from './reception'

const KEY = 'westplay.localRadio'
interface Preferences {
  volume: number
  noise: boolean
  auto: boolean
  favourites: Record<string, string>
  lastStation: { country: string; url: string } | null
}
function preferences(): Preferences {
  let saved: Partial<Preferences> = {}
  try {
    saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {}
  } catch {
    /* Use defaults. */
  }
  return {
    volume:
      typeof saved.volume === 'number' && Number.isFinite(saved.volume) ? Math.max(0, Math.min(1, saved.volume)) : 0.7,
    lastStation:
      saved.lastStation && typeof saved.lastStation.country === 'string' && typeof saved.lastStation.url === 'string'
        ? saved.lastStation
        : null,
    noise: saved.noise !== false,
    auto: saved.auto !== false,
    favourites: saved.favourites && typeof saved.favourites === 'object' ? saved.favourites : {},
  }
}
interface RadioState extends Preferences {
  data: RadioData | null
  nearby: Reception[]
  current: { country: string; station: Station } | null
  playing: boolean
  loading: boolean
  error: RadioError | null
  connected: boolean
}
export const useRadio = create<RadioState>(() => ({
  ...preferences(),
  data: null,
  nearby: [],
  current: null,
  playing: false,
  loading: false,
  error: null,
  connected: false,
}))
let audio: HTMLAudioElement | null = null
let noise: HTMLAudioElement | null = null
let hls: Hls | null = null
let generation = 0
let requested = false
let pending: Promise<void> | null = null
let fadeVolume: number | null = null
let connectionTimer: ReturnType<typeof setTimeout> | undefined
let lastAutomaticBest: string | null = null

function save() {
  const { volume, noise, auto, favourites, lastStation } = useRadio.getState()
  try {
    localStorage.setItem(KEY, JSON.stringify({ volume, noise, auto, favourites, lastStation }))
  } catch {
    /* Optional storage. */
  }
}
export function radioPreference(change: Partial<Preferences>) {
  if ('volume' in change) fadeVolume = null
  useRadio.setState(change)
  save()
  applyVolume()
  if ('auto' in change) updateLocation()
}
export function favourite(country: string, station: Station) {
  const favourites = { ...useRadio.getState().favourites }
  if (favourites[country] === station.name) delete favourites[country]
  else favourites[country] = station.name
  radioPreference({ favourites })
}
export function logo(station: Station): string | null {
  if (!station.logo) return null
  if (/^https?:\/\//i.test(station.logo)) return station.logo
  return `/local-radio/${station.logo.replace(/^\/+/, '')}`
}
function player(): HTMLAudioElement {
  if (audio) return audio
  audio = new Audio()
  audio.preload = 'none'
  noise = new Audio('/local-radio/static.mp3')
  noise.loop = true
  audio.addEventListener('playing', () => {
    if (!requested) {
      audio?.pause()
      return
    }
    clearTimeout(connectionTimer)
    useRadio.setState({ playing: true, loading: false, error: null })
    applyVolume()
  })
  audio.addEventListener('waiting', () => requested && useRadio.setState({ loading: true }))
  audio.addEventListener('pause', () => {
    noise?.pause()
    useRadio.setState({ playing: false })
  })
  audio.addEventListener('error', () => {
    if (requested) fail('stream')
  })
  return audio
}
function fail(error: RadioError) {
  clearTimeout(connectionTimer)
  requested = false
  audio?.pause()
  noise?.pause()
  useRadio.setState({ playing: false, loading: false, error })
}
function applyVolume() {
  const state = useRadio.getState()
  const volume = fadeVolume ?? state.volume
  const reception = state.nearby.find((entry) => entry.country === state.current?.country)
  const staticShare = state.noise && reception ? staticLevel(reception.noise) : 0
  if (audio) audio.volume = volume * (1 - staticShare * 0.7)
  if (noise) {
    noise.volume = volume * staticShare
    if (requested && state.playing && staticShare > 0) void noise.play().catch(() => {})
    else noise.pause()
  }
}
export function tune(country: string, station: Station, play = true, automatic = false) {
  if (!automatic) lastAutomaticBest = useRadio.getState().nearby[0]?.country ?? null
  const element = player()
  const ticket = ++generation
  requested = play
  clearTimeout(connectionTimer)
  if (play)
    connectionTimer = setTimeout(() => {
      if (ticket === generation && useRadio.getState().loading) fail('timeout')
    }, 20000)
  hls?.destroy()
  hls = null
  element.pause()
  element.removeAttribute('src')
  element.load()
  useRadio.setState({ current: { country, station }, playing: false, loading: play, error: null })
  useRadio.setState({ lastStation: { country, url: station.url } })
  save()
  applyVolume()
  // Preserve supplied HTTP URLs: many FM streams do not have an HTTPS endpoint.
  if (/\.m3u8(?:[?#]|$)/i.test(station.url) && Hls.isSupported()) {
    hls = new Hls()
    hls.loadSource(station.url)
    hls.attachMedia(element)
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (ticket === generation && requested) void playAudio(ticket)
    })
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal && ticket === generation) fail('hls')
    })
  } else {
    element.src = station.url
    if (play) void playAudio(ticket)
  }
}
async function playAudio(ticket: number) {
  try {
    await player().play()
  } catch (error) {
    if (ticket === generation && requested && !(error instanceof DOMException && error.name === 'AbortError')) {
      fail('play')
    }
  }
}
export function pauseRadio() {
  clearTimeout(connectionTimer)
  requested = false
  hls?.stopLoad()
  audio?.pause()
  noise?.pause()
  useRadio.setState({ playing: false, loading: false })
}
export function resumeRadio() {
  if (!useRadio.getState().connected) return
  const { current, data, nearby, favourites, lastStation } = useRadio.getState()
  if (!current) {
    const saved = lastStation && data?.stations[lastStation.country]?.find((station) => station.url === lastStation.url)
    if (saved && nearby.some((row) => row.country === lastStation.country)) {
      tune(lastStation.country, saved)
      return
    }
    const country = nearby[0]?.country
    const stations = country ? data?.stations[country] : undefined
    if (country && stations?.length) tune(country, stations.find((s) => s.name === favourites[country]) ?? stations[0])
    return
  }
  // Recreate a failed or stopped HLS connection as well as normal audio.
  tune(current.country, current.station)
}
export function toggleRadio() {
  if (requested) pauseRadio()
  else resumeRadio()
}
export function nextRadio(step: number) {
  const { data, nearby, current } = useRadio.getState()
  if (!data) return
  const rows = availableStations(data, nearby)
  if (!rows.length) return
  const index = rows.findIndex((row) => row.country === current?.country && row.station.url === current.station.url)
  const row = rows[(index + step + rows.length) % rows.length]
  tune(row.country, row.station)
}

export async function loadRadio(): Promise<void> {
  if (useRadio.getState().data) return
  return (pending ??= fetch('/local-radio/europe.json')
    .then((response) => {
      if (!response.ok) throw Error('Radio station database unavailable')
      return response.json() as Promise<RadioData>
    })
    .then((data) => {
      useRadio.setState({ data, error: null })
      updateLocation()
    })
    .catch(() => {
      useRadio.setState({ error: 'database' })
    })
    .finally(() => {
      pending = null
    }))
}
function updateLocation() {
  const { telemetry } = useLive.getState()
  const { data, auto, current, favourites } = useRadio.getState()
  const connected = Boolean(
    telemetry &&
    Number.isFinite(telemetry.x) &&
    Number.isFinite(telemetry.z) &&
    (telemetry.x !== 0 || telemetry.z !== 0),
  )
  const nearby = data && connected && telemetry ? receptionAt(data, telemetry.x, telemetry.z) : []
  useRadio.setState({ nearby, connected })
  if (!connected) {
    if (requested) pauseRadio()
    return
  }
  if (!data) return
  if (auto && current) {
    const country = automaticCountry(nearby, current.country)
    const currentInRange = nearby.some((entry) => entry.country === current.country)
    if (country && country !== current.country && (!currentInRange || nearby[0]?.country !== lastAutomaticBest)) {
      const candidates = availableStations(data, nearby)
        .filter((row) => row.country === country)
        .map((row) => row.station)
      const station = candidates.find((s) => s.name === favourites[country]) ?? candidates[0]
      if (station) {
        lastAutomaticBest = nearby[0]?.country ?? null
        tune(country, station, requested, true)
      }
    }
  }
  applyVolume()
}
/** Mounted for the life of the cabin, so playback and location continue outside the Radio screen. */
export function followRadio(): () => void {
  void loadRadio()
  let last = 0
  const stop = useLive.subscribe((now, before) => {
    if (
      (now.telemetry === null && before.telemetry !== null) ||
      (now.telemetry !== before.telemetry && performance.now() - last > 750)
    ) {
      last = performance.now()
      updateLocation()
    }
  })
  return () => {
    stop()
    pauseRadio()
    hls?.destroy()
    hls = null
  }
}
export const radioPlayer: MusicPlayer = {
  name: 'localRadio',
  skip: nextRadio,
  playingHere: () => requested,
  pauseHere: pauseRadio,
  resumeHere: resumeRadio,
  volume: () => (useRadio.getState().current ? useRadio.getState().volume : null),
  sendVolume: (volume) => {
    fadeVolume = volume
    applyVolume()
  },
  setVolume: (volume) => {
    fadeVolume = null
    radioPreference({ volume })
  },
  subscribe: (changed) => useRadio.subscribe((now, before) => changed(now.playing && !before.playing)),
}
export function radioSource(state: RadioState): MediaSource | null {
  if (!state.current) return null
  const { country, station } = state.current
  return {
    id: `localRadio:${station.url}`,
    service: 'localRadio',
    title: station.name,
    artist: state.data?.countries[country]?.name ?? country,
    album: 'Radio FM',
    artwork: logo(station),
    status: state.playing ? 'playing' : 'paused',
    positionMs: 0,
    positionAt: Date.now(),
    durationMs: 0,
    controls: { playPause: true, next: true, previous: true, shuffle: false, repeat: false },
    shuffle: null,
    repeat: null,
  }
}
