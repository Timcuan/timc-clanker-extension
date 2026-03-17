export async function uploadToPinata(
  blob: Blob,
  filename: string,
  apiKey: string,
  secretKey: string
): Promise<string> {
  const form = new FormData();
  form.append('file', blob, filename);
  form.append('pinataMetadata', JSON.stringify({ name: filename }));

  const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: {
      pinata_api_key: apiKey,
      pinata_secret_api_key: secretKey,
    },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pinata upload failed: ${res.status} ${text}`);
  }

  const data = await res.json() as { IpfsHash: string };
  return `ipfs://${data.IpfsHash}`;
}
