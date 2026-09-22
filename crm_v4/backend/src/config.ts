import { z } from 'zod'

const booleanFromString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true')

const envSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(3333),
    DATABASE_URL: z.string().url(),
    SESSION_COOKIE_SECURE: booleanFromString,
    STORAGE_DRIVER: z.enum(['local', 'supabase']).default('local'),
    MEDIA_DIR: z.string().default('.media'),
    SUPABASE_URL: z.string().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    SUPABASE_BUCKET: z.string().default('media'),
    EVOLUTION_URL: z.string().url(),
    EVOLUTION_API_KEY: z.string().min(1),
    EVOLUTION_INSTANCE: z.string().min(1),
    EVOLUTION_WEBHOOK_TOKEN: z.string().min(16),
    PUBLIC_BACKEND_URL: z.string().url(),
    AI_CREDENTIALS_KEY: z
      .string()
      .refine((value) => Buffer.from(value, 'base64').length === 32, 'precisa ser 32 bytes em base64 (openssl rand -base64 32)'),
    BI_SECRETS_KEY: z
      .string()
      .refine((value) => Buffer.from(value, 'base64').length === 32, 'precisa ser 32 bytes em base64 (openssl rand -base64 32)'),
    BI_ALLOW_PRIVATE_NETWORKS: booleanFromString,
  })
  .superRefine((env, ctx) => {
    if (env.STORAGE_DRIVER !== 'supabase') return
    for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const) {
      if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: 'obrigatório com STORAGE_DRIVER=supabase' })
    }
  })

export type Config = z.infer<typeof envSchema>

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = envSchema.safeParse(env)
  if (result.success) return result.data
  const problems = result.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
  throw new Error(`Variáveis de ambiente inválidas:\n${problems.join('\n')}`)
}
