import type { DeployFormState } from '../../lib/messages.js';

interface Props {
  form: DeployFormState;
  onBack: () => void;
  onConfirm: () => void;
}

export function ConfirmView(_props: Props) {
  return <div>ConfirmView stub</div>;
}
