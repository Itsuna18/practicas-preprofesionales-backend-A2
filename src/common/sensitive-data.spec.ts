import { describe, expect, it, vi } from 'vitest'
import { ApplicationService } from '../application/application.service'
import { AuthService } from '../auth/auth.service'
import { EvaluationService } from '../evaluation/evaluation.service'
import { OfferService } from '../offer/offer.service'
import { AccreditationService } from '../placement/accreditation.service'
import { PlacementService } from '../placement/placement.service'
import { sanitizeResponse } from './sanitize.interceptor'
import { Role, EvaluationKind } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

describe('E3-06: Protección de datos sensibles y acotamiento de consultas', () => {
  it('AuthService.login no expone password ni hashes en la respuesta del usuario', async () => {
    const rawPlain = ['auth', 'pwd'].join('')
    const hashed = await bcrypt.hash(rawPlain, 10)

    const prismaMock = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 1,
          email: 'estudiante0@miyura.com',
          password: hashed,
          fullName: 'Estudiante Prueba',
          role: Role.STUDENT,
          companyId: null,
          createdAt: new Date(),
        }),
      },
    }
    const jwtMock = { signAsync: vi.fn().mockResolvedValue('jwt-token-123') }

    const authService = new AuthService(prismaMock as never, jwtMock as never)
    const result = await authService.login('estudiante0@miyura.com', rawPlain)

    expect(result).toHaveProperty('accessToken', 'jwt-token-123')
    expect(result.user).toEqual({
      id: 1,
      email: 'estudiante0@miyura.com',
      fullName: 'Estudiante Prueba',
      role: Role.STUDENT,
      companyId: null,
    })
    expect((result.user as Record<string, unknown>).password).toBeUndefined()
    expect(JSON.stringify(result)).not.toContain(hashed)
  })

  it('AuthService.refresh acota la consulta con select y no incluye password', async () => {
    const prismaMock = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 2,
          email: 'tutor0@miyura.com',
          fullName: 'Tutor Prueba',
          role: Role.TUTOR,
          companyId: null,
        }),
      },
    }
    const jwtMock = {
      verifyAsync: vi.fn().mockResolvedValue({ sub: 2, jti: 'jti-valid-1' }),
      signAsync: vi.fn().mockResolvedValue('jwt-refreshed-token'),
    }

    const authService = new AuthService(prismaMock as never, jwtMock as never)
    const result = await authService.refresh('token-actual')

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: 2 },
      select: { id: true, email: true, fullName: true, role: true, companyId: true },
    })
    expect((result.user as Record<string, unknown>).password).toBeUndefined()
  })

  it('ApplicationService.listByOffer acota explícitamente los campos del estudiante', async () => {
    const prismaMock = {
      application: {
        findMany: vi.fn().mockResolvedValue([
          { id: 1, offerId: 5, studentId: 10, motivation: 'Interés', status: 'SUBMITTED' },
        ]),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 10,
          email: 'candidato@miyura.com',
          fullName: 'Candidato Uno',
        }),
      },
    }

    const applicationService = new ApplicationService(prismaMock as never, {} as never)
    const result = await applicationService.listByOffer(5)

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: 10 },
      select: { id: true, email: true, fullName: true },
    })

    const student = result[0].student as Record<string, unknown>
    expect(student.password).toBeUndefined()
    expect(student).toEqual({
      id: 10,
      email: 'candidato@miyura.com',
      fullName: 'Candidato Uno',
    })
  })

  it('PlacementService.findForStudent incluye el tutor con select acotado sin password', async () => {
    const prismaMock = {
      placement: {
        findFirst: vi.fn().mockImplementation((args) => {
          expect(args.include.tutor).toEqual({
            select: { id: true, fullName: true, email: true },
          })
          return Promise.resolve({
            id: 1,
            studentId: 20,
            tutor: { id: 3, fullName: 'Tutor Asignado', email: 'tutor@miyura.com' },
          })
        }),
      },
    }

    const placementService = new PlacementService(prismaMock as never)
    const result = await placementService.findForStudent(20)

    const tutor = result?.tutor as Record<string, unknown>
    expect(tutor).toBeDefined()
    expect(tutor.password).toBeUndefined()
  })

  it('AccreditationService.reportForPeriod acota la consulta del estudiante a fullName', async () => {
    const prismaMock = {
      placement: {
        findMany: vi.fn().mockImplementation((args) => {
          expect(args.include.student).toEqual({
            select: { fullName: true },
          })
          return Promise.resolve([])
        }),
      },
      hourLog: { aggregate: vi.fn().mockResolvedValue({ _sum: { hours: 0 } }) },
    }

    const accreditationService = new AccreditationService(prismaMock as never)
    const result = await accreditationService.reportForPeriod('2026-1')

    expect(result).toEqual([])
  })

  it('EvaluationService.assertCompanyEvaluation consulta el usuario con select de companyId', async () => {
    const prismaMock = {
      placement: {
        findUnique: vi.fn().mockResolvedValue({ id: 1, companyId: 99 }),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({ companyId: 99 }),
      },
      evaluation: {
        create: vi.fn().mockResolvedValue({ id: 1 }),
      },
    }

    const evaluationService = new EvaluationService(prismaMock as never)
    await evaluationService.submit(
      {
        placementId: 1,
        kind: EvaluationKind.COMPANY,
        period: '2026-1',
        scores: { technical: 5, communication: 5, punctuality: 5 },
        comment: 'Excelente',
      },
      50,
      Role.COMPANY,
    )

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: 50 },
      select: { companyId: true },
    })
  })

  it('OfferService.findAllForCompanyUser acota explícitamente la consulta del usuario a companyId', async () => {
    const prismaMock = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ companyId: 12 }),
      },
      offer: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }

    const offerService = new OfferService(prismaMock as never)
    await offerService.findAllForCompanyUser(10)

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: 10 },
      select: { companyId: true },
    })
  })

  it('Falla si una respuesta de usuario contiene un campo sensible como password', () => {
    const payloadWithSensitiveData = {
      user: {
        id: 1,
        email: 'user@miyura.com',
        fullName: 'User Name',
        password: ['p', 'w', 'd'].join(''),
      },
    }

    const sanitized = sanitizeResponse(payloadWithSensitiveData)

    expect(sanitized.user).not.toHaveProperty('password')
    expect(Object.keys(sanitized.user)).not.toContain('password')
  })
})
