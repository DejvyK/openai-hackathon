import type { ComponentProps } from 'react';

// Non-modal, fixed-right adaptation of shadcn/ui Sidebar composition.
// No global keyboard shortcut, portal outside the shadow root or host-page inset.
export function Sidebar({ className = '', ...props }: ComponentProps<'section'>) {
  return <section data-slot="sidebar" data-side="right" className={`agent-card ${className}`} {...props} />;
}
export function SidebarHeader(props: ComponentProps<'header'>) {
  return <header data-slot="sidebar-header" {...props} />;
}
export function SidebarContent(props: ComponentProps<'div'>) {
  return <div data-slot="sidebar-content" {...props} />;
}
export function SidebarFooter(props: ComponentProps<'footer'>) {
  return <footer data-slot="sidebar-footer" {...props} />;
}
