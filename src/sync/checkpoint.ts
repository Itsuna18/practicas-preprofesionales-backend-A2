export interface EntityCursor {
  updatedAt: string
  id: number
}

export interface Checkpoint {
  placements?: EntityCursor
  hourLogs?: EntityCursor
  documents?: EntityCursor
  evaluations?: EntityCursor
}

export function encodeCheckpoint(cp: Checkpoint): string {
  return Buffer.from(JSON.stringify(cp), 'utf8').toString('base64')
}

export function decodeCheckpoint(raw: string | undefined): Checkpoint | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))
    // Para simplificar, aceptamos el nuevo formato que puede tener propiedades por entidad.
    // O si mandan el antiguo, lo convertimos a nulo o lo ignoramos.
    if (typeof parsed !== 'object' || parsed === null) return null
    return parsed as Checkpoint
  } catch {
    return null
  }
}
