// Regla única para el rango de horas válido por registro. Antes esto vivía
// repetido en tres sitios (el DTO y dos métodos del servicio) con valores
// distintos entre sí. Ahora todos leen de aquí.
//
// MAX_HOURS_PER_LOG es configurable por entorno (HOUR_LOG_MAX_HOURS) para no
// dejarlo como un número mágico suelto en el código; si la variable no está
// definida, se usa el valor por defecto acordado con el equipo.
const DEFAULT_MAX_HOURS_PER_LOG = 10

export const MIN_HOURS_PER_LOG = 0.5

export const MAX_HOURS_PER_LOG = process.env.HOUR_LOG_MAX_HOURS
  ? Number(process.env.HOUR_LOG_MAX_HOURS)
  : DEFAULT_MAX_HOURS_PER_LOG

export const HOURS_OUT_OF_RANGE_MESSAGE = `Las horas deben estar entre ${MIN_HOURS_PER_LOG} y ${MAX_HOURS_PER_LOG} por registro.`