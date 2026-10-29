import type { MusicPlayer } from './musicWithGame'
import type { PowerPhase } from '../state/power'

export interface IgnitionState {
  phase: PowerPhase
  enabled: boolean
  available: boolean
}

/** One resume per ignition, after the whole boot sequence and when the game is playable. */
export function ignitionPlayback(
  players: readonly MusicPlayer[],
  read: () => IgnitionState,
  kept: { read(): string | null; write(name: string): void },
  resume: (player: MusicPlayer) => boolean,
  prepare: (player: MusicPlayer) => void,
) {
  let last = kept.read()
  let phase: PowerPhase = 'off'
  let pending = false
  let prepared = false
  let attempting = false
  let expires = Infinity
  const stops = players.map((player) =>
    player.subscribe((started) => {
      if (!started || read().phase !== 'on') return
      last = player.name
      kept.write(last)
      pending = false
    }),
  )
  return {
    changed() {
      const state = read()
      if (state.phase === 'off') {
        phase = 'off'
        pending = false
        prepared = false
        return
      }
      if (phase === 'off') {
        pending = state.enabled
        expires = Infinity
      }
      phase = state.phase
      if (!state.enabled) pending = false
      const player = players.find((player) => player.name === last)
      if (!pending || !player || attempting) return
      if (!prepared) {
        prepared = true
        prepare(player)
      }
      if (phase !== 'on' || !state.available) return
      if (expires === Infinity) expires = Date.now() + 30000
      if (Date.now() > expires) {
        pending = false
        return
      }
      if (players.some((player) => player.playingHere())) {
        pending = false
        return
      }
      attempting = true
      // Reserve before sending: players can report playing synchronously.
      pending = false
      try {
        if (!resume(player)) pending = true
      } finally {
        attempting = false
      }
    },
    stop() {
      for (const stop of stops) stop()
    },
  }
}
