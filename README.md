# HorizonLift

HorizonLift is a privacy-preserving crowdfunding dApp built on FHEVM. It lets creators run a single fundraising
campaign while keeping individual contribution amounts confidential using fully homomorphic encryption (FHE).

## Overview

HorizonLift focuses on one clear workflow: configure a campaign, collect encrypted contributions in cUSDT, and
close the campaign to release funds. Contributors and the campaign owner can decrypt their own permitted values,
while on-chain accounting remains encrypted end-to-end.

## Problem It Solves

Traditional on-chain fundraising exposes who contributed and how much, which can cause:
- Donor privacy loss and unwanted profiling.
- Social pressure or signaling based on public amounts.
- Copycat behavior or strategic fundraising manipulation.
- Lack of confidentiality when donations are sensitive.

HorizonLift keeps contribution values encrypted without losing on-chain enforcement of rules like end time,
ownership, and accounting.

## Key Features

- Campaign configuration with name, target amount, and end time.
- Confidential contributions in cUSDT using FHEVM encryption.
- Encrypted per-contributor totals and encrypted global total.
- Owner-controlled campaign close with encrypted payout.
- Read-only accessors for campaign metadata and status.

## Advantages

- Privacy by design: contribution values never appear in plaintext on-chain.
- Verifiable rules: campaign timing and closure are enforced by the smart contract.
- Minimal trust: contributors can decrypt their own totals; the owner can decrypt totals and contributions that are
  explicitly allowed by the contract.
- Composable token standard: uses ERC7984 confidential token semantics.
- Clear operational model: single campaign per deployment keeps the logic simple and auditable.

## Technology Stack

- Smart contracts: Solidity 0.8.27, Hardhat, hardhat-deploy
- Confidential computing: Zama FHEVM, Zama Solidity libraries
- Tokens: OpenZeppelin confidential contracts (ERC7984)
- Frontend: React + Vite
- Wallets and chains: RainbowKit
- Contract reads: viem
- Contract writes: ethers

## Repository Structure

```
contracts/            Confidential smart contracts
  ConfidentialFundraising.sol
  ConfidentialUSDT.sol
deploy/               Deployment scripts
home/                 Frontend (React + Vite)
tasks/                Hardhat tasks
 test/                Contract tests
```

## Smart Contracts

### ConfidentialUSDT
- ERC7984-compatible confidential token used for contributions.
- `mint(address to, uint64 amount)` mints encrypted cUSDT (intended for test and demo flows).

### ConfidentialFundraising
- Stores a single campaign (name, target amount, end time, closed flag).
- Accepts encrypted contributions via `contribute(externalEuint64, bytes)`.
- Tracks encrypted totals per contributor and globally.
- Releases encrypted funds to the owner via `endFundraising()`.
- Exposes read-only views:
  - `getContributionOf(address)`
  - `getTotalRaised()`
  - `getCampaignDetails()`
  - `paymentTokenAddress()`
  - `isActive()`

## End-to-End Flow

1. Owner deploys `ConfidentialUSDT` and `ConfidentialFundraising`.
2. Owner configures campaign details (name, target, end time).
3. Contributors approve the fundraising contract as an operator and contribute encrypted cUSDT.
4. Contract updates encrypted totals (per-user and global).
5. Owner ends the campaign and receives encrypted funds.

## Development Setup

### Prerequisites
- Node.js 20+
- npm

### Install Dependencies

```bash
npm install
cd home
npm install
```

### Compile and Test

```bash
npm run compile
npm run test
```

### Local Deployment (for contract development)

```bash
npx hardhat node
npx hardhat deploy --network localhost
```

### Sepolia Deployment

The Hardhat config expects a private key and an RPC provider key. Use a private key only (no mnemonic).

Environment variables used by the deploy script:
- `PRIVATE_KEY`
- `INFURA_API_KEY`
- `ETHERSCAN_API_KEY` (optional, for verification)

```bash
npx hardhat deploy --network sepolia
npx hardhat verify --network sepolia <CONTRACT_ADDRESS>
```

### Hardhat Tasks

```bash
npx hardhat task:fundraising-address --network sepolia
npx hardhat task:contribute --value 100 --network sepolia
npx hardhat task:decrypt-total --network sepolia
```

## Frontend Notes

- The frontend lives in `home/` and uses viem for reads and ethers for writes.
- Wallet connections are handled through RainbowKit.
- Copy the ABI arrays from `deployments/sepolia/ConfidentialFundraising.json` and
  `deployments/sepolia/ConfidentialUSDT.json` into frontend TypeScript files. Do not import JSON ABI files.
- The frontend is designed to connect to Sepolia (no localhost network).

## Security and Privacy Model

- Contribution amounts are encrypted on-chain using FHEVM.
- The contract explicitly allows decryption by the contributor and the campaign owner.
- Anyone can read encrypted values, but only allowed parties can decrypt them.
- This repository has not been audited; treat it as a testnet or experimental project.

## Limitations

- Single campaign per deployment.
- No refund or cancellation flow after contributions.
- `ConfidentialUSDT` minting is unrestricted in this demo contract.
- Encrypted totals require FHEVM tooling to decrypt.

## Future Roadmap

- Multi-campaign support with factory deployments.
- Role-based minting or integration with real confidential stablecoins.
- Campaign milestones and conditional releases.
- Contributor privacy upgrades such as selective disclosure settings.
- Frontend analytics with optional, user-controlled decryptions.

## License

BSD-3-Clause-Clear. See `LICENSE` for details.
