import type { ComponentProps } from 'react';

// Adapted from shadcn/ui's MIT-licensed new-york-v4 registry (see LICENSE.md).
// Tailwind utilities are expressed in shadow-root CSS to avoid host-page styles.
// Button uses the native branch: this extension does not need asChild/Slot.
export function Button({ className = '', variant = 'default', size = 'default', type = 'button', ...props }:
  ComponentProps<'button'> & { variant?: 'default' | 'outline' | 'ghost'; size?: 'default' | 'sm' | 'icon' }) {
  return <button data-slot="button" data-variant={variant} data-size={size} type={type} className={className} {...props} />;
}
export function Input({ className = '', type, ...props }: ComponentProps<'input'>) {
  return <input type={type} data-slot="input" className={className} {...props} />;
}
export function Textarea({ className = '', ...props }: ComponentProps<'textarea'>) {
  return <textarea data-slot="textarea" className={className} {...props} />;
}
export function Card({ className = '', ...props }: ComponentProps<'div'>) {
  return <div data-slot="card" className={className} {...props} />;
}
export function CardContent({ className = '', ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-content" className={className} {...props} />;
}
