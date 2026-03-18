// src/popup/components/CollapsibleSection.tsx
import { useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

interface Props {
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  children: ComponentChildren;
}

export function CollapsibleSection({ title, summary, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div class="section">
      <div class="section-header" onClick={() => setOpen(o => !o)}>
        <span>{open ? '▼' : '▶'} {title}</span>
        {!open && summary && <span class="summary">{summary}</span>}
      </div>
      <div class={`section-body ${open ? '' : 'hidden'}`}>
        {children}
      </div>
    </div>
  );
}
