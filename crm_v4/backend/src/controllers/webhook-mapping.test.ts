import { describe, expect, it } from 'vitest'
import * as mapping from './webhook-mapping.js'

describe('webhook mapping', () => {
  it('ignores groups, status broadcasts and newsletters', () => {
    expect(mapping.isIgnoredJid('120363@g.us')).toBe(true)
    expect(mapping.isIgnoredJid('status@broadcast')).toBe(true)
    expect(mapping.isIgnoredJid('1203@newsletter')).toBe(true)
    expect(mapping.isIgnoredJid('5511@s.whatsapp.net')).toBe(false)
  })

  it('resolves @lid chats to the phone JID when available', () => {
    expect(mapping.resolveChatJid({ remoteJid: '5511@s.whatsapp.net', fromMe: false, id: 'x' })).toBe('5511@s.whatsapp.net')
    expect(mapping.resolveChatJid({ remoteJid: '999@lid', remoteJidAlt: '5511@s.whatsapp.net', fromMe: false, id: 'x' })).toBe('5511@s.whatsapp.net')
    expect(mapping.resolveChatJid({ remoteJid: '999@lid', senderPn: '5522@s.whatsapp.net', fromMe: false, id: 'x' })).toBe('5522@s.whatsapp.net')
    expect(mapping.resolveChatJid({ remoteJid: '999@lid', fromMe: false, id: 'x' })).toBe('999@lid')
  })

  it.each([
    ['conversation', 'text'],
    ['extendedTextMessage', 'text'],
    ['imageMessage', 'image'],
    ['audioMessage', 'audio'],
    ['videoMessage', 'video'],
    ['documentMessage', 'document'],
    ['documentWithCaptionMessage', 'document'],
    ['stickerMessage', 'unsupported'],
    ['locationMessage', 'unsupported'],
    ['pollCreationMessageV3', 'unsupported'],
  ])('maps %s to %s', (messageType, expected) => {
    expect(mapping.mapMessageType(messageType, {})).toBe(expected)
  })

  it('falls back to the message content keys when messageType is missing', () => {
    expect(mapping.mapMessageType(undefined, { imageMessage: {} })).toBe('image')
    expect(mapping.mapMessageType(undefined, {})).toBe('unsupported')
  })

  it('extracts text bodies and media captions', () => {
    expect(mapping.extractBody({ conversation: 'oi' }, 'text')).toBe('oi')
    expect(mapping.extractBody({ extendedTextMessage: { text: 'link' } }, 'text')).toBe('link')
    expect(mapping.extractBody({ imageMessage: { caption: 'foto' } }, 'image')).toBe('foto')
    expect(mapping.extractBody({ documentWithCaptionMessage: { message: { documentMessage: { caption: 'doc' } } } }, 'document')).toBe('doc')
    expect(mapping.extractBody({ audioMessage: {} }, 'audio')).toBeNull()
    expect(mapping.extractBody(null, 'text')).toBeNull()
  })

  it('extracts media metadata', () => {
    expect(mapping.extractMediaMeta({ documentMessage: { mimetype: 'application/pdf', fileName: 'a.pdf', fileLength: '2048' } }, 'document')).toEqual({ mime: 'application/pdf', fileName: 'a.pdf', size: 2048 })
    expect(mapping.extractMediaMeta({ imageMessage: { mimetype: 'image/jpeg', fileLength: 10 } }, 'image')).toEqual({ mime: 'image/jpeg', fileName: null, size: 10 })
    expect(mapping.extractMediaMeta({}, 'image')).toEqual({ mime: null, fileName: null, size: null })
  })

  it('maps delivery statuses', () => {
    expect(mapping.mapStatus('SERVER_ACK')).toBe('sent')
    expect(mapping.mapStatus('DELIVERY_ACK')).toBe('delivered')
    expect(mapping.mapStatus('READ')).toBe('read')
    expect(mapping.mapStatus('PLAYED')).toBe('read')
    expect(mapping.mapStatus('PENDING')).toBeNull()
  })

  it('builds previews for each type', () => {
    expect(mapping.previewFor('text', 'oi')).toBe('oi')
    expect(mapping.previewFor('image', null)).toBe('📷 Imagem')
    expect(mapping.previewFor('image', 'praia')).toBe('📷 Imagem: praia')
    expect(mapping.previewFor('audio', null)).toBe('🎤 Áudio')
    expect(mapping.previewFor('video', null)).toBe('🎬 Vídeo')
    expect(mapping.previewFor('document', null)).toBe('📄 Documento')
    expect(mapping.previewFor('unsupported', null)).toBe('Mensagem não suportada')
  })

  it('converts WhatsApp timestamps (seconds) to dates', () => {
    expect(mapping.timestampToDate(1760000000).toISOString()).toBe('2025-10-09T08:53:20.000Z')
    expect(mapping.timestampToDate('1760000000').getTime()).toBe(1760000000000)
    expect(Math.abs(mapping.timestampToDate(undefined).getTime() - Date.now())).toBeLessThan(1000)
  })
})
