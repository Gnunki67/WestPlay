import { type Language, languageOf, STRINGS, type Strings } from './strings'
import { useLive } from './store'
import { useInterfaceLanguage } from './language'

export type { Language, Strings } from './strings'

/** The cabin's language: the game's. */
export function useLanguage(): Language {
  const chosen = useInterfaceLanguage((state) => state.chosen)
  const gameLanguage = useLive((state) => state.gameLanguage)
  return chosen ?? languageOf(gameLanguage)
}

/** The cabin's words, in the game's language. */
export function useText(): Strings {
  return STRINGS[useLanguage()]
}
