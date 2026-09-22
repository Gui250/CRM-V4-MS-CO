import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConnectionRow } from '../db/schema.js'
import * as connectionModel from '../models/connection.js'
import { fakeContext } from '../test/context.js'
import * as connection from './connection.js'

vi.mock('../models/connection.js')

const row = (overrides: Partial<ConnectionRow> = {}): ConnectionRow => ({
  id: 'c1',
  singleton: true,
  instanceName: 'v4-msco',
  status: 'disconnected',
  phoneNumber: null,
  lastQr: null,
  lastConnectedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

const { ctx, evolution, bus } = fakeContext()

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(connectionModel.get).mockResolvedValue(row())
  vi.mocked(connectionModel.update).mockImplementation(async (_db, _name, changes) => row(changes))
})

describe('connect', () => {
  it('creates the instance when missing, sets the webhook, stores the QR and publishes', async () => {
    evolution.instanceExists.mockResolvedValue(false)
    evolution.connect.mockResolvedValue({ qrCode: 'data:image/png;base64,QR' })

    const result = await connection.connect(ctx)

    expect(evolution.createInstance).toHaveBeenCalled()
    expect(evolution.setWebhook).toHaveBeenCalled()
    expect(connectionModel.update).toHaveBeenCalledWith(ctx.db, 'v4-msco', { status: 'awaiting_qr', lastQr: 'data:image/png;base64,QR' })
    expect(result).toMatchObject({ status: 'awaiting_qr', qrCode: 'data:image/png;base64,QR' })
    expect(bus.publish).toHaveBeenCalledWith({ type: 'connection.updated', data: { connection: result } })
  })

  it('does not recreate an existing instance', async () => {
    evolution.instanceExists.mockResolvedValue(true)
    evolution.connect.mockResolvedValue({ qrCode: 'QR' })

    await connection.connect(ctx)

    expect(evolution.createInstance).not.toHaveBeenCalled()
  })

  it('marks as connected when Evolution returns no QR because the session is already open', async () => {
    evolution.instanceExists.mockResolvedValue(true)
    evolution.connect.mockResolvedValue({ qrCode: null })
    evolution.connectionState.mockResolvedValue('open')

    const result = await connection.connect(ctx)

    expect(result.status).toBe('connected')
  })
})

describe('logout', () => {
  it('logs out and marks as disconnected', async () => {
    const result = await connection.logout(ctx)
    expect(evolution.logout).toHaveBeenCalled()
    expect(result.status).toBe('disconnected')
    expect(bus.publish).toHaveBeenCalled()
  })

  it('still marks as disconnected when Evolution already dropped the session', async () => {
    evolution.logout.mockRejectedValue(new Error('not connected'))
    expect((await connection.logout(ctx)).status).toBe('disconnected')
  })
})

describe('webhook handlers', () => {
  it('stores a refreshed QR', async () => {
    await connection.handleQrUpdated(ctx, 'data:image/png;base64,NEW')
    expect(connectionModel.update).toHaveBeenCalledWith(ctx.db, 'v4-msco', { status: 'awaiting_qr', lastQr: 'data:image/png;base64,NEW' })
    expect(bus.publish).toHaveBeenCalled()
  })

  it('maps open to connected with the phone from wuid, clearing the QR', async () => {
    await connection.handleConnectionUpdate(ctx, { state: 'open', wuid: '5511999999999@s.whatsapp.net' })
    expect(connectionModel.update).toHaveBeenCalledWith(
      ctx.db,
      'v4-msco',
      expect.objectContaining({ status: 'connected', phoneNumber: '5511999999999', lastQr: null, lastConnectedAt: expect.any(Date) }),
    )
  })

  it('maps close to disconnected and ignores connecting', async () => {
    await connection.handleConnectionUpdate(ctx, { state: 'close' })
    expect(connectionModel.update).toHaveBeenCalledWith(ctx.db, 'v4-msco', { status: 'disconnected', lastQr: null })

    vi.mocked(connectionModel.update).mockClear()
    await connection.handleConnectionUpdate(ctx, { state: 'connecting' })
    expect(connectionModel.update).not.toHaveBeenCalled()
  })
})

describe('getStatus', () => {
  it('returns the current connection', async () => {
    vi.mocked(connectionModel.get).mockResolvedValue(row({ status: 'connected', phoneNumber: '55' }))
    expect(await connection.getStatus(ctx)).toMatchObject({ status: 'connected', phoneNumber: '55', qrCode: null })
  })
})
