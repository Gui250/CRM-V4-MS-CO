const DIACRITICS = /\p{M}/gu
const TRAILING_PUNCTUATION = /[\s.!?,;:]+$/u

/** Lowercase, no accents, trimmed: how keywords, conditions and opt-out words are compared. */
export const normalizeText = (text: string) => text.normalize('NFD').replace(DIACRITICS, '').toLowerCase().trim()

export const OPT_OUT_WORDS = new Set(['parar', 'sair', 'descadastrar'])

/** Only the whole message counts: "não quero sair agora" is not an opt-out (research §9). */
export const isOptOutMessage = (text: string) => OPT_OUT_WORDS.has(normalizeText(text).replace(TRAILING_PUNCTUATION, ''))

export const containsAnyKeyword = (text: string, keywords: readonly string[]) => {
  const normalized = normalizeText(text)
  return keywords.some((keyword) => normalized.includes(normalizeText(keyword)))
}
