import { ethers } from 'ethers';
import 'dotenv/config';

const LARRY_TOKEN_ADDRESS = '0xad984fbd3fb10d0b47d561be7295685af726fdb3';
const BURN_ADDRESS = '0x0000000000000000000000000000000000000000';

// ERC20 ABI for the functions we need
const ERC20_ABI = [
    "function totalSupply() view returns (uint256)",
    "function balanceOf(address owner) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)"
];

async function main() {
    // Read private key from env
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        throw new Error('Private key not found in environment variables');
    }

    // Setup provider and wallet
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || "https://mainnet.optimism.io");
    const wallet = new ethers.Wallet(privateKey, provider);
    
    // Setup token contract instance
    const tokenContract = new ethers.Contract(LARRY_TOKEN_ADDRESS, ERC20_ABI, wallet);

    try {
        // Get total supply
        const totalSupply = await tokenContract.totalSupply();
        console.log(`Total supply: ${ethers.formatUnits(totalSupply, 18)} tokens`);

        // Calculate 1% of total supply
        const onePercent = totalSupply * BigInt(1) / BigInt(100);
        console.log(`Amount to burn (1%): ${ethers.formatUnits(onePercent, 18)} tokens`);

        // Check our balance first
        const balance = await tokenContract.balanceOf(wallet.address);
        console.log(`Our balance: ${ethers.formatUnits(balance, 18)} tokens`);

        if (balance < onePercent) {
            throw new Error('Insufficient balance to burn 1% of supply');
        }

        // Check allowance first
        const allowance = await tokenContract.allowance(wallet.address, BURN_ADDRESS);
        if (allowance < onePercent) {
            console.log('Approving tokens for burn...');
            const approveTx = await tokenContract.approve(BURN_ADDRESS, onePercent);
            await approveTx.wait();
            console.log('Approval confirmed');
        }

        // Send the tokens to burn address
        console.log('Sending tokens to burn address...');
        const tx = await tokenContract.transfer(BURN_ADDRESS, onePercent, {
            gasLimit: 200000 // Set a specific gas limit
        });
        console.log(`Transaction submitted: ${tx.hash}`);
        
        // Wait for confirmation
        const receipt = await tx.wait();
        console.log('Transaction confirmed!');
        console.log(`Gas used: ${receipt.gasUsed.toString()}`);

        // Verify final burn address balance
        const burnBalance = await tokenContract.balanceOf(BURN_ADDRESS);
        console.log(`Burn address balance after transfer: ${ethers.formatUnits(burnBalance, 18)} tokens`);

    } catch (error) {
        console.error('Error during token burn:', error);
        throw error;
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
