import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { message } from '@/test/fixtures'
import { MediaContent } from './media-content'

const media = (mime: string, filename: string | null = null, size: number | null = null) => ({ url: '/api/messages/m1/media', mime, filename, size })

describe('MediaContent', () => {
  it('shows an image preview linking to full size', () => {
    render(<MediaContent message={message({ type: 'image', body: 'produto', media: media('image/jpeg') })} />)
    expect(screen.getByRole('img', { name: 'produto' })).toHaveAttribute('src', '/api/messages/m1/media')
    expect(screen.getByRole('link')).toHaveAttribute('target', '_blank')
  })

  it('renders playable audio and video', () => {
    const { container, rerender } = render(<MediaContent message={message({ type: 'audio', media: media('audio/ogg') })} />)
    expect(container.querySelector('audio[controls]')).toHaveAttribute('src', '/api/messages/m1/media')
    rerender(<MediaContent message={message({ type: 'video', media: media('video/mp4') })} />)
    expect(container.querySelector('video[controls]')).toBeInTheDocument()
  })

  it('renders documents as a download card with name and size', () => {
    render(<MediaContent message={message({ type: 'document', media: media('application/pdf', 'proposta.pdf', 2048) })} />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('download', 'proposta.pdf')
    expect(link).toHaveTextContent('proposta.pdf')
    expect(link).toHaveTextContent('2 KB')
  })

  it('shows a placeholder while the media is not stored yet', () => {
    render(<MediaContent message={message({ type: 'image', media: null })} />)
    expect(screen.getByText('Carregando mídia…')).toBeInTheDocument()
  })
})
