import { CAREERS, normalize } from './catalog'

export interface StudentProfile {
  career: string | null
  interests: string[]
  preferredModality: string | null
}

export interface CandidateOffer {
  id: number
  title: string
  description: string
  modality: string
  seats: number
  acceptedCount: number
  publishedAt: Date | null
  companySector: string
}

export interface Recommendation {
  offerId: number
  /** Coincidencia de 0 a 100, para mostrar al estudiante. */
  match: number
  seatsLeft: number
  /** Por qué se recomienda, en frases cortas que se muestran tal cual. */
  reasons: string[]
}

// Pesos de cada señal. Una oferta solo se recomienda si coincide con la
// carrera o con algún interés: la modalidad por sí sola no basta.
const CAREER_HIT = 3
const MAX_CAREER_HITS = 2
const INTEREST_HIT = 2
const MAX_INTEREST_HITS = 3
const MODALITY_HIT = 1.5
const FULL_OFFER_FACTOR = 0.5

const MODALITY_LABEL: Record<string, string> = {
  PRESENCIAL: 'presencial',
  HIBRIDA: 'híbrida',
  REMOTA: 'remota',
}

function containsWord(text: string, word: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${word}([^a-z0-9]|$)`).test(text)
}

function offerText(offer: CandidateOffer): string {
  return normalize(`${offer.title} ${offer.description} ${offer.companySector}`)
}

/** Puntaje que tendría una oferta perfecta para este perfil. */
function maxScoreFor(profile: StudentProfile, careerWords: string[]): number {
  const career = careerWords.length > 0 ? MAX_CAREER_HITS * CAREER_HIT : 0
  const interests = Math.min(profile.interests.length, MAX_INTEREST_HITS) * INTEREST_HIT
  const modality = profile.preferredModality ? MODALITY_HIT : 0
  return career + interests + modality
}

export function scoreOffer(profile: StudentProfile, offer: CandidateOffer): Recommendation | null {
  const text = offerText(offer)
  const reasons: string[] = []
  let score = 0

  const careerWords = profile.career ? (CAREERS[profile.career] ?? []) : []
  const careerHits = careerWords.filter((word) => containsWord(text, normalize(word))).slice(0, MAX_CAREER_HITS)
  if (careerHits.length > 0) {
    score += careerHits.length * CAREER_HIT
    reasons.push(`Afín a ${profile.career}: ${careerHits.join(', ')}`)
  }

  const interestHits = profile.interests
    .filter((interest) => containsWord(text, normalize(interest)))
    .slice(0, MAX_INTEREST_HITS)
  if (interestHits.length > 0) {
    score += interestHits.length * INTEREST_HIT
    reasons.push(`Coincide con tus intereses: ${interestHits.join(', ')}`)
  }

  if (score === 0) return null

  if (profile.preferredModality && offer.modality === profile.preferredModality) {
    score += MODALITY_HIT
    reasons.push(`Modalidad ${MODALITY_LABEL[offer.modality] ?? offer.modality}, la que prefieres`)
  }

  const seatsLeft = Math.max(0, offer.seats - offer.acceptedCount)
  if (seatsLeft === 0) {
    score *= FULL_OFFER_FACTOR
    reasons.push('Sin cupos libres por ahora')
  }

  const match = Math.min(100, Math.round((score / maxScoreFor(profile, careerWords)) * 100))

  return { offerId: offer.id, match, seatsLeft, reasons }
}

/** Ofertas ordenadas de mayor a menor coincidencia; a igualdad, la más reciente primero. */
export function rankOffers(
  profile: StudentProfile,
  offers: CandidateOffer[],
  limit = 6,
): Recommendation[] {
  const published = new Map(offers.map((offer) => [offer.id, offer.publishedAt?.getTime() ?? 0]))
  return offers
    .map((offer) => scoreOffer(profile, offer))
    .filter((rec): rec is Recommendation => rec !== null)
    .sort((a, b) => b.match - a.match || (published.get(b.offerId) ?? 0) - (published.get(a.offerId) ?? 0))
    .slice(0, limit)
}
