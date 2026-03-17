export function validateGhostConfig(
  config: any,
  yourAddress: `0x${string}`,
  targetAddress: `0x${string}`
): void {
  if (!config.rewards) {
    throw new Error('GHOST: rewards must be explicitly set — SDK default sends 100% to tokenAdmin');
  }

  for (const r of config.rewards.recipients) {
    if (r.admin.toLowerCase() !== yourAddress.toLowerCase()) {
      throw new Error(
        `GHOST: reward slot admin must be your address (${yourAddress}), got ${r.admin}`
      );
    }
  }

  const bpsSum = config.rewards.recipients.reduce((s: number, r: any) => s + r.bps, 0);
  if (bpsSum !== 10_000) {
    throw new Error(`GHOST: reward bps must sum to 10000, got ${bpsSum}`);
  }

  const yourBps = config.rewards.recipients
    .filter((r: any) => r.recipient.toLowerCase() === yourAddress.toLowerCase())
    .reduce((s: number, r: any) => s + r.bps, 0);
  if (yourBps === 0) {
    throw new Error('GHOST: your address has 0 bps — you will receive no fees');
  }

  if (config.vault && (!config.vault.recipient ||
      config.vault.recipient.toLowerCase() === targetAddress.toLowerCase())) {
    throw new Error('GHOST: vault.recipient must be your address, not tokenAdmin');
  }

  if (config.devBuy && (!config.devBuy.recipient ||
      config.devBuy.recipient.toLowerCase() === targetAddress.toLowerCase())) {
    throw new Error('GHOST: devBuy.recipient must be your address, not tokenAdmin');
  }

  if (config.airdrop && (!config.airdrop.admin ||
      config.airdrop.admin.toLowerCase() === targetAddress.toLowerCase())) {
    throw new Error('GHOST: airdrop.admin must be your address, not tokenAdmin');
  }
}
