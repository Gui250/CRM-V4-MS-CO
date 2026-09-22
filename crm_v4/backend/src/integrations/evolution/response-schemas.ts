import { z } from 'zod'

// Only the fields we use are declared; Evolution returns more, which Zod strips.

export const messageKeySchema = z.object({
  remoteJid: z.string(),
  fromMe: z.boolean(),
  id: z.string().min(1),
})

export const sendMessageResponse = z.object({ key: messageKeySchema })

export const connectResponse = z.object({
  base64: z.string().min(1).optional(),
  code: z.string().optional(),
})

export const connectionStateResponse = z.object({
  instance: z.object({ state: z.string() }),
})

export const fetchInstancesResponse = z.array(z.object({ name: z.string().optional() }).loose())

export const mediaBase64Response = z.object({
  base64: z.string().min(1),
  mimetype: z.string().min(1),
  fileName: z.string().nullish(),
})

export const whatsappNumbersResponse = z.array(
  z.object({ exists: z.boolean(), jid: z.string().nullish(), number: z.string().optional() }).loose(),
)

export const profilePictureResponse = z.object({
  profilePictureUrl: z.string().nullish(),
})
