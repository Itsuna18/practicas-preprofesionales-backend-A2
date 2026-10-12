import { Global, Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { JwtAuthGuard } from './guards/jwt-auth.guard'
import { RolesGuard } from './guards/roles.guard'

const jwtSecret = process.env.JWT_SECRET
if (!jwtSecret) {
  throw new Error('Falta la variable de entorno JWT_SECRET. Defínela en tu .env antes de arrancar la aplicación.')
}

@Global()
@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: jwtSecret,
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, RolesGuard],
  exports: [AuthService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}