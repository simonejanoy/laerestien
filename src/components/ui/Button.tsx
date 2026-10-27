import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'outline' | 'neutral'
type Size = 'sm' | 'lg'

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary/90',
  secondary: 'bg-secondary text-on-primary hover:bg-secondary/90',
  outline: 'border border-surface bg-background text-primary hover:bg-surface-light',
  // «Avbryt» i popupene
  neutral: 'border-[0.5px] border-neutral-400 bg-background text-on-background hover:bg-neutral-100',
}

const sizes: Record<Size, string> = {
  sm: 'gap-1 rounded p-2.5 text-small',
  // Knappene i popupene
  lg: 'min-h-12 gap-2.5 rounded-lg px-6 text-body',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

export function Button({ variant = 'primary', size = 'sm', className = '', ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex cursor-pointer items-center justify-center transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${sizes[size]} ${variants[variant]} ${className}`}
      {...props}
    />
  )
}
