import { Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common'
import { AuthService } from './auth.service'
import { LoginDto } from './dto/login.dto'

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password)
  }

  @Post('refresh')
  refresh(@Headers('authorization') authHeader?: string, @Body('token') bodyToken?: string) {
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : bodyToken
    if (!token) {
      throw new UnauthorizedException('falta el token')
    }
    return this.auth.refresh(token)
  }
}

