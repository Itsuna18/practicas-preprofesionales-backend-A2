# Problemas conocidos

Lo que sabemos que está mal y no alcanzamos a arreglar. Está ordenado por lo que más nos
dolió, no por severidad técnica.

Si encuentras algo que no está acá, agrégalo. Casi seguro hay más.

## D-01 · El sync duplica horas al reintentar

`src/offline/sync/push.ts` (front) y `src/sync/sync.service.ts` (back).

Si el push se corta a medias y el cliente reintenta, a veces aparecen dos registros de horas
idénticos. Pasa más en la práctica de campo, con señal intermitente. Mandamos un `clientOpId`
en cada operación y guardamos las operaciones en `sync_operations`, pero evidentemente algo
no está cerrando el círculo. No tuvimos tiempo de sentarnos a entenderlo.

Workaround actual: el coordinador borra los duplicados a mano.


## D-03 · El módulo de evaluaciones no tiene tests

`src/evaluation/`

Cero. Lo hicimos en la última semana y no alcanzamos. Es el módulo que más baja la cobertura
del proyecto. Si vas a tocar rúbricas o scores, escribe los tests primero — nadie sabe qué se
rompe.

## D-04 · La lista de postulaciones va lenta

`src/application/application.service.ts`, método `listByOffer`.

Con menos de 200 postulaciones no se nota. Arriba de eso, la pantalla de la empresa tarda
varios segundos. Sospechamos que es cómo traemos los estudiantes, pero no lo medimos.

## D-05 · `calculateAccreditationStatus` da miedo tocarla

`src/placement/accreditation.ts`

ESLint la marca por complejidad. Son `if` anidados hasta seis niveles con toda la lógica de
acreditación adentro. Funciona — hasta donde sabemos — pero solo hay dos tests, así que
cualquier cambio es a ciegas. Si te toca modificar reglas de acreditación, escribe primero
tests de los casos que hoy funcionan.



## E6-02 · Decisión arquitectónica: Fechas de prácticas como "Día Calendario"

`src/common/date.utils.ts`, `src/hour-log/hour-log.service.ts` y `src/sync/sync.service.ts`.

Las fechas de las jornadas registradas en el libro de horas (`HourLog.date`) se definen formalmente como **DÍA CALENDARIO** (fecha civil institucional: año, mes, día) y no como un instante de tiempo.
- **Motivo**: Tratar la fecha de la práctica como un instante con zona horaria libre provocaba que dispositivos en distintas zonas horarias (Japón UTC+9, España UTC+2, California UTC-7) guardaran registros en días distintos en UTC y permitieran fechas fuera de rango.
- **Normalización**: Las fechas entrantes (vía HTTP o sincronización offline) se normalizan a la medianoche UTC (`00:00:00.000Z`) del día calendario correspondiente según la zona horaria institucional configurable (`INSTITUTIONAL_TIMEZONE`, por defecto `America/Guayaquil`).
- **Compatibilidad con registros previos**: Como los registros históricos del seed ya se crearon a medianoche UTC, ninguno cambia de día al desplegar (sin requerir migración destructiva).
- **Validaciones de negocio**: Se impide registrar jornadas con fecha futura y fechas fuera del rango de la práctica (`startDate` a `endDate`), respondiendo con un mensaje claro que indica el rango válido.


