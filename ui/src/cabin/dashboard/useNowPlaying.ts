import { useEffect } from 'react'
import { command, useYouTube } from '../apps/youtube/youtube'
import { playOrPause, useSpotifySource } from '../apps/spotify/spotify'
import { playOrPause as playOrPauseAppleMusic, useAppleMusicSource } from '../apps/music/appleMusic'
import { playOrPause as playOrPauseYouTubeMusic, useYouTubeMusicSource } from '../apps/youtubeMusic/youtubeMusic'
import { type NowPlayingSource, shownSource } from './nowPlaying'
import { radioSource, toggleRadio, useRadio } from '../apps/localRadio/radio'

/** What Now Playing last showed playing, kept while the screens showing it come and go (nowPlaying.ts). */
let lastPlayed: NowPlayingSource | null = null

/** What Now Playing shows (`shownSource`): which player, and each player's own state (the screen showing it
 * draws it its own way: the Dashboard's widget, the Equalizer's track). */
export function useNowPlaying() {
  const spotify = useSpotifySource()
  const appleMusic = useAppleMusicSource()
  const youtubeMusic = useYouTubeMusicSource()
  const radio = useRadio()
  const localRadio = radioSource(radio)
  const video = useYouTube((store) => store.current)
  const videoPlaying = useYouTube((store) => store.state?.state === 1 && store.state.video === store.current?.video)
  const playing = {
    video: video !== null && videoPlaying,
    spotify: spotify?.source.status === 'playing',
    appleMusic: appleMusic?.source.status === 'playing',
    youtubeMusic: youtubeMusic?.source.status === 'playing',
    localRadio: radio.playing,
  }
  const has = {
    video: video !== null,
    spotify: Boolean(spotify),
    appleMusic: Boolean(appleMusic),
    youtubeMusic: Boolean(youtubeMusic),
    localRadio: Boolean(localRadio),
  }
  const showing = shownSource(playing, has, lastPlayed)
  const showingPlays = showing !== null && playing[showing]
  useEffect(() => {
    if (showing !== null && showingPlays) lastPlayed = showing
  }, [showing, showingPlays])
  return { showing, playing, spotify, appleMusic, youtubeMusic, video, localRadio }
}

/** The track Now Playing shows, as one line of a list draws it (the Equalizer's): its title, who it's by, its
 * cover, whether it plays, and playing or pausing it; `null`: nothing to show. */
export function useNowPlayingTrack(): {
  title: string
  by: string
  artwork: string | null
  playing: boolean
  playPause: (() => void) | null
} | null {
  const { showing, playing, spotify, appleMusic, youtubeMusic, video, localRadio } = useNowPlaying()
  const music = (
    player: { source: { title: string; artist: string; controls: { playPause: boolean } }; artwork: string | null },
    playPause: () => void,
    plays: boolean,
  ) => ({
    title: player.source.title,
    by: player.source.artist,
    artwork: player.artwork,
    playing: plays,
    playPause: player.source.controls.playPause ? playPause : null,
  })
  switch (showing) {
    case 'localRadio':
      return localRadio
        ? music({ source: localRadio, artwork: localRadio.artwork }, toggleRadio, playing.localRadio)
        : null
    case 'video':
      return video
        ? {
            title: video.title,
            by: video.channel,
            artwork: video.thumbnail,
            playing: playing.video,
            playPause: () => command({ action: playing.video ? 'pause' : 'play' }),
          }
        : null
    case 'spotify':
      return spotify ? music(spotify, playOrPause, playing.spotify) : null
    case 'appleMusic':
      return appleMusic ? music(appleMusic, playOrPauseAppleMusic, playing.appleMusic) : null
    case 'youtubeMusic':
      return youtubeMusic ? music(youtubeMusic, playOrPauseYouTubeMusic, playing.youtubeMusic) : null
    default:
      return null
  }
}
