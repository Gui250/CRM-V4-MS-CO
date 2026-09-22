import type { AppContext } from '../context.js'
import type { ConnectionRow } from '../db/schema.js'
import * as connectionModel from '../models/connection.js'
import { toConnectionDto, type ConnectionDto } from './dto.js'

const phoneFromJid = (jid: string) => jid.split('@')[0]!.split(':')[0]!.replace(/\D/g, '')

async function save(ctx: AppContext, changes: Parameters<typeof connectionModel.update>[2]): Promise<ConnectionDto> {
  const connection = toConnectionDto(await connectionModel.update(ctx.db, ctx.config.EVOLUTION_INSTANCE, changes))
  ctx.bus.publish({ type: 'connection.updated', data: { connection } })
  return connection
}

export async function getStatus(ctx: AppContext): Promise<ConnectionDto> {
  return toConnectionDto(await connectionModel.get(ctx.db, ctx.config.EVOLUTION_INSTANCE))
}

export async function isConnected(ctx: AppContext): Promise<boolean> {
  const row: ConnectionRow = await connectionModel.get(ctx.db, ctx.config.EVOLUTION_INSTANCE)
  return row.status === 'connected'
}

export async function connect(ctx: AppContext): Promise<ConnectionDto> {
  if (!(await ctx.evolution.instanceExists())) await ctx.evolution.createInstance()
  await ctx.evolution.setWebhook()
  const { qrCode } = await ctx.evolution.connect()
  if (qrCode) return save(ctx, { status: 'awaiting_qr', lastQr: qrCode })

  // No QR means the session is already open (or opening) on Evolution's side.
  const state = await ctx.evolution.connectionState()
  return state === 'open' ? save(ctx, { status: 'connected', lastQr: null }) : getStatus(ctx)
}

export async function logout(ctx: AppContext): Promise<ConnectionDto> {
  try {
    await ctx.evolution.logout()
  } catch (error) {
    ctx.log.warn({ err: error }, 'evolution logout failed; marking as disconnected anyway')
  }
  return save(ctx, { status: 'disconnected', lastQr: null })
}

export async function handleQrUpdated(ctx: AppContext, qrCode: string): Promise<void> {
  await save(ctx, { status: 'awaiting_qr', lastQr: qrCode })
}

export async function handleConnectionUpdate(ctx: AppContext, update: { state: string; wuid?: string }): Promise<void> {
  if (update.state === 'open') {
    await save(ctx, {
      status: 'connected',
      lastQr: null,
      lastConnectedAt: new Date(),
      ...(update.wuid ? { phoneNumber: phoneFromJid(update.wuid) } : {}),
    })
  } else if (update.state === 'close') {
    await save(ctx, { status: 'disconnected', lastQr: null })
  }
}
