import { Injectable } from '@nestjs/common'
import { type HourLog, HourLogStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { type Checkpoint, decodeCheckpoint, encodeCheckpoint } from './checkpoint'
import type { SyncOperationInput, SyncOperationResult } from './dto/push.dto'

@Injectable()
export class SyncService {
  constructor(private readonly prisma: PrismaService) {}

  async pull(userId: number, since: string | undefined, limit: number) {
    const cursor = decodeCheckpoint(since) || {}

    const getWhere = (cp?: { updatedAt: string; id: number }) => {
      if (!cp) return {}
      const dt = new Date(cp.updatedAt)
      return {
        OR: [
          { updatedAt: { gt: dt } },
          { updatedAt: dt, id: { gt: cp.id } },
        ],
      }
    }

    const order = [{ updatedAt: 'asc' as const }, { id: 'asc' as const }]
    const scope = { placement: { OR: [{ studentId: userId }, { tutorId: userId }] } }

    const [placements, hourLogs, documents, evaluations] = await Promise.all([
      this.prisma.placement.findMany({
        where: { ...getWhere(cursor.placements), OR: [{ studentId: userId }, { tutorId: userId }] },
        orderBy: order,
        take: limit,
      }),
      this.prisma.hourLog.findMany({ where: { ...getWhere(cursor.hourLogs), ...scope }, orderBy: order, take: limit }),
      this.prisma.document.findMany({ where: { ...getWhere(cursor.documents), ...scope }, orderBy: order, take: limit }),
      this.prisma.evaluation.findMany({ where: { ...getWhere(cursor.evaluations), ...scope }, orderBy: order, take: limit }),
    ])

    const checkpoint: Checkpoint = { ...cursor }

    if (placements.length > 0) {
      const last = placements[placements.length - 1]
      checkpoint.placements = { updatedAt: new Date(last.updatedAt).toISOString(), id: last.id }
    }
    if (hourLogs.length > 0) {
      const last = hourLogs[hourLogs.length - 1]
      checkpoint.hourLogs = { updatedAt: new Date(last.updatedAt).toISOString(), id: last.id }
    }
    if (documents.length > 0) {
      const last = documents[documents.length - 1]
      checkpoint.documents = { updatedAt: new Date(last.updatedAt).toISOString(), id: last.id }
    }
    if (evaluations.length > 0) {
      const last = evaluations[evaluations.length - 1]
      checkpoint.evaluations = { updatedAt: new Date(last.updatedAt).toISOString(), id: last.id }
    }

    // Checkpoint is null only if it has absolutely no cursors
    const hasAnyCursor = Object.keys(checkpoint).length > 0

    return {
      changes: { placements, hourLogs, documents, evaluations },
      checkpoint: hasAnyCursor ? encodeCheckpoint(checkpoint) : null,
      hasMore: [placements, hourLogs, documents, evaluations].some((rows) => rows.length === limit),
    }
  }

  async push(userId: number, ops: SyncOperationInput[]) {
    const results: SyncOperationResult[] = []
    for (const op of ops) {
      let inserted = false
      try {
        await this.prisma.syncOperation.create({
          data: { clientOpId: op.clientOpId, userId, response: { status: 'pending' } },
        })
        inserted = true
      } catch (err) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((err as any).code !== 'P2002') throw err
      }

      if (!inserted) {
        let existing
        for (let i = 0; i < 20; i++) {
          existing = await this.prisma.syncOperation.findUnique({
            where: { clientOpId: op.clientOpId },
          })
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (existing && (existing.response as any).status !== 'pending') {
            break
          }
          await new Promise((r) => setTimeout(r, 50))
        }
        results.push(existing?.response as unknown as SyncOperationResult)
        continue
      }

      let result: SyncOperationResult
      try {
        result = await this.applyOperation(userId, op)
      } catch (err) {
        result = {
          clientOpId: op.clientOpId,
          status: 'rejected',
          server: null,
          reason: err instanceof Error ? err.message : 'no se pudo aplicar la operación',
        }
      }

      await this.prisma.syncOperation.update({
        where: { clientOpId: op.clientOpId },
        data: { response: result as unknown as object },
      })
      results.push(result)
    }
    return { results }
  }

  private getIncomingVersion(op: SyncOperationInput): number | null {
    if (typeof op.payload.version === 'number') {
      return op.payload.version
    }
    if (typeof op.baseVersion === 'number') {
      return op.baseVersion
    }
    return null
  }

  private isServerNewer(
    existing: { version: number; updatedAt: Date },
    op: SyncOperationInput,
  ): boolean {
    const incomingUpdatedAt = op.payload.updatedAt ? new Date(String(op.payload.updatedAt)).getTime() : null
    const existingUpdatedAt = new Date(existing.updatedAt).getTime()
    const incomingVersion = this.getIncomingVersion(op)

    if (incomingUpdatedAt !== null && !isNaN(incomingUpdatedAt)) {
      return existingUpdatedAt > incomingUpdatedAt
    }
    if (incomingVersion !== null) {
      return existing.version > incomingVersion
    }
    return false
  }

  private async createHourLogOp(userId: number, op: SyncOperationInput): Promise<SyncOperationResult> {
    const placement = await this.prisma.placement.findUnique({ where: { id: Number(op.payload.placementId) } })
    if (!placement || placement.studentId !== userId) {
      return { clientOpId: op.clientOpId, status: 'rejected', server: null, reason: 'el placement no pertenece al usuario' }
    }

    const created = await this.prisma.hourLog.create({
      data: {
        placementId: Number(op.payload.placementId),
        date: new Date(String(op.payload.date)),
        startTime: String(op.payload.startTime),
        endTime: String(op.payload.endTime),
        hours: Number(op.payload.hours),
        activity: String(op.payload.activity),
        status: 'SUBMITTED',
      },
    })
    return { clientOpId: op.clientOpId, status: 'applied', server: created as never, reason: null }
  }

  private buildHourLogUpdateData(
    payload: Record<string, unknown>,
    incomingStatus: string | null,
  ) {
    const data: Record<string, unknown> = { version: { increment: 1 } }
    if (incomingStatus) data.status = incomingStatus as HourLogStatus
    if (payload.date) data.date = new Date(String(payload.date))
    if (payload.startTime) data.startTime = String(payload.startTime)
    if (payload.endTime) data.endTime = String(payload.endTime)
    if (payload.hours !== undefined) data.hours = Number(payload.hours)
    if (payload.activity) data.activity = String(payload.activity)
    return data
  }

  private async updateHourLogOp(
    existing: HourLog,
    op: SyncOperationInput,
  ): Promise<SyncOperationResult> {
    const incomingStatus = op.payload.status ? String(op.payload.status) : null
    if (incomingStatus && incomingStatus !== 'DRAFT' && incomingStatus !== 'SUBMITTED') {
      return {
        clientOpId: op.clientOpId,
        status: 'rejected',
        server: existing as unknown as Record<string, unknown>,
        reason: 'estado entrante no válido para edición de horas',
      }
    }

    if (this.isServerNewer(existing, op)) {
      return {
        clientOpId: op.clientOpId,
        status: 'rejected',
        server: existing as unknown as Record<string, unknown>,
        reason: 'El servidor tiene una versión más reciente',
      }
    }

    const updated = await this.prisma.hourLog.update({
      where: { id: Number(op.payload.id) },
      data: this.buildHourLogUpdateData(op.payload, incomingStatus),
    })
    return { clientOpId: op.clientOpId, status: 'applied', server: updated as never, reason: null }
  }

  private async applyOperation(userId: number, op: SyncOperationInput): Promise<SyncOperationResult> {
    if (op.entity !== 'hourLog') {
      return { clientOpId: op.clientOpId, status: 'rejected', server: null, reason: 'entidad no sincronizable desde el cliente' }
    }

    if (op.op === 'create') {
      return this.createHourLogOp(userId, op)
    }

    const existing = await this.prisma.hourLog.findUnique({
      where: { id: Number(op.payload.id) },
      include: { placement: true },
    })
    if (!existing || existing.placement.studentId !== userId) {
      return { clientOpId: op.clientOpId, status: 'rejected', server: null, reason: 'el registro no pertenece al usuario' }
    }

    if (existing.status === HourLogStatus.APPROVED || existing.status === HourLogStatus.REJECTED) {
      const reason = existing.status === HourLogStatus.APPROVED
        ? 'La hora ya fue aprobada por el tutor y no puede ser modificada'
        : 'La hora ya fue rechazada por el tutor y no puede ser modificada'
      return {
        clientOpId: op.clientOpId,
        status: 'rejected',
        server: existing as unknown as Record<string, unknown>,
        reason,
      }
    }

    if (op.op === 'update') {
      return this.updateHourLogOp(existing, op)
    }

    const deleted = await this.prisma.hourLog.update({
      where: { id: Number(op.payload.id) },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    })
    return { clientOpId: op.clientOpId, status: 'applied', server: deleted as never, reason: null }
  }
}
