import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-dark disabled:bg-brand/50',
  secondary: 'bg-paper text-ink border border-ink/80 hover:bg-mist disabled:opacity-50',
  danger: 'bg-paper text-brand border border-brand hover:bg-brand hover:text-white disabled:opacity-50',
  ghost: 'text-ink hover:bg-mist disabled:opacity-50',
}

export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 px-4 h-10 text-sm font-semibold tracking-wide transition-colors disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    />
  )
}
