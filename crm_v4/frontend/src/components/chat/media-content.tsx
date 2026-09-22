import { formatBytes } from '@/lib/format'
import type { Message } from '@/lib/types'

export function MediaContent({ message }: { message: Message }) {
  const { media } = message
  if (!media) {
    return <p className="text-sm italic opacity-80">Carregando mídia…</p>
  }
  switch (message.type) {
    case 'image':
      return (
        <a href={media.url} target="_blank" rel="noreferrer" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element -- authenticated API URL */}
          <img src={media.url} alt={message.body ?? 'Imagem recebida'} className="max-h-72 w-full max-w-xs object-cover" loading="lazy" />
        </a>
      )
    case 'audio':
      return <audio controls src={media.url} className="w-64 max-w-full" aria-label="Áudio" />
    case 'video':
      return <video controls src={media.url} className="max-h-72 w-full max-w-xs" aria-label="Vídeo" />
    default:
      return (
        <a
          href={media.url}
          download={media.filename ?? true}
          className="flex items-center gap-3 border border-current/20 px-3 py-2 hover:bg-black/5"
        >
          <span aria-hidden className="grid size-9 shrink-0 place-items-center bg-current/10 font-mono text-[10px] font-bold uppercase">
            {media.filename?.split('.').pop()?.slice(0, 4) ?? 'doc'}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{media.filename ?? 'Documento'}</span>
            {media.size !== null && <span className="block font-mono text-[11px] opacity-75">{formatBytes(media.size)}</span>}
          </span>
        </a>
      )
  }
}
