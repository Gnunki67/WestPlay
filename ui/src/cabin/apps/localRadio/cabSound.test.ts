import { afterEach, expect, it, vi } from 'vitest'
import type { CabSound } from '../../../shared/host'

afterEach(() => vi.unstubAllGlobals())
it('routes radio and static through the shared speaker engine and keeps the graph stable as the head moves', async () => {
  vi.resetModules()
  const graphs = [0, 1].map(() => ({
    head: vi.fn(),
    speakers: vi.fn(),
    outside: vi.fn(),
    equalizer: vi.fn(),
    tick: vi.fn(),
  }))
  const media = [documentStub(), documentStub()]
  let index = 0
  vi.stubGlobal('window', {
    westplayCabSound: vi.fn((read: () => HTMLMediaElement) => {
      expect(read()).toBe(media[index])
      return graphs[index++]
    }),
  })
  const sound = await import('./cabSound')
  const state: CabSound = {
    head: { x: -0.4, y: 1.3, z: 0.2, heading: 0, pitch: 0 },
    speakers: [{ at: [-0.7, 0.8, 0], band: [0, 0], level: 0, channel: 'left', delay: 0 }],
    outside: false,
    distance: 0,
    equalizer: { bass: 0, mid: 0, treble: 0 },
  }
  sound.updateRadioSound(state)
  sound.attachRadioSound(...media)
  sound.attachRadioSound(...media)
  sound.updateRadioSound({ ...state, speakers: JSON.parse(JSON.stringify(state.speakers)), outside: true, distance: 8 })
  sound.tickRadioSound()
  for (const graph of graphs) {
    expect(graph.speakers.mock.calls[0][0]).toBe(graph.speakers.mock.calls[1][0])
    expect(graph.outside).toHaveBeenLastCalledWith(true, 8)
    expect(graph.tick).toHaveBeenCalledOnce()
    expect(graph.equalizer).toHaveBeenLastCalledWith(state.equalizer)
  }
  expect(index).toBe(2)
})
function documentStub(): HTMLMediaElement {
  return {} as HTMLMediaElement
}
