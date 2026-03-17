import type { DeployFormState, ScrapedData } from '../../lib/messages.js';

interface Props {
  form: DeployFormState;
  scraped: ScrapedData;
  imageStatus: 'idle' | 'uploading' | 'done' | 'error';
  imageError?: string;
  deployError?: string;
  onFormChange: (patch: Partial<DeployFormState>) => void;
  onDeploy: () => void;
  onHistory: () => void;
}

export function FormView(_props: Props) {
  return <div>FormView stub</div>;
}
