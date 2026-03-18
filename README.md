# Clanker Token Deployer

Chrome MV3 extension for deploying ERC-20 tokens on Base Chain using the Clanker protocol.

> Screenshot coming soon

## Features

- **Three source modes** — paste a URL (Twitter/Farcaster/GMGN), drag-and-drop an image, or enter a contract address
- **Smart metadata fetch** — OG meta scraping + SPA background-tab routing for URL sources; parallel Clanker API + on-chain RPC for contract sources
- **macOS white UI** — `#F5F5F7` background, `#0052FF` Base Chain Blue accent, Apple-style cards and system fonts
- **Ghost Deploy** — token appears created by a different address
- **Batch deploy** — deploy across multiple wallets in one flow
- **Vault encryption** — AES-256-GCM encrypted private key storage
- **Advanced params** — fee reward splits, dynamic fees, sniper protection, vanity address generation

## Architecture

```
entrypoints/
  background.ts   — service worker: deploy, fees, history
  content.ts      — page scrapers (Twitter, Farcaster, GMGN, generic)
src/
  lib/            — shared logic (no UI dependencies)
    bg-tab.ts     — background tab lifecycle (mutex + retry)
    url-fetcher.ts       — URL → scraped metadata (OG + SPA routing)
    token-fetcher.ts     — contract address → token metadata (Clanker API + RPC)
    image-pipeline.ts    — IPFS upload via Pinata + URL validation
    deploy-context-builder.ts — build ClankerSDK deploy params
    messages.ts   — typed message bus between popup ↔ background
  popup/
    App.tsx       — view state machine (source→preview→form→confirm→pending→success)
    views/        — SourceView, PreviewView, FormView, ConfirmView, PendingView, SuccessView
    popup.css     — macOS white theme (Tailwind v4 @theme)
  background/     — service worker handlers (deploy, fees, vault, batch, history)
  content/        — per-platform scrapers + parsers
public/icons/     — extension icons (16/32/48/128px)
```

## Setup

```bash
# Prerequisites: Node 20+, pnpm 10+
pnpm install
pnpm build          # output → .output/chrome-mv3/
pnpm test           # 92 tests
pnpm dev            # watch mode
```

## Load in Chrome

1. Navigate to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `.output/chrome-mv3/` directory
5. The extension icon appears in the toolbar

## Configuration

Open the extension **Options** page to configure:

- **Pinata API key** — required for IPFS image uploads
- **Wallet vault** — add/manage encrypted private keys (AES-256-GCM)
- **Reward splits** — set fee recipient addresses and percentage splits

## View Flow

```
Source → Preview → Form → Confirm → Pending → Success
  ↑                  ↓
  └──────────────────┘ (quick deploy skips Form)
```

## License

MIT
