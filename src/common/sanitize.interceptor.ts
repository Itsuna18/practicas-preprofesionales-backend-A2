import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'hash',
  'salt',
  'secret',
])

export function sanitizeResponse<T>(data: T): T {
  if (data === null || data === undefined || typeof data !== 'object') {
    return data
  }

  if (data instanceof Date || data instanceof RegExp) {
    return data
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeResponse(item)) as unknown as T
  }

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key)) {
      continue
    }
    result[key] = sanitizeResponse(value)
  }
  return result as T
}

@Injectable()
export class SanitizeResponseInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((data) => sanitizeResponse(data)))
  }
}
