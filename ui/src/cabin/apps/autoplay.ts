import { isInHost } from '../../shared/host'
import { useCabin, useLive } from '../state/store'
import { spotify, useSpotify, currentTrack, startWebPlayer as startSpotify } from './spotify/spotify'
import { appleMusic, useAppleMusic } from './music/appleMusic'
import { youtubeMusic, useYouTubeMusic, startWebPlayer as startYouTubeMusic } from './youtubeMusic/youtubeMusic'
import { useYouTube, play } from './youtube/youtube'
import { radioPlayer, useRadio } from './localRadio/radio'
import { spotifyPlayer } from './spotify/pauseWithGame'
import { appleMusicPlayer } from './music/pauseWithGame'
import { youtubeMusicPlayer } from './youtubeMusic/pauseWithGame'
import { youtubePlayer } from './youtube/pauseWithGame'
import { ignitionPlayback } from './ignition'
import type { MusicPlayer } from './musicWithGame'

export const MUSIC_PLAYERS = [youtubePlayer, spotifyPlayer, appleMusicPlayer, youtubeMusicPlayer, radioPlayer]
const KEY = 'westplay.lastMusicSource'
const CONTEXT = 'westplay.lastMusicContext.'
function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function write(key: string, value: string) {
  try {
    if (localStorage.getItem(key) !== value) localStorage.setItem(key, value)
  } catch {
    /* optional storage */
  }
}

/** Keep just playable IDs, never account details. Service players restore their own queue within a session. */
function remember(player: MusicPlayer) {
  if (!player.playingHere()) return
  if (player === spotifyPlayer) {
    const playback = useSpotify.getState().playback
    const track = currentTrack(playback)
    if (track) write(CONTEXT + player.name, JSON.stringify({ track: track.uri, context: playback?.context?.uri }))
  } else if (player === appleMusicPlayer) {
    const playback = useAppleMusic.getState().playback
    const track = playback?.tracks[playback.index]
    if (track) write(CONTEXT + player.name, track.id)
  } else if (player === youtubeMusicPlayer) {
    const video = useYouTubeMusic.getState().playback?.track.video
    if (video) write(CONTEXT + player.name, video)
  }
}
function prepare(player: MusicPlayer) {
  if (!isInHost()) return
  if (player === spotifyPlayer) startSpotify()
  else if (player === appleMusicPlayer) appleMusic({ action: 'start' })
  else if (player === youtubeMusicPlayer) startYouTubeMusic()
}
function resume(player: MusicPlayer): boolean {
  if (player === radioPlayer) {
    if (!useRadio.getState().connected || !useRadio.getState().data) return false
  } else if (player === spotifyPlayer && !useSpotify.getState().playback?.here) {
    if (useSpotify.getState().signedIn !== true) return false
    const saved = read(CONTEXT + player.name)
    try {
      const context = JSON.parse(saved ?? '{}') as { track?: string; context?: string }
      if (context.track?.startsWith('spotify:')) spotify({ action: 'play', ...context })
    } catch {
      /* no valid previous song */
    }
    return true
  } else if (player === appleMusicPlayer && !useAppleMusic.getState().playback) {
    if (useAppleMusic.getState().signedIn !== true) return false
    const id = read(CONTEXT + player.name)
    if (id) appleMusic({ action: 'play', id })
    return true
  } else if (player === youtubeMusicPlayer && !useYouTubeMusic.getState().playback) {
    if (useYouTubeMusic.getState().playing === null) return false
    const video = read(CONTEXT + player.name)
    if (video) youtubeMusic({ action: 'play', watch: { video } })
    return true
  } else if (player === youtubePlayer && !useYouTube.getState().current) {
    const watched = useYouTube.getState().watched[0]
    if (watched) play(watched.video, false)
    return true
  }
  player.resumeHere()
  return true
}

/** Both Settings windows change the host's one autoplay setting; source history stays in the cab. */
export function followAutoplay(): () => void {
  const controller = ignitionPlayback(
    MUSIC_PLAYERS,
    () => {
      const live = useLive.getState()
      return {
        phase: useCabin.getState().power.phase,
        enabled: useCabin.getState().autoplay,
        available: Boolean(live.telemetry) && live.gameFocused && (!live.telemetry?.paused || live.menuGone),
      }
    },
    { read: () => read(KEY), write: (name) => write(KEY, name) },
    resume,
    prepare,
  )
  const changed = () => controller.changed()
  const stops = [
    useCabin.subscribe(changed),
    useLive.subscribe(changed),
    ...MUSIC_PLAYERS.map((player) =>
      player.subscribe(() => {
        remember(player)
        changed()
      }),
    ),
  ]
  const timer = setInterval(changed, 500)
  changed()
  return () => {
    clearInterval(timer)
    controller.stop()
    for (const stop of stops) stop()
  }
}
