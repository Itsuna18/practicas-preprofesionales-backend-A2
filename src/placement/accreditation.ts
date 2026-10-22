export interface AccreditationInput {
  placementId: number
  studentName: string
  requiredHours: number
  approvedHours: number
  pendingHours: number
  hasAgreement: boolean
  hasInsurance: boolean
  hasFinalReport: boolean
  tutorEvaluationScore: number | null
  companyEvaluationScore: number | null
  placementStatus: string
}

export type AccreditationLevel =
  | 'ACREDITADO'
  | 'ACREDITADO_CON_OBSERVACIONES'
  | 'PENDIENTE'
  | 'NO_ACREDITADO'

export interface AccreditationResult {
  placementId: number
  studentName: string
  level: AccreditationLevel
  reasons: string[]
  completionPercentage: number
}

interface AccreditationDecision {
  level: AccreditationLevel
  reasons: string[]
}

interface AccreditationRule {
  description: string
  condition: (input: AccreditationInput) => boolean
  evaluate: (input: AccreditationInput) => AccreditationDecision
}

const ACCREDITATION_RULES: AccreditationRule[] = [
  {
    description: 'Práctica abandonada',
    condition: (i) => i.placementStatus === 'ABANDONED',
    evaluate: (i) => ({
      level: 'NO_ACREDITADO',
      reasons: [
        'placement abandonado',
        ...(i.pendingHours > 0 ? [`hay ${i.pendingHours} horas pendientes sin revisar`] : []),
      ],
    }),
  },
  {
    description: 'Práctica suspendida',
    condition: (i) => i.placementStatus === 'SUSPENDED',
    evaluate: (i) => ({
      level: 'NO_ACREDITADO',
      reasons: [
        'placement suspendido',
        ...(i.hasAgreement ? ['convenio vigente pese a la suspensión'] : []),
      ],
    }),
  },
  {
    description: 'Horas insuficientes',
    condition: (i) => i.approvedHours < i.requiredHours,
    evaluate: (i) => ({
      level: 'PENDIENTE',
      reasons: [
        'horas insuficientes',
        ...(i.pendingHours > 0 ? [`hay ${i.pendingHours} horas pendientes de aprobación`] : []),
      ],
    }),
  },
  {
    description: 'Falta convenio',
    condition: (i) => !i.hasAgreement,
    evaluate: (i) => ({
      level: 'NO_ACREDITADO',
      reasons: [
        'falta convenio',
        ...(i.hasInsurance ? ['seguro vigente pese a la falta de convenio'] : []),
      ],
    }),
  },
  {
    description: 'Falta seguro',
    condition: (i) => !i.hasInsurance,
    evaluate: (i) => ({
      level: 'NO_ACREDITADO',
      reasons: [
        'falta seguro',
        ...(i.pendingHours > 0 ? [`hay ${i.pendingHours} horas pendientes de aprobación`] : []),
      ],
    }),
  },
  {
    description: 'Falta informe final',
    condition: (i) => !i.hasFinalReport,
    evaluate: () => ({
      level: 'PENDIENTE',
      reasons: ['falta informe final'],
    }),
  },
  {
    description: 'Falta evaluación del tutor',
    condition: (i) => i.tutorEvaluationScore === null,
    evaluate: () => ({
      level: 'PENDIENTE',
      reasons: ['falta evaluación del tutor'],
    }),
  },
  {
    description: 'Evaluación del tutor por debajo del mínimo',
    condition: (i) => i.tutorEvaluationScore! < 3,
    evaluate: (i) => ({
      level: 'NO_ACREDITADO',
      reasons: [
        'evaluación del tutor por debajo del mínimo',
        ...(i.hasFinalReport ? ['informe final entregado pese a evaluación baja'] : []),
      ],
    }),
  },
  {
    description: 'Falta evaluación de la empresa o es baja',
    condition: (i) => i.companyEvaluationScore === null || i.companyEvaluationScore < 3,
    evaluate: () => ({
      level: 'ACREDITADO_CON_OBSERVACIONES',
      reasons: ['falta evaluación de la empresa o es baja'],
    }),
  },
]

const DEFAULT_ACCREDITED: AccreditationDecision = {
  level: 'ACREDITADO',
  reasons: [],
}

export function calculateAccreditationStatus(input: AccreditationInput): AccreditationResult {
  const percentage = Math.round((input.approvedHours / input.requiredHours) * 100)
  const matchedRule = ACCREDITATION_RULES.find((rule) => rule.condition(input))
  const decision = matchedRule ? matchedRule.evaluate(input) : DEFAULT_ACCREDITED

  return {
    placementId: input.placementId,
    studentName: input.studentName,
    level: decision.level,
    reasons: decision.reasons,
    completionPercentage: percentage,
  }
}
