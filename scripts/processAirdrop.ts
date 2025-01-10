import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';
import * as csv from 'csv-parse/sync';

const LARRY_TOKEN_ADDRESS = '0xad984fbd3fb10d0b47d561be7295685af726fdb3';
const AIRDROP_CONTRACT_ADDRESS = '0x46f82eB56E92fdAAc2099C084e00FBABC86b878a';
const BATCH_SIZE = 300; // Contract expects 300 addresses per batch
const AIRDROP_AMOUNT = ethers.parseUnits('1000000000', 18); // 1 billion tokens per address
let gasLimit = 4000000; // Make gas limit mutable

// ABI for the token and airdrop contract
const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)"
];

const AIRDROP_ABI = [
    "function airdropTokens(address[] calldata _recipients) external"
];

// Add sleep function at the top
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

async function rechargeContract(
    tokenContract: ethers.Contract,
    requiredAmount: bigint,
    currentBalance: bigint,
    wallet: ethers.Wallet
): Promise<boolean> {
    const amountToTransfer = requiredAmount - currentBalance;
    console.log(`Attempting to transfer ${ethers.formatUnits(amountToTransfer, 18)} tokens to airdrop contract...`);
    
    try {
        // First check allowance
        const owner = await wallet.getAddress();
        const allowance = await tokenContract.allowance(owner, AIRDROP_CONTRACT_ADDRESS);
        
        if (allowance < amountToTransfer) {
            console.log('Approving tokens for transfer...');
            const approveTx = await tokenContract.approve(AIRDROP_CONTRACT_ADDRESS, amountToTransfer);
            await approveTx.wait();
            console.log('Approval confirmed');
        }

        const tx = await tokenContract.transfer(AIRDROP_CONTRACT_ADDRESS, amountToTransfer);
        console.log(`Recharge transaction submitted: ${tx.hash}`);
        await tx.wait();
        console.log('Recharge transaction confirmed');
        
        // Quick balance check
        const newBalance = await tokenContract.balanceOf(AIRDROP_CONTRACT_ADDRESS);
        console.log(`New contract balance after recharge: ${ethers.formatUnits(newBalance, 18)} tokens`);
        
        return newBalance >= requiredAmount;
    } catch (error) {
        console.error('Error recharging contract:', error);
        return false;
    }
}

// Cache for processed addresses to reduce disk I/O
let processedAddressesCache: Set<string> = new Set();
let pendingWrites: string[] = [];
const WRITE_BATCH_SIZE = 1000; // Write to disk every 1000 addresses

async function loadProcessedAddresses(holdersPath: string): Promise<Set<string>> {
    try {
        if (fs.existsSync(holdersPath)) {
            console.log('Loading processed addresses...');
            const content = fs.readFileSync(holdersPath, 'utf-8');
            const addresses = JSON.parse(content);
            console.log(`Loaded ${addresses.length} processed addresses`);
            return new Set(addresses);
        }
    } catch (error) {
        console.error('Error loading processed addresses:', error);
        // If there's an error reading the file, start fresh
        return new Set();
    }
    console.log('No existing holders file found, starting fresh');
    return new Set();
}

async function saveProcessedAddresses(addresses: string[], holdersPath: string, force: boolean = false) {
    pendingWrites.push(...addresses);
    
    if (pendingWrites.length >= WRITE_BATCH_SIZE || force) {
        try {
            const currentAddresses = processedAddressesCache;
            pendingWrites.forEach(addr => currentAddresses.add(addr));
            
            // Write to a temporary file first
            const tempPath = `${holdersPath}.temp`;
            fs.writeFileSync(tempPath, JSON.stringify(Array.from(currentAddresses), null, 2));
            
            // Rename temp file to actual file (atomic operation)
            fs.renameSync(tempPath, holdersPath);
            
            console.log(`Saved ${pendingWrites.length} addresses to ${holdersPath}`);
            pendingWrites = [];
        } catch (error) {
            console.error('Error saving addresses:', error);
            // Keep the pending writes for next attempt
        }
    }
}

