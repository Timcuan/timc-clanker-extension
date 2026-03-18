// src/popup/views/SourceView.tsx — STUB (will be replaced in Task 11)
import type { ScrapedData, FetchState } from '../../lib/messages.js';

interface Props {
  tabMode: boolean;
  fetchState: FetchState;
  onFetched: (scraped: ScrapedData, mode: 'url' | 'image' | 'contract') => void;
  onFetchStateChange: (state: FetchState) => void;
  onStartFromScratch: () => void;
}

export function SourceView({ onStartFromScratch }: Props) {
  return (
    <div class="view-body" style={{ padding: '20px', textAlign: 'center' }}>
      <p>Source selection (stub)</p>
      <button onClick={onStartFromScratch}>Start from scratch</button>
    </div>
  );
}
