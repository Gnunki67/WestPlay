import { describe, expect, it, afterEach, vi } from 'vitest'
import { POLISH, polishCount } from './polish'
import { languageOf, STRINGS } from './strings'
import { chooseLanguage, readLanguage, useInterfaceLanguage } from './language'
import { keyRows, capital } from '../keyboard/layouts'

afterEach(() => {
  useInterfaceLanguage.setState({ chosen: null })
  vi.unstubAllGlobals()
})

function shape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shape)
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, shape(entry)]))
  return typeof value
}

describe('complete Polish cabin translation', () => {
  it('covers every English screen and control without falling back to an English object', () => {
    expect(shape(POLISH)).toEqual(shape(STRINGS.en))
    expect(POLISH.apps.maps).toBe('Mapy')
    expect(POLISH.apps.weather).toBe('Pogoda')
    expect(POLISH.apps.settings).toBe('Ustawienia')
    expect(POLISH.apps.spotify).toBe('Spotify')
    expect(POLISH.apps.youtubeMusic).toBe('YouTube Music')
    expect(POLISH.apps.localRadio).toBe('Radio FM')
    expect(POLISH.roundabout(3)).toBe('Na rondzie wybierz 3. zjazd')
  })
  it.each([
    [1, '1 utwór'],
    [2, '2 utwory'],
    [5, '5 utworów'],
    [12, '12 utworów'],
    [22, '22 utwory'],
    [112, '112 utworów'],
  ])('uses the correct cardinal form for %s', (count, expected) => {
    expect(polishCount(Number(count), 'utwór', 'utwory', 'utworów')).toBe(expected)
  })
  it('recognizes Polish game codes and makes Polish letters available on the keyboard', () => {
    for (const code of ['pl_pl', 'pl_si', 'pl-PL']) expect(languageOf(code)).toBe('pl')
    expect(languageOf('tr_tr')).toBe('tr')
    expect(languageOf('en_gb')).toBe('en')
    const letters = keyRows('pl', 'letters')
      .flat()
      .flatMap((key) => (key.kind === 'char' ? [key.char] : []))
    for (const letter of 'ąćęłńóśźż') expect(letters).toContain(letter)
    expect(capital('ł', 'pl')).toBe('Ł')
  })
  it('persists the Settings language choice and rejects stale or unreadable values', () => {
    const saved = new Map<string, string>()
    const storage = {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => saved.set(key, value),
    }
    vi.stubGlobal('localStorage', storage)
    chooseLanguage('pl')
    expect(readLanguage(storage)).toBe('pl')
    expect(useInterfaceLanguage.getState().chosen).toBe('pl')
    chooseLanguage('en')
    expect(readLanguage(storage)).toBe('en')
    expect(readLanguage({ getItem: () => 'unknown' })).toBeNull()
    expect(
      readLanguage({
        getItem: () => {
          throw new Error('denied')
        },
      }),
    ).toBeNull()
  })
})
