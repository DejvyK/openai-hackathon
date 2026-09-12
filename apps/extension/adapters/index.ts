import { extractDemo } from './demo';
import { extractLinkedIn } from './linkedin';
import { extractSelection } from './selection';
import { emptyContext, type BrowserContext, type ContextCapture } from './types';

export function extractPageContext(doc: Document, selection: Selection | null = doc.getSelection()): ContextCapture {
  return extractSelection(doc, selection) ?? extractLinkedIn(doc) ?? extractDemo(doc)
    ?? { context: emptyContext(doc), anchor: doc.querySelector('main') ?? doc.body };
}

export function contextFingerprint(context: BrowserContext): string {
  return JSON.stringify([context.url, context.kind, context.person, context.selection, context.adapter]);
}

export function resolveActions(context: BrowserContext) {
  if (context.kind === 'profile') return [{ id: 'contact_followup' as const, label: 'Research & prepare follow-up' }];
  if (context.kind === 'selection') return [{ id: 'research_note' as const, label: 'Research selection' }];
  return [];
}
