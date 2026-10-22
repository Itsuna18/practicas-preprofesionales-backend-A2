import { describe, expect, it } from 'vitest'
import { type CandidateOffer, type StudentProfile, rankOffers, scoreOffer } from './recommendation'

function offer(overrides: Partial<CandidateOffer> = {}): CandidateOffer {
  return {
    id: 1,
    title: 'Practicante Backend — Acme',
    description: 'Desarrollo de APIs y servicios backend.',
    modality: 'HIBRIDA',
    seats: 3,
    acceptedCount: 0,
    publishedAt: new Date('2026-02-15'),
    companySector: 'Software',
    ...overrides,
  }
}

const software: StudentProfile = {
  career: 'Ingeniería de Software',
  interests: ['backend'],
  preferredModality: 'HIBRIDA',
}

describe('scoreOffer', () => {
  it('explains the career, interest and modality matches', () => {
    const result = scoreOffer(software, offer())!
    expect(result.reasons).toEqual([
      'Afín a Ingeniería de Software: software, backend',
      'Coincide con tus intereses: backend',
      'Modalidad híbrida, la que prefieres',
    ])
    expect(result.match).toBe(100)
    expect(result.seatsLeft).toBe(3)
  })

  it('does not recommend an offer that only matches the modality', () => {
    const result = scoreOffer(software, offer({ title: 'Asistente de campo', description: 'Cultivos', companySector: 'Agro' }))
    expect(result).toBeNull()
  })

  it('ignores accents and case when matching', () => {
    const profile: StudentProfile = { career: 'Ciencia de Datos', interests: [], preferredModality: null }
    const result = scoreOffer(profile, offer({ title: 'PRACTICANTE DE ANÁLISIS', description: 'Reportes', companySector: 'Salud' }))!
    expect(result.reasons[0]).toBe('Afín a Ciencia de Datos: analisis, reportes')
  })

  it('matches whole words only', () => {
    const profile: StudentProfile = { career: null, interests: ['agro'], preferredModality: null }
    expect(scoreOffer(profile, offer({ title: 'Agrónomo', description: 'Agroindustria', companySector: 'Manufactura' }))).toBeNull()
  })

  it('demotes offers without free seats and says so', () => {
    const open = scoreOffer(software, offer())!
    const full = scoreOffer(software, offer({ acceptedCount: 3 }))!
    expect(full.seatsLeft).toBe(0)
    expect(full.match).toBeLessThan(open.match)
    expect(full.reasons).toContain('Sin cupos libres por ahora')
  })

  it('works with an incomplete profile', () => {
    const result = scoreOffer({ career: null, interests: ['backend'], preferredModality: null }, offer())!
    expect(result.match).toBe(100)
    expect(scoreOffer({ career: null, interests: [], preferredModality: null }, offer())).toBeNull()
  })

  it('ignores an unknown career', () => {
    expect(scoreOffer({ career: 'Astronomía', interests: [], preferredModality: null }, offer())).toBeNull()
  })
})

describe('rankOffers', () => {
  it('sorts by match, then by most recent, and limits the list', () => {
    const offers = [
      offer({ id: 1, modality: 'PRESENCIAL', publishedAt: new Date('2026-02-01') }),
      offer({ id: 2 }),
      offer({ id: 3, modality: 'PRESENCIAL', publishedAt: new Date('2026-03-01') }),
      offer({ id: 4, title: 'Enfermero', description: 'Pacientes', companySector: 'Salud' }),
    ]
    expect(rankOffers(software, offers).map((r) => r.offerId)).toEqual([2, 3, 1])
    expect(rankOffers(software, offers, 1)).toHaveLength(1)
  })
})
