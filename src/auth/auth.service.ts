import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import type { Role } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import { PrismaService } from '../prisma/prisma.service'

export interface JwtPayload {
  sub: number
  email: string
  role: Role
  jti: string
  iat?: number
  exp?: number
}

@Injectable()
export class AuthService {
  private readonly revokedJtis = new Set<string>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } })
    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new UnauthorizedException('credenciales inválidas')
    }

    return this.generateTokenResponse(user)
  }

  async refresh(oldToken: string) {
    let payload: JwtPayload
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(oldToken, { ignoreExpiration: false })
    } catch {
      throw new UnauthorizedException('token expirado o inválido')
    }

    if (payload.jti && this.isJtiRevoked(payload.jti)) {
      throw new UnauthorizedException('el token ya fue revocado')
    }

    // Invalidar el token anterior
    if (payload.jti) {
      this.revokeJti(payload.jti)
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } })
    if (!user) {
      throw new UnauthorizedException('usuario no encontrado')
    }

    return this.generateTokenResponse(user)
  }

  isJtiRevoked(jti: string): boolean {
    return this.revokedJtis.has(jti)
  }

  revokeJti(jti: string): void {
    this.revokedJtis.add(jti)
  }

  private async generateTokenResponse(user: { id: number; email: string; fullName: string; role: Role; companyId: number | null }) {
    const jti = crypto.randomUUID()
    const expiresIn = (process.env.JWT_EXPIRES_IN ?? '15m') as `${number}m` | `${number}s` | `${number}h` | `${number}d`
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, role: user.role, jti },
      { expiresIn },
    )

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        companyId: user.companyId,
      },
    }
  }
}

