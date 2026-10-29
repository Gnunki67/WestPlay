import { describe, expect, it, vi } from 'vitest'
import { ignitionPlayback, type IgnitionState } from './ignition'
import type { MusicPlayer } from './musicWithGame'

function fixture(saved: string | null = 'spotify') {
  const state: IgnitionState = { phase: 'off', enabled: true, available: true }
  const listeners = new Map<string, Set<(started: boolean) => void>>()
  const players = ['spotify', 'localRadio'].map((name): MusicPlayer => {
    listeners.set(name, new Set())
    return {
      name,
      playingHere: () => false,
      pauseHere() {},
      resumeHere() {},
      volume: () => 0.5,
      sendVolume() {},
      setVolume() {},
      subscribe(fn) {
        listeners.get(name)!.add(fn)
        return () => {
          listeners.get(name)!.delete(fn)
        }
      },
    }
  })
  const kept = {
    read: () => saved,
    write: vi.fn((name: string) => {
      saved = name
    }),
  }
  const resume = vi.fn(() => true)
  const prepare = vi.fn()
  const controller = ignitionPlayback(players, () => state, kept, resume, prepare)
  const phase = (phase: IgnitionState['phase']) => {
    state.phase = phase
    controller.changed()
  }
  return { state, players, kept, resume, prepare, controller, phase, listeners }
}

describe('automatic playback at ignition', () => {
  it('waits for both animations, resumes once, and repeats at each ignition', () => {
    const f = fixture()
    f.phase('splash')
    f.phase('connecting')
    expect(f.prepare).toHaveBeenCalledTimes(1)
    expect(f.resume).not.toHaveBeenCalled()
    f.phase('on')
    f.controller.changed()
    expect(f.resume).toHaveBeenCalledExactlyOnceWith(f.players[0])
    f.phase('off')
    f.phase('splash')
    f.phase('on')
    expect(f.resume).toHaveBeenCalledTimes(2)
  })
  it('remembers a different source and restores it in a new session', () => {
    const f = fixture()
    f.phase('on')
    for (const fn of f.listeners.get('localRadio')!) fn(true)
    expect(f.kept.write).toHaveBeenLastCalledWith('localRadio')
    f.phase('off')
    f.phase('on')
    expect(f.resume).toHaveBeenLastCalledWith(f.players[1])
    const fresh = fixture('localRadio')
    fresh.phase('on')
    expect(fresh.resume).toHaveBeenCalledWith(fresh.players[1])
  })
  it('does not play with the option disabled, nor start suddenly when enabled mid-drive', () => {
    const f = fixture()
    f.state.enabled = false
    f.phase('splash')
    f.phase('on')
    f.state.enabled = true
    f.controller.changed()
    expect(f.resume).not.toHaveBeenCalled()
    f.phase('off')
    f.phase('on')
    expect(f.resume).toHaveBeenCalledTimes(1)
  })
  it('waits while away, retries a player still loading, and cancels at power off', () => {
    const f = fixture()
    f.state.available = false
    f.phase('on')
    expect(f.resume).not.toHaveBeenCalled()
    f.state.available = true
    f.resume.mockReturnValue(false)
    f.controller.changed()
    expect(f.resume).toHaveBeenCalledTimes(1)
    f.resume.mockReturnValue(true)
    f.controller.changed()
    f.controller.changed()
    expect(f.resume).toHaveBeenCalledTimes(2)
    f.phase('off')
    f.controller.changed()
    expect(f.resume).toHaveBeenCalledTimes(2)
  })
  it('cancels a pending resume when another source is chosen manually', () => {
    const f = fixture()
    f.resume.mockReturnValue(false)
    f.phase('on')
    for (const fn of f.listeners.get('localRadio')!) fn(true)
    f.controller.changed()
    expect(f.resume).toHaveBeenCalledTimes(1)
    f.controller.stop()
    expect([...f.listeners.values()].every((listeners) => listeners.size === 0)).toBe(true)
  })
  it('ignores missing or unknown source history', () => {
    for (const source of [null, 'unknown']) {
      const f = fixture(source)
      f.phase('on')
      expect(f.resume).not.toHaveBeenCalled()
    }
  })
})