async function readCSVAddresses(csvPath: string): Promise<string[]> {
    console.log('Reading CSV file...');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    let records: any[];

    try {
        // First try parsing with headers
        records = csv.parse(csvContent, {
            columns: true,
            skip_empty_lines: true,
            trim: true
        });
    } catch (error) {
        // If that fails, try parsing without headers
        console.log('Parsing CSV without headers...');
        records = csv.parse(csvContent, {
            columns: false,
            skip_empty_lines: true,
            trim: true
        });
    }

    const addresses = new Set<string>();
    
    records.forEach((record: any) => {
        let address: string | undefined;
        
        if (Array.isArray(record)) {
            // If record is an array, try each column
            for (const col of record) {
                if (typeof col === 'string' && ethers.isAddress(col)) {
                    address = col;
                    break;
                }
            }
        } else {
            // Try various possible column names
            const possibleColumns = [
                'HolderAddress', 'holderAddress', 'HOLDERADDRESS',
                'address', 'Address', 'ADDRESS',
                'wallet', 'Wallet', 'WALLET'
            ];
            
            for (const col of possibleColumns) {
                if (record[col] && ethers.isAddress(record[col])) {
                    address = record[col];
                    break;
                }
            }
        }
        
        if (address && ethers.isAddress(address)) {
            addresses.add(address.toLowerCase()); // Normalize addresses to lowercase
        }
    });

    const validAddresses = Array.from(addresses);
    console.log(`Found ${validAddresses.length} valid addresses in CSV`);
    return validAddresses;
}

// Add gas price settings
const BASE_GAS_PRICE = ethers.parseUnits('0.000000627', 'gwei');
const GAS_SETTINGS = {
    maxFeePerGas: BASE_GAS_PRICE,
    maxPriorityFeePerGas: BASE_GAS_PRICE,
    gasLimit: 8500000
};

// Function to get gas settings with optional increment
function getGasSettings(retryCount: number = 0) {
    const baseGasPrice = BigInt(ethers.parseUnits('0.000000627', 'gwei'));
    const increment = retryCount > 0 ? BigInt(ethers.parseUnits('0.000000001', 'gwei')) * BigInt(retryCount) : BigInt(0);
    const totalGasPrice = baseGasPrice + increment;
    
    return {
        maxFeePerGas: totalGasPrice,
        maxPriorityFeePerGas: totalGasPrice,
        gasLimit: GAS_SETTINGS.gasLimit
    };
}

// Add transaction timeout
const TX_TIMEOUT = 60000; // 60 seconds timeout

// Add function to wait for transaction with timeout
async function waitForTransaction(provider: ethers.Provider, txHash: string): Promise<ethers.TransactionReceipt | null> {
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Transaction timeout')), TX_TIMEOUT);
    });

    try {
        const receiptPromise = provider.waitForTransaction(txHash, 1);
        const result = await Promise.race([
            receiptPromise,
            timeoutPromise
        ]) as ethers.TransactionReceipt;
        
        return result;
    } catch (err) {
        const error = err as Error;
        if (error.message === 'Transaction timeout') {
            // Check if transaction is still pending
            return await provider.getTransactionReceipt(txHash);
        }
        throw error;
    }
}

