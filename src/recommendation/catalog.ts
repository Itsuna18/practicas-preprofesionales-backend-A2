/**
 * Catálogo del perfil del estudiante. Cada carrera trae las palabras clave que
 * la acercan a una oferta; los intereses son etiquetas que el estudiante elige.
 * Las palabras se comparan normalizadas (minúsculas y sin tildes).
 */
export const CAREERS: Record<string, string[]> = {
  'Ingeniería de Software': ['software', 'backend', 'frontend', 'desarrollo', 'api', 'qa', 'pruebas'],
  'Ciencia de Datos': ['datos', 'analisis', 'analitica', 'reportes', 'inteligencia de negocio', 'software'],
  'Ingeniería Industrial': ['manufactura', 'procesos', 'calidad', 'produccion', 'logistica', 'qa'],
  Agronomía: ['agro', 'agricola', 'campo', 'cultivos'],
  Enfermería: ['salud', 'clinica', 'hospital', 'pacientes'],
  'Administración de Empresas': ['negocio', 'gestion', 'reportes', 'procesos', 'datos'],
}

export const CAREER_NAMES = Object.keys(CAREERS)

export const INTERESTS = [
  'backend',
  'frontend',
  'datos',
  'pruebas',
  'calidad',
  'manufactura',
  'salud',
  'agro',
  'gestion',
] as const

export const MODALITIES = ['PRESENCIAL', 'HIBRIDA', 'REMOTA'] as const

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}
