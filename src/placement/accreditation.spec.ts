import { describe, expect, it } from 'vitest'
import { calculateAccreditationStatus } from './accreditation'
import type { AccreditationInput, AccreditationLevel } from './accreditation'

const base = {
  placementId: 1,
  studentName: 'Estudiante 0',
  requiredHours: 240,
  approvedHours: 240,
  pendingHours: 0,
  hasAgreement: true,
  hasInsurance: true,
  hasFinalReport: true,
  tutorEvaluationScore: 4.5,
  companyEvaluationScore: 4.2,
  placementStatus: 'COMPLETED',
}

describe('calculateAccreditationStatus', () => {
  const cases: [string, Partial<AccreditationInput>, AccreditationLevel, string[]][] = [
    ['abandoned without pending hours', { placementStatus: 'ABANDONED' }, 'NO_ACREDITADO', ['placement abandonado']],
    ['abandoned with pending hours', { placementStatus: 'ABANDONED', pendingHours: 12 }, 'NO_ACREDITADO',
      ['placement abandonado', 'hay 12 horas pendientes sin revisar']],
    ['suspended without agreement', { placementStatus: 'SUSPENDED', hasAgreement: false }, 'NO_ACREDITADO', ['placement suspendido']],
    ['suspended with agreement', { placementStatus: 'SUSPENDED' }, 'NO_ACREDITADO',
      ['placement suspendido', 'convenio vigente pese a la suspensión']],
    ['insufficient hours without pending hours', { approvedHours: 120 }, 'PENDIENTE', ['horas insuficientes']],
    ['insufficient hours with pending hours', { approvedHours: 120, pendingHours: 12 }, 'PENDIENTE',
      ['horas insuficientes', 'hay 12 horas pendientes de aprobación']],
    ['missing agreement and insurance', { hasAgreement: false, hasInsurance: false }, 'NO_ACREDITADO', ['falta convenio']],
    ['missing agreement with insurance', { hasAgreement: false }, 'NO_ACREDITADO',
      ['falta convenio', 'seguro vigente pese a la falta de convenio']],
    ['missing insurance without pending hours', { hasInsurance: false }, 'NO_ACREDITADO', ['falta seguro']],
    ['missing insurance with pending hours', { hasInsurance: false, pendingHours: 12 }, 'NO_ACREDITADO',
      ['falta seguro', 'hay 12 horas pendientes de aprobación']],
    ['missing final report', { hasFinalReport: false }, 'PENDIENTE', ['falta informe final']],
    ['missing tutor evaluation', { tutorEvaluationScore: null }, 'PENDIENTE', ['falta evaluación del tutor']],
    ['tutor below minimum', { tutorEvaluationScore: 2.99 }, 'NO_ACREDITADO',
      ['evaluación del tutor por debajo del mínimo', 'informe final entregado pese a evaluación baja']],
    ['missing company evaluation', { companyEvaluationScore: null }, 'ACREDITADO_CON_OBSERVACIONES',
      ['falta evaluación de la empresa o es baja']],
    ['company below minimum', { companyEvaluationScore: 2.99 }, 'ACREDITADO_CON_OBSERVACIONES',
      ['falta evaluación de la empresa o es baja']],
    ['complete placement', {}, 'ACREDITADO', []],
  ]

  it.each(cases)('%s', (_name, overrides, level, reasons) => {
    const input = { ...base, ...overrides }

    expect(calculateAccreditationStatus(input)).toEqual({
      placementId: input.placementId,
      studentName: input.studentName,
      level,
      reasons,
      completionPercentage: input.approvedHours === 120 ? 50 : 100,
    })
  })

  it('accepts scores and hours exactly at their minimum', () => {
    expect(calculateAccreditationStatus({ ...base, tutorEvaluationScore: 3, companyEvaluationScore: 3 })).toEqual({
      placementId: 1, studentName: 'Estudiante 0', level: 'ACREDITADO', reasons: [], completionPercentage: 100,
    })
  })

  it.each([
    [239, 240, 100, 'PENDIENTE', ['horas insuficientes']],
    [1, 3, 33, 'PENDIENTE', ['horas insuficientes']],
    [2, 3, 67, 'PENDIENTE', ['horas insuficientes']],
    [1, 8, 13, 'PENDIENTE', ['horas insuficientes']],
    [300, 240, 125, 'ACREDITADO', []],
    [240, 0, Infinity, 'ACREDITADO', []],
    [0, 0, NaN, 'ACREDITADO', []],
  ])('returns current percentage for %s approved / %s required hours',
    (approvedHours, requiredHours, completionPercentage, level, reasons) => {
      expect(calculateAccreditationStatus({ ...base, approvedHours, requiredHours })).toEqual({
        placementId: 1, studentName: 'Estudiante 0', level, reasons, completionPercentage,
      })
    })

  it('preserves the placement identity', () => {
    const result = calculateAccreditationStatus({ ...base, placementId: 52, studentName: 'María Ñauta' })

    expect(result.placementId).toBe(52)
    expect(result.studentName).toBe('María Ñauta')
  })

  it('prioritizes insufficient hours over missing documents and evaluations', () => {
    const result = calculateAccreditationStatus({
      ...base, approvedHours: 0, hasAgreement: false, hasInsurance: false,
      hasFinalReport: false, tutorEvaluationScore: null, companyEvaluationScore: null,
    })

    expect(result).toEqual({
      placementId: 1, studentName: 'Estudiante 0', level: 'PENDIENTE',
      reasons: ['horas insuficientes'], completionPercentage: 0,
    })
  })

  it('accredits a placement with all hours, documents and evaluations', () => {
    const result = calculateAccreditationStatus(base)

    expect(result.level).toBe('ACREDITADO')
    expect(result.reasons).toHaveLength(0)
    expect(result.completionPercentage).toBe(100)
  })

  it('marks as PENDIENTE when hours are still missing', () => {
    const result = calculateAccreditationStatus({ ...base, approvedHours: 120, pendingHours: 40, placementStatus: 'ACTIVE' })

    expect(result.level).toBe('PENDIENTE')
    expect(result.reasons).toContain('horas insuficientes')
    expect(result.completionPercentage).toBe(50)
  })
})