async function main() {
    // Read private key from env
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        throw new Error('Private key not found in environment variables');
    }

    // Setup provider and wallet
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || "https://mainnet.optimism.io");
    const wallet = new ethers.Wallet(privateKey, provider);
    
    // Setup contract instances
    const tokenContract = new ethers.Contract(LARRY_TOKEN_ADDRESS, ERC20_ABI, wallet);
    const airdropContract = new ethers.Contract(AIRDROP_CONTRACT_ADDRESS, AIRDROP_ABI, wallet);

    // Check contract balance first
    const contractBalance = await tokenContract.balanceOf(AIRDROP_CONTRACT_ADDRESS);
    console.log(`Contract balance: ${ethers.formatUnits(contractBalance, 18)} tokens`);

    // Load processed addresses into cache
    const holdersPath = path.join(__dirname, '../larry_holders.json');
    processedAddressesCache = await loadProcessedAddresses(holdersPath);

    // Read CSV addresses
    const csvPath = path.join(__dirname, '../op.csv');
    const allAddresses = await readCSVAddresses(csvPath);
    
    // Filter out already processed addresses
    const eligibleAddresses = allAddresses.filter(addr => !processedAddressesCache.has(addr.toLowerCase()));
    console.log(`Total eligible addresses to process: ${eligibleAddresses.length}`);

    if (eligibleAddresses.length === 0) {
        console.log('No new addresses to process');
        return;
    }

    let currentNonce = await wallet.getNonce();

    // Process in batches
    for (let i = 0; i < eligibleAddresses.length; i += BATCH_SIZE) {
        const batch = eligibleAddresses.slice(i, i + BATCH_SIZE);
        console.log(`\nProcessing batch ${Math.floor(i/BATCH_SIZE) + 1}, addresses ${i} to ${i + batch.length}`);

        let retryCount = 0;
        const MAX_RETRIES = 3;

        while (retryCount < MAX_RETRIES) {
            try {
                // Verify batch addresses
                for (const addr of batch) {
                    if (!ethers.isAddress(addr)) {
                        throw new Error(`Invalid address in batch: ${addr}`);
                    }
                }

                // Check contract balance before sending
                const currentBalance = await tokenContract.balanceOf(AIRDROP_CONTRACT_ADDRESS);
                const requiredBalance = BigInt(batch.length) * AIRDROP_AMOUNT;
                
                if (currentBalance < requiredBalance) {
                    throw new Error('Insufficient contract balance');
                }

                // Get gas settings with potential increment for retries
                const gasSettings = getGasSettings(retryCount);
                console.log(`Using gas price: ${ethers.formatUnits(gasSettings.maxFeePerGas, 'gwei')} gwei`);

                // Submit transaction with current gas settings
                const tx = await airdropContract.airdropTokens(batch, { 
                    nonce: currentNonce++,
                    ...gasSettings
                });
                
                console.log(`Transaction submitted: ${tx.hash}`);
                console.log('Waiting for confirmation...');
                
                // Wait for transaction with timeout
                const receipt = await waitForTransaction(provider, tx.hash);
                
                if (!receipt || receipt.status === 0) {
                    throw new Error(`Transaction failed: ${tx.hash}`);
                }
                
                console.log(`Transaction confirmed successfully. Gas used: ${receipt.gasUsed}`);
                
                // Save progress
                await saveProcessedAddresses(batch, holdersPath);
                console.log(`Remaining addresses to process: ${eligibleAddresses.length - (i + batch.length)}`);

                // Short delay between batches
                await sleep(1000);
                
                break; // Exit retry loop on success
            } catch (err) {
                const error = err as Error;
                console.error(`Attempt ${retryCount + 1} failed:`, error.message);
                
                if (error.message.includes('insufficient funds')) {
                    console.log('Insufficient funds, checking balance...');
                    const balance = await provider.getBalance(wallet.address);
                    console.log(`Wallet balance: ${ethers.formatEther(balance)} ETH`);
                    throw error;
                }
                
                if (error.message.includes('nonce too low') || error.message.includes('replacement fee too low')) {
                    // Get new nonce and retry with higher gas
                    currentNonce = await wallet.getNonce();
                    console.log(`Updating nonce to: ${currentNonce}`);
                    retryCount++; // This will increase gas price on next attempt
                    continue;
                }
                
                retryCount++;
                if (retryCount === MAX_RETRIES) {
                    console.error('Max retries reached, saving progress and exiting');
                    await saveProcessedAddresses([], holdersPath, true);
                    throw error;
                }
                
                await sleep(2000 * retryCount);
            }
        }
    }

    // Save any remaining addresses
    await saveProcessedAddresses([], holdersPath, true);
    console.log('Airdrop completed successfully!');
}

main().catch(console.error);
