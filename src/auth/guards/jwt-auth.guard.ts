import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { AuthService, type JwtPayload } from '../auth.service'

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const header: string | undefined = request.headers.authorization
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null
    if (!token) throw new UnauthorizedException('falta el token')
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token)
      if (payload.jti && this.auth.isJtiRevoked(payload.jti)) {
        throw new UnauthorizedException('token revocado')
      }
      request.user = payload
      return true
    } catch {
      throw new UnauthorizedException('token inválido')
    }
  }
}

