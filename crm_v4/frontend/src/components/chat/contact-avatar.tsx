'use client'

import { useState } from 'react'
import { initials } from '@/lib/format'
import type { Contact } from '@/lib/types'

/** WhatsApp profile URLs expire, so a failed image falls back to initials. */
export function ContactAvatar({ contact, size = 'md' }: { contact: Contact; size?: 'md' | 'lg' }) {
  const [broken, setBroken] = useState(false)
  const box = size === 'lg' ? 'size-11 text-sm' : 'size-10 text-xs'
  if (contact.avatarUrl && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote WhatsApp CDN URL that expires
      <img src={contact.avatarUrl} alt="" onError={() => setBroken(true)} className={`${box} shrink-0 object-cover`} />
    )
  }
  return (
    <span aria-hidden className={`${box} grid shrink-0 place-items-center bg-ink font-display font-extrabold text-white`}>
      {initials(contact)}
    </span>
  )
}
