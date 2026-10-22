import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'
import { Roles } from '../auth/decorators/roles.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { UpdateProfileDto } from './dto/update-profile.dto'
import { RecommendationService } from './recommendation.service'

// Solo estudiantes, y siempre sobre su propio usuario (req.user.sub): no hay
// identificador en la ruta que permita leer o editar el perfil de otro.
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STUDENT)
export class RecommendationController {
  constructor(private readonly service: RecommendationService) {}

  @Get('profile')
  getProfile(@Req() req: { user: { sub: number } }) {
    return this.service.getProfile(req.user.sub)
  }

  @Patch('profile')
  updateProfile(@Req() req: { user: { sub: number } }, @Body() dto: UpdateProfileDto) {
    return this.service.updateProfile(req.user.sub, dto)
  }

  @Get('recommendations/offers')
  recommendOffers(@Req() req: { user: { sub: number } }) {
    return this.service.recommendOffers(req.user.sub)
  }
}
