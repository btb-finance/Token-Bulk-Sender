# Optimism Airdrop Distribution System

This project manages token airdrops on any EVM chain, supporting batch processing of up to 300 addresses per transaction for gas efficiency.

## Smart Contract Deployment

1. Deploy your own `LarryAirdrop` contract:
   - Use Remix or your preferred deployment tool
   - Contract is located in `contracts/LarryAirdrop.sol`
   - **Important**: You must deploy your own contract as only the contract owner can perform airdrops
   - After deployment, note down your contract address

2. Configure the token:
   - Set your token address in the script
   - Ensure your token contract has approved your airdrop contract to spend tokens
   - You'll need to be the owner or have approval rights on the token contract

## Chain Configuration

The script works on any EVM-compatible chain. Configure your chain in the `.env`:

```bash
# Chain Configuration
CHAIN_ID=10  # 10 for Optimism, 1 for Ethereum, 137 for Polygon, etc.
RPC_URL=your_rpc_url_here

# Gas Configuration (adjust based on your chain)
GAS_PRICE=0.000000627  # in gwei
GAS_LIMIT=8500000      # adjust based on chain limits
```

Common Chain IDs:
- Ethereum: 1
- Optimism: 10
- BSC: 56
- Polygon: 137
- Arbitrum: 42161
- Avalanche: 43114

## Preparing Holder Data

1. Download holder data from Etherscan:
   - Go to the token contract on Etherscan
   - Navigate to "Holders" tab
   - Click "Download CSV"
   - Save the file as `op.csv` in the project root

2. CSV format requirements:
   - Must contain wallet addresses
   - File must be named exactly `op.csv`
   - Place in project root directory

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
```bash
cp .env.example .env
```

Edit `.env` with:
- `PRIVATE_KEY`: Your wallet's private key (must be the contract owner)
- `HOLDERS_PATH`: Path to save processed addresses (default: `larry_holders.json`)
- `CSV_PATH`: Path to holder addresses (default: `op.csv`)
- Chain and gas settings as shown in Chain Configuration section

## Running the Airdrop

1. Start the distribution:
```bash
npx ts-node scripts/processAirdrop.ts
```

2. Monitor progress:
- Script processes 300 addresses per transaction
- Processed addresses are saved to `larry_holders.json`
- Progress is saved automatically between batches

## Gas Settings

Adjust gas settings in `.env` based on your chain:
```bash
# Example for Optimism
GAS_PRICE=0.000000627  # in gwei
GAS_LIMIT=8500000

# Example for Ethereum
GAS_PRICE=30  # higher gas price for Ethereum
GAS_LIMIT=8000000

# Example for Polygon
GAS_PRICE=50
GAS_LIMIT=8500000
```

## Files

- `contracts/LarryAirdrop.sol`: Smart contract for batch token distribution (you must deploy this)
- `scripts/processAirdrop.ts`: Main distribution script
- `op.csv`: Holder addresses (you must add this)
- `larry_holders.json`: Processed addresses log (auto-generated)

## Important Notes

- You must be the owner of the deployed contract to perform airdrops
- The script automatically tracks processed addresses to prevent duplicates
- Transactions are automatically retried with slightly higher gas if needed
- Progress is saved after each successful batch
- Contract must have sufficient token balance before starting
- Adjust gas settings according to your chosen chain's requirements

## Example Deployment (Optimism)

These are example addresses - you need to deploy your own contract:
- Token Address: `0xad984fbd3fb10d0b47d561be7295685af726fdb3`
- Airdrop Contract: `0x46f82eB56E92fdAAc2099C084e00FBABC86b878a`
