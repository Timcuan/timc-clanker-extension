import { describe, it, expect } from 'vitest';
import { encryptPrivateKey, decryptPrivateKey } from '../../background/crypto.js';

const TEST_PK = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
const PASSWORD = 'test-password-123';

describe('vault crypto', () => {
  it('encrypts and decrypts a private key round-trip', async () => {
    const { encryptedPK, iv, salt } = await encryptPrivateKey(TEST_PK, PASSWORD);
    expect(encryptedPK).toBeTruthy();
    expect(iv).toBeTruthy();
    expect(salt).toBeTruthy();

    const decrypted = await decryptPrivateKey(encryptedPK, iv, salt, PASSWORD);
    expect(decrypted).toBe(TEST_PK);
  });

  it('each encryption produces unique iv and salt', async () => {
    const a = await encryptPrivateKey(TEST_PK, PASSWORD);
    const b = await encryptPrivateKey(TEST_PK, PASSWORD);
    expect(a.iv).not.toBe(b.iv);
    expect(a.salt).not.toBe(b.salt);
  });

  it('decryption fails with wrong password', async () => {
    const { encryptedPK, iv, salt } = await encryptPrivateKey(TEST_PK, PASSWORD);
    await expect(decryptPrivateKey(encryptedPK, iv, salt, 'wrong-password')).rejects.toThrow();
  });

  it('encrypted output is base64 string', async () => {
    const { encryptedPK } = await encryptPrivateKey(TEST_PK, PASSWORD);
    expect(() => atob(encryptedPK)).not.toThrow();
  });
});
