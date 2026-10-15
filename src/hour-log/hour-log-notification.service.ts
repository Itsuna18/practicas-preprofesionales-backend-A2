import { Injectable } from '@nestjs/common'

@Injectable()
export class HourLogNotificationService {
  /**
   * Notifica al tutor asignado cuando un estudiante registra una nueva jornada de horas.
   */
  notifyTutor(tutorId: number, hourLogId: number): void {
    console.log(`[notificación] tutor ${tutorId}: nueva hora registrada #${hourLogId}`)
  }
}
