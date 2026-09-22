import { z } from 'zod'

/** Evolution sends "messages.upsert" style names; config uses "MESSAGES_UPSERT". Normalize to the latter. */
export const normalizeEventName = (event: string) => event.toUpperCase().replace(/\./g, '_')

export const envelopeSchema = z.object({
  event: z.string().transform(normalizeEventName),
  instance: z.string(),
  data: z.unknown(),
})

export const qrUpdatedData = z.object({
  qrcode: z.object({ base64: z.string().min(1) }),
})

export const connectionUpdateData = z.object({
  state: z.string(),
  wuid: z.string().optional(),
})

export const upsertMessage = z.object({
  key: z.object({
    remoteJid: z.string(),
    // Newer WhatsApp versions address some chats by "@lid"; these carry the phone JID.
    remoteJidAlt: z.string().optional(),
    senderPn: z.string().optional(),
    fromMe: z.boolean(),
    id: z.string().min(1),
  }),
  pushName: z.string().nullish(),
  message: z.record(z.string(), z.unknown()).nullish(),
  messageType: z.string().optional(),
  messageTimestamp: z.union([z.number(), z.string()]).optional(),
})

export const messagesUpsertData = z.union([upsertMessage, z.array(upsertMessage)])

const statusUpdate = z
  .object({
    keyId: z.string().optional(),
    key: z.object({ id: z.string() }).optional(),
    status: z.string(),
  })
  .transform((update) => ({ waMessageId: update.keyId ?? update.key?.id, status: update.status }))

export const messagesUpdateData = z.union([statusUpdate, z.array(statusUpdate)])

export type UpsertMessage = z.infer<typeof upsertMessage>
