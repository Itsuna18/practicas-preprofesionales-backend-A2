# Reporte E2-01: Spike de Sobrecupo

## Ventana de Carrera (Race Condition)

La ventana de carrera que permite el sobrecupo se encuentra en el archivo `src/application/application.service.ts`, dentro del método `decide`. 

Específicamente, el problema ocurre entre las siguientes líneas:

1. **Lectura (Línea 54)**: Se lee la cantidad de postulaciones aceptadas actualmente mediante:
   ```typescript
   const accepted = await this.offers.acceptedCount(application.offerId)
   ```
2. **Validación (Línea 55)**: Se verifica si el número de aceptaciones supera el límite:
   ```typescript
   if (accepted >= offer.seats) throw new BadRequestException('la oferta ya no tiene cupos')
   ```
3. **Escritura (Líneas 58-61)**: Se actualiza el estado de la postulación en la base de datos a `ACCEPTED`:
   ```typescript
   return this.prisma.application.update({
     where: { id },
     data: { status, decidedAt: new Date() },
   })
   ```

**¿Por qué sucede?**
Si dos o más solicitudes concurrentes para aceptar a un estudiante entran al mismo tiempo (como se ha demostrado con `Promise.all` en el test implementado), ambas lecturas en la línea 54 verán que `accepted` es menor a `offer.seats` (por ejemplo, ven 0 asientos tomados en una oferta de 1 vacante). Dado que ambas pasan la validación de la línea 55, proceden a realizar el `update` de las líneas 58-61. Como resultado, la oferta termina con 2 estudiantes aceptados para 1 sola plaza disponible.

## Evidencia

Se implementó el test automatizado determinista en `src/application/application.concurrency.spec.ts` utilizando simulaciones (mocks) de Prisma para reproducir exactamente la superposición de promesas que excede los cupos, demostrando que dos aceptaciones concurrentes logran cambiar el estado a `ACCEPTED` simultáneamente.
