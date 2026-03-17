interface Props {
  tokenAddress: `0x${string}`;
  txHash: `0x${string}`;
  chainId: number;
  name: string;
  symbol: string;
  onDeployAnother: () => void;
}

export function SuccessView(_props: Props) {
  return <div>SuccessView stub</div>;
}
