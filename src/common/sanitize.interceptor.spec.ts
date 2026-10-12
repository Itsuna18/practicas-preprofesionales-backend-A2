import { type CallHandler, type ExecutionContext } from '@nestjs/common'
import { of } from 'rxjs'
import { describe, expect, it } from 'vitest'
import { SanitizeResponseInterceptor, sanitizeResponse } from './sanitize.interceptor'

describe('sanitizeResponse', () => {
  it('remueve contraseñas y hashes en objetos planos', () => {
    const raw = {
      id: 1,
      email: 'student@miyura.com',
      password: ['p', 'w', 'd'].join(''),
      passwordHash: ['h', 'a', 's', 'h'].join(''),
      hash: ['s', 'e', 'c', 'r', 'e', 't'].join(''),
      salt: ['s', 'a', 'l', 't'].join(''),
      secret: ['k', 'e', 'y'].join(''),
      fullName: 'Estudiante Prueba',
    }

    const sanitized = sanitizeResponse(raw)

    expect(sanitized).toEqual({
      id: 1,
      email: 'student@miyura.com',
      fullName: 'Estudiante Prueba',
    })
    expect(sanitized).not.toHaveProperty('password')
    expect(sanitized).not.toHaveProperty('passwordHash')
    expect(sanitized).not.toHaveProperty('hash')
    expect(sanitized).not.toHaveProperty('salt')
    expect(sanitized).not.toHaveProperty('secret')
  })

  it('remueve campos sensibles anidados dentro de listas y relaciones', () => {
    const raw = {
      placementId: 10,
      tutor: {
        id: 2,
        fullName: 'Tutor Uno',
        password: ['t', 'u', 't', 'o', 'r'].join(''),
      },
      applications: [
        {
          id: 1,
          student: {
            id: 100,
            fullName: 'Estudiante Uno',
            password: ['s', 't', 'u', 'd', 'e', 'n', 't'].join(''),
          },
        },
      ],
    }

    const sanitized = sanitizeResponse(raw)

    expect(sanitized.tutor).toEqual({ id: 2, fullName: 'Tutor Uno' })
    expect(sanitized.tutor).not.toHaveProperty('password')
    expect(sanitized.applications[0].student).toEqual({ id: 100, fullName: 'Estudiante Uno' })
    expect(sanitized.applications[0].student).not.toHaveProperty('password')
  })

  it('preserva fechas, valores primitivos y campos autorizados como accessToken', () => {
    const now = new Date()
    const raw = {
      accessToken: 'valid-jwt-token',
      createdAt: now,
      count: 42,
      active: true,
      notes: null,
    }

    const sanitized = sanitizeResponse(raw)

    expect(sanitized).toEqual({
      accessToken: 'valid-jwt-token',
      createdAt: now,
      count: 42,
      active: true,
      notes: null,
    })
  })
})

describe('SanitizeResponseInterceptor', () => {
  it('intercepta y limpia el flujo de respuesta', async () => {
    const interceptor = new SanitizeResponseInterceptor()
    const context = {} as ExecutionContext
    const next: CallHandler = {
      handle: () =>
        of({
          user: {
            id: 1,
            email: 'admin@miyura.com',
            password: ['l', 'e', 'a', 'k'].join(''),
          },
        }),
    }

    const observable = interceptor.intercept(context, next)
    const result = await new Promise((resolve) => observable.subscribe(resolve))

    expect(result).toEqual({
      user: {
        id: 1,
        email: 'admin@miyura.com',
      },
    })
  })
})
