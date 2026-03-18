// src/popup/views/PreviewView.tsx — STUB (will be replaced in Task 12)
import type { ScrapedData } from '../../lib/messages.js';

interface Props {
  scraped: ScrapedData;
  sourceMode: 'url' | 'image' | 'contract';
  onConfirmAdvanced: (scraped: ScrapedData, imageIpfsUrl: string | undefined) => void;
  onQuickDeploy: (scraped: ScrapedData, imageIpfsUrl: string | undefined) => void;
  onBack: () => void;
}

export function PreviewView({ scraped, onConfirmAdvanced, onBack }: Props) {
  return (
    <div class="view-body" style={{ padding: '20px' }}>
      <button onClick={onBack}>← Back</button>
      <p>Preview: {scraped.name}</p>
      <button onClick={() => onConfirmAdvanced(scraped, undefined)}>Edit Advanced Config →</button>
    </div>
  );
}
