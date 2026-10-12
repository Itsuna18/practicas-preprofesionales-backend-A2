import { UnauthorizedException } from '@nestjs/common'
import * as bcrypt from 'bcryptjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthService } from './auth.service'

// Smell deliberado: mockeamos PrismaService completo, así que estos tests
// no ejercitan SQL real y no detectan N+1 ni races.
const prisma = { user: { findUnique: vi.fn() } }
const jwt = { signAsync: vi.fn().mockResolvedValue('token-firmado') }

describe('AuthService.login', () => {
  let service: AuthService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new AuthService(prisma as never, jwt as never)
  })

  it('returns an access token and the user for valid credentials', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 1, email: 'tutor0@miyura.com', password: await bcrypt.hash('yura1234', 10),
      fullName: 'Tutor Académico 0', role: 'TUTOR',
    })

    const result = await service.login('tutor0@miyura.com', 'yura1234')

    expect(result.accessToken).toBe('token-firmado')
    expect(result.user).toEqual({ id: 1, email: 'tutor0@miyura.com', fullName: 'Tutor Académico 0', role: 'TUTOR' })
  })

  it('includes companyId for a COMPANY user', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 2, email: 'empresa0@miyura.com', password: await bcrypt.hash('yura1234', 10),
      fullName: 'Empresa 0', role: 'COMPANY', companyId: 1,
    })

    const result = await service.login('empresa0@miyura.com', 'yura1234')

    expect(result.user).toEqual({
      id: 2, email: 'empresa0@miyura.com', fullName: 'Empresa 0', role: 'COMPANY', companyId: 1,
    })
  })

  it('throws Unauthorized when the password does not match', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 1, email: 'tutor0@miyura.com', password: await bcrypt.hash('otra', 10),
      fullName: 'Tutor Académico 0', role: 'TUTOR',
    })

    await expect(service.login('tutor0@miyura.com', 'yura1234')).rejects.toThrow(UnauthorizedException)
  })
})

describe('AuthService.refresh', () => {
  let service: AuthService
  const jwtMock = {
    signAsync: vi.fn(),
    verifyAsync: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    jwtMock.signAsync.mockResolvedValue('nuevo-token')
    service = new AuthService(prisma as never, jwtMock as never)
  })

  it('renueva la sesión con un token válido y devuelve un nuevo token', async () => {
    jwtMock.verifyAsync.mockResolvedValue({
      sub: 1,
      email: 'student@miyura.com',
      role: 'STUDENT',
      jti: 'jti-antiguo-1',
    })

    prisma.user.findUnique.mockResolvedValue({
      id: 1,
      email: 'student@miyura.com',
      fullName: 'Estudiante 1',
      role: 'STUDENT',
      companyId: null,
    })

    const result = await service.refresh('token-valido')

    expect(result.accessToken).toBe('nuevo-token')
    expect(result.user).toEqual({
      id: 1,
      email: 'student@miyura.com',
      fullName: 'Estudiante 1',
      role: 'STUDENT',
      companyId: null,
    })
    expect(service.isJtiRevoked('jti-antiguo-1')).toBe(true)
  })

  it('invalida el token anterior impidiendo reutilizarlo para renovar', async () => {
    jwtMock.verifyAsync.mockResolvedValue({
      sub: 1,
      email: 'student@miyura.com',
      role: 'STUDENT',
      jti: 'jti-reutilizado',
    })

    prisma.user.findUnique.mockResolvedValue({
      id: 1,
      email: 'student@miyura.com',
      fullName: 'Estudiante 1',
      role: 'STUDENT',
      companyId: null,
    })

    // Primera renovación exitosa
    await service.refresh('token-1')

    // Intento de reutilizar el mismo token ya revocado
    await expect(service.refresh('token-1')).rejects.toThrow('el token ya fue revocado')
  })

  it('lanza Unauthorized si el token a renovar está expirado o es inválido', async () => {
    jwtMock.verifyAsync.mockRejectedValue(new Error('jwt expired'))

    await expect(service.refresh('token-expirado')).rejects.toThrow('token expirado o inválido')
  })
})

