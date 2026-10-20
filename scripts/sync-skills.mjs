// Copia las skills compartidas desde la fuente única (.agents/skills, estándar
// Agent Skills que leen Codex y Gemini CLI) a las carpetas que buscan otras
// herramientas. Se usan copias y no enlaces simbólicos porque en Windows git
// no los maneja bien por defecto.
//
//   node scripts/sync-skills.mjs          copia y deja las carpetas al día
//   node scripts/sync-skills.mjs --check  solo verifica (lo usa la CI)
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import console from 'node:console'
import process from 'node:process'

const SOURCE = '.agents/skills'
const TARGETS = [
  '.claude/skills', // Claude Code
  '.agent/skills', // Antigravity (en singular)
]

function listFiles(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? listFiles(path) : [path]
  })
}

// Compara ignorando CRLF/LF: git puede convertir finales de línea al hacer checkout.
function snapshot(dir) {
  return new Map(
    listFiles(dir).map((file) => [
      relative(dir, file).replaceAll('\\', '/'),
      readFileSync(file, 'utf8').replaceAll('\r\n', '\n'),
    ]),
  )
}

function differences(source, target) {
  const problems = []
  for (const [file, content] of source) {
    if (!target.has(file)) problems.push(`falta ${file}`)
    else if (target.get(file) !== content) problems.push(`difiere ${file}`)
  }
  for (const file of target.keys()) {
    if (!source.has(file)) problems.push(`sobra ${file}`)
  }
  return problems
}

const source = snapshot(SOURCE)
if (source.size === 0) {
  console.error(`No hay skills en ${SOURCE}.`)
  process.exit(1)
}

if (process.argv.includes('--check')) {
  let ok = true
  for (const target of TARGETS) {
    const problems = differences(source, snapshot(target))
    if (problems.length > 0) {
      ok = false
      console.error(`${target} no coincide con ${SOURCE}:`)
      for (const problem of problems) console.error(`  - ${problem}`)
    }
  }
  if (!ok) {
    console.error(`\nEdita solo ${SOURCE} y ejecuta: pnpm skills:sync`)
    process.exit(1)
  }
  console.log(`Skills sincronizadas en ${TARGETS.join(', ')}.`)
} else {
  for (const target of TARGETS) {
    rmSync(target, { recursive: true, force: true })
    cpSync(SOURCE, target, { recursive: true })
    console.log(`${SOURCE} -> ${target}`)
  }
}
