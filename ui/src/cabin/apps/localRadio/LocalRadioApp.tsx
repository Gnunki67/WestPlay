import { useState } from 'react'
import { NextGlyph, PauseGlyph, PlayGlyph, PreviousGlyph } from '../music/glyphs'
import { availableStations } from './reception'
import { favourite, loadRadio, logo, nextRadio, radioPreference, toggleRadio, tune, useRadio } from './radio'
import './radio.css'
import { TextField } from '../../keyboard/TextField'
import { useLanguage } from '../../state/text'
import { RADIO_WORDS } from './words'

export function LocalRadioApp() {
  const state = useRadio()
  const language = useLanguage()
  const w = RADIO_WORDS[language === 'pl' ? 'pl' : 'en']
  const [query, setQuery] = useState('')
  const [onlyFavourites, setOnlyFavourites] = useState(false)
  const { data, nearby, current, connected, loading, playing } = state
  const rows = data
    ? availableStations(data, nearby).filter(
        ({ country, station }) =>
          (!onlyFavourites || state.favourites[country] === station.name) &&
          `${station.name} ${data.countries[country]?.name ?? country}`
            .toLocaleLowerCase()
            .includes(query.toLocaleLowerCase()),
      )
    : []
  const reception = nearby.find((entry) => entry.country === current?.country) ?? nearby[0]
  const countryName = data?.countries[reception?.country]?.name ?? ''
  const artwork = current && logo(current.station)
  return (
    <section className="app-panel radio-app" aria-label="Radio FM">
      <header className="radio-header">
        <div>
          <span className="radio-kicker">{w.kicker}</span>
          <h1>Radio FM</h1>
        </div>
        <span className={`radio-signal ${connected ? 'connected' : ''}`}>
          {connected ? `${countryName} · ${reception?.city ?? ''}` : w.waiting}
        </span>
      </header>
      <div className="radio-layout">
        <aside className="radio-tuner">
          <div className={`radio-art ${playing ? 'playing' : ''}`}>
            {artwork ? (
              <img
                src={artwork}
                alt=""
                onError={(event) => {
                  event.currentTarget.style.visibility = 'hidden'
                }}
              />
            ) : (
              <span aria-hidden>FM</span>
            )}
          </div>
          <span className="radio-kicker">{loading ? w.connecting : playing ? w.live : 'RADIO FM'}</span>
          <h2>{current?.station.name ?? w.choose}</h2>
          <p>{current ? (data?.countries[current.country]?.name ?? current.country) : w.available}</p>
          <div className="radio-playback">
            <button aria-label={w.previous} onClick={() => nextRadio(-1)} disabled={!rows.length}>
              <PreviousGlyph size={28} />
            </button>
            <button
              className="radio-play"
              aria-label={playing || loading ? w.pause : w.play}
              onClick={toggleRadio}
              disabled={!connected}
            >
              {playing || loading ? <PauseGlyph size={34} /> : <PlayGlyph size={34} />}
            </button>
            <button aria-label={w.next} onClick={() => nextRadio(1)} disabled={!rows.length}>
              <NextGlyph size={28} />
            </button>
          </div>
          <label className="radio-volume">
            {w.volume} <output>{Math.round(state.volume * 100)}%</output>
            <input
              aria-label={w.volume}
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={state.volume}
              onChange={(event) => radioPreference({ volume: Number(event.target.value) })}
            />
          </label>
          <details className="radio-settings">
            <summary>{w.settings}</summary>
            <label className="radio-option">
              <input
                type="checkbox"
                checked={state.auto}
                onChange={(event) => radioPreference({ auto: event.target.checked })}
              />
              {w.auto}
            </label>
            <label className="radio-option">
              <input
                type="checkbox"
                checked={state.noise}
                onChange={(event) => radioPreference({ noise: event.target.checked })}
              />
              {w.noise}
            </label>
          </details>
          {reception && (
            <small>
              {w.reception}: {Math.round(Math.max(0, 1 - reception.noise) * 100)}% · {w.transmitter}{' '}
              {(reception.distance / 1000).toFixed(1)} km
            </small>
          )}
        </aside>
        <div className="radio-browser">
          <div className="radio-toolbar">
            <TextField
              id="local-radio-search"
              label={w.search}
              hint={w.searchHint}
              value={query}
              onChange={setQuery}
              returnKind="search"
            />
            <button
              className={onlyFavourites ? 'selected' : ''}
              aria-pressed={onlyFavourites}
              onClick={() => setOnlyFavourites(!onlyFavourites)}
            >
              ♥
            </button>
          </div>
          <div className="radio-list" role="list" aria-label={w.stations}>
            {rows.map(({ country, station }) => (
              <div
                role="listitem"
                className={`radio-station ${current?.country === country && current.station.url === station.url ? 'selected' : ''}`}
                key={`${country}:${station.name}:${station.url}`}
              >
                <button className="radio-station-tune" onClick={() => tune(country, station)}>
                  {logo(station) ? (
                    <img
                      src={logo(station)!}
                      alt=""
                      loading="lazy"
                      onError={(event) => {
                        event.currentTarget.style.visibility = 'hidden'
                      }}
                    />
                  ) : (
                    <span className="radio-mini-art">FM</span>
                  )}
                  <span>
                    <b>{station.name}</b>
                    <small>{data?.countries[country]?.name ?? country}</small>
                  </span>
                  {current?.station.url === station.url && <span className="radio-live">{playing ? w.live : '•'}</span>}
                </button>
                <button
                  className="radio-favourite"
                  aria-label={`${w.favourite}: ${station.name}`}
                  aria-pressed={state.favourites[country] === station.name}
                  onClick={() => favourite(country, station)}
                >
                  {state.favourites[country] === station.name ? '♥' : '♡'}
                </button>
              </div>
            ))}
            {!rows.length && (
              <div className="radio-empty">
                <b>{connected ? w.noResults : w.drive}</b>
                <p>{connected ? w.filterHint : w.driveHint}</p>
              </div>
            )}
          </div>
          {state.error && (
            <div className="radio-error" role="alert">
              {w.errors[state.error]} {!data && <button onClick={() => void loadRadio()}>{w.retry}</button>}
            </div>
          )}
          <footer>
            Radio FM · {rows.length} {w.inRange} · ♥ {w.favouriteHint}
          </footer>
        </div>
      </div>
    </section>
  )
}
