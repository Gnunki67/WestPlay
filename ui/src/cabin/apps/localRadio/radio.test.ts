import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../state/store', () => ({ useLive: { getState: () => ({ telemetry: null }), subscribe: () => () => {} } }))

class AudioStub extends EventTarget {
  static instances: AudioStub[] = []
  volume = 1
  src = ''
  preload = ''
  loop = false
  constructor(_src?: string) {
    super()
    AudioStub.instances.push(this)
  }
  play() {
    return Promise.resolve()
  }
  pause() {
    this.dispatchEvent(new Event('pause'))
  }
  load() {}
  removeAttribute(_name: string) {
    this.src = ''
  }
}
beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  AudioStub.instances = []
  vi.stubGlobal('Audio', AudioStub)
  vi.stubGlobal('window', {})
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() })
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
const station = { name: 'Test FM', url: 'https://example.test/radio.mp3' }

describe('Local Radio playback lifecycle', () => {
  it('uses a same-origin stream inside the host so stations without CORS can use 3D audio', async () => {
    vi.stubGlobal('window', { chrome: { webview: {} } })
    vi.stubGlobal('location', { origin: 'http://127.0.0.1:18331', search: '' })
    const radio = await import('./radio')
    expect(radio.streamUrl(station.url)).toBe(
      `http://127.0.0.1:18331/radio-stream?url=${encodeURIComponent(station.url)}`,
    )
  })
  it('lets the volume slider take over after a game fade', async () => {
    const radio = await import('./radio')
    radio.tune('poland', station)
    radio.radioPlayer.sendVolume(0.1)
    expect(AudioStub.instances[0].volume).toBe(0.1)
    radio.radioPreference({ volume: 0.45 })
    expect(AudioStub.instances[0].volume).toBe(0.45)
    expect(radio.radioPlayer.volume()).toBe(0.45)
    radio.pauseRadio()
  })
  it('can stop a station that is still connecting, including from the game power controls', async () => {
    const radio = await import('./radio')
    radio.tune('poland', station)
    expect(radio.useRadio.getState().loading).toBe(true)
    expect(radio.radioPlayer.playingHere()).toBe(true)
    radio.radioPlayer.pauseHere()
    expect(radio.radioPlayer.playingHere()).toBe(false)
    expect(radio.useRadio.getState().loading).toBe(false)
    AudioStub.instances[0].dispatchEvent(new Event('playing'))
    expect(radio.useRadio.getState().playing).toBe(false)
  })
  it('reports a silent connection timeout and lets the user choose another station', async () => {
    const radio = await import('./radio')
    radio.tune('poland', station)
    vi.advanceTimersByTime(20001)
    expect(radio.useRadio.getState().error).toBe('timeout')
    expect(radio.useRadio.getState().loading).toBe(false)
    radio.tune('poland', { ...station, name: 'Another FM' })
    expect(radio.useRadio.getState().error).toBeNull()
    expect(radio.useRadio.getState().current?.station.name).toBe('Another FM')
    radio.pauseRadio()
  })
})
