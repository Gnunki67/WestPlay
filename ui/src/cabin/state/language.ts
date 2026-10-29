import { create } from 'zustand'

const KEY = 'westplay.interfaceLanguage'
export function readLanguage(storage?: Pick<Storage, 'getItem'>): 'en' | 'pl' | null {
  try {
    const value = (storage ?? localStorage).getItem(KEY)
    return value === 'en' || value === 'pl' ? value : null
  } catch {
    return null
  }
}
export const useInterfaceLanguage = create<{ chosen: 'en' | 'pl' | null }>(() => ({ chosen: readLanguage() }))
export function chooseLanguage(chosen: 'en' | 'pl') {
  useInterfaceLanguage.setState({ chosen })
  try {
    localStorage.setItem(KEY, chosen)
  } catch {
    /* Optional storage. */
  }
}
