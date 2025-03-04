"use client"

import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { Space_Grotesk } from 'next/font/google';

// Define the font with weights and subsets
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '700'], // Regular and bold weights
});

export default function Home() {
  const [inputAddress, setInputAddress] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [musdtBalance, setMusdtBalance] = useState<string | null>(null);
  const [etnBalance, setEtnBalance] = useState<string | null>(null); // New state for ETN balance
  const [faucetBalance, setFaucetBalance] = useState<string | null>(null);
  const [faucetEtnBalance, setFaucetEtnBalance] = useState<string | null>(null);

  const FAUCET_ADDRESS: string | undefined = process.env.NEXT_PUBLIC_FAUCET_ADDRESS;
  const MUSDT_ADDRESS: string | undefined = process.env.NEXT_PUBLIC_MUSDT_ADDRESS;
  const RPC_URL: string | undefined = process.env.NEXT_PUBLIC_RPC_URL;
  const CHAIN_ID: string | undefined = process.env.NEXT_PUBLIC_CHAIN_ID;
  const FAUCET_PRIVATE_KEY: string | undefined = process.env.NEXT_PUBLIC_FAUCET_PRIVATE_KEY;

  const ExternalLinkIcon = () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="w-8 h-8 ml-1 inline-block"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
      />
    </svg>
  );

  const FAUCET_ABI = [
    {
      "name": "getFunds",
      "type": "function",
      "stateMutability": "nonpayable",
      "inputs": [{ "name": "_to", "type": "address" }],
      "outputs": []
    }
  ];

  const IERC20_ABI = [
    {
      "constant": true,
      "inputs": [{ "name": "_owner", "type": "address" }],
      "name": "balanceOf",
      "outputs": [{ "name": "balance", "type": "uint256" }],
      "type": "function"
    }
  ];

  if (!FAUCET_ADDRESS || !RPC_URL || !CHAIN_ID || !MUSDT_ADDRESS || !FAUCET_PRIVATE_KEY) {
    console.error('Missing environment variables');
    throw new Error('Required environment variables are missing');
  }

  async function fetchBalance(userAddress: string) {
    try {
      const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

      // Fetch mUSDT balance
      const musdtContract = new ethers.Contract(MUSDT_ADDRESS!, IERC20_ABI, provider);
      const musdtBalanceRaw = await musdtContract.balanceOf(userAddress);
      const musdtFormatted = ethers.utils.formatUnits(musdtBalanceRaw, 18);
      setMusdtBalance(musdtFormatted);

      // Fetch ETN balance (native token)
      const etnBalanceRaw = await provider.getBalance(userAddress);
      const etnFormatted = ethers.utils.formatEther(etnBalanceRaw); // 18 decimals for ETN
      setEtnBalance(etnFormatted);

      return parseFloat(musdtFormatted);
    } catch (error) {
      console.error('Error fetching balances:', error);
      setMusdtBalance('Error');
      setEtnBalance('Error');
      return null;
    }
  }

  // Updated fetchFaucetBalance function
  async function fetchFaucetBalance() {
    try {
      const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

      // Fetch faucet mUSDT balance
      const musdtContract = new ethers.Contract(MUSDT_ADDRESS!, IERC20_ABI, provider);
      const musdtBalance = await musdtContract.balanceOf(FAUCET_ADDRESS!);
      const formattedMusdtBalance = ethers.utils.formatUnits(musdtBalance, 18);
      setFaucetBalance(formattedMusdtBalance);

      // Fetch faucet ETN balance
      const etnBalance = await provider.getBalance(FAUCET_ADDRESS!);
      const formattedEtnBalance = ethers.utils.formatEther(etnBalance); // 18 decimals for ETN
      setFaucetEtnBalance(formattedEtnBalance);
    } catch (error) {
      console.error('Error fetching faucet balances:', error);
      setFaucetBalance('Error');
      setFaucetEtnBalance('Error');
    }
  }

  async function requestFunds() {
    const trimmedAddress = inputAddress.trim();
    if (!trimmedAddress) {
      setStatusMessage('Please enter an address');
      return;
    }

    if (!ethers.utils.isAddress(trimmedAddress)) {
      setStatusMessage('Invalid Ethereum address');
      return;
    }

    setIsSending(true);
    setStatusMessage('Checking balance...');

    try {
      // Check user's mUSDT balance
      const musdtBalance = await fetchBalance(trimmedAddress);
      if (musdtBalance === null) {
        setStatusMessage('Failed to check balance');
        setIsSending(false);
        return;
      }

      if (musdtBalance >= 1000) {
        setStatusMessage('This address already has 1,000 or more mUSDT');
        setIsSending(false);
        return;
      }

      setStatusMessage('Sending funds...');

      const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
      const wallet = new ethers.Wallet(FAUCET_PRIVATE_KEY!, provider);
      const faucetContract = new ethers.Contract(FAUCET_ADDRESS!, FAUCET_ABI, wallet);

      const tx = await faucetContract.getFunds(trimmedAddress, {
        gasLimit: ethers.utils.hexlify(100000)
      });

      setStatusMessage('Transaction submitted! Waiting for confirmation...');
      const receipt = await tx.wait();

      setStatusMessage(`Success! 10,000 mUSDT and 0.5 ETN sent. Tx: ${receipt.transactionHash}`);
      await fetchFaucetBalance();
      await fetchBalance(trimmedAddress);
    } catch (error) {
      console.error('Token request error:', error);
      if (error instanceof Error) {
        const errorMessage = error.message;
        const errorReason = 'reason' in error ? (error as unknown as { reason: string }).reason : null;

        if (errorMessage.includes('insufficient funds')) {
          setStatusMessage('Faucet is out of funds or gas');
        } else if (errorMessage.includes('revert')) {
          setStatusMessage('Transaction reverted - possible issue with faucet contract');
        } else {
          setStatusMessage(`Error: ${errorReason || errorMessage}`);
        }
      } else {
        setStatusMessage('An unknown error occurred during token request');
      }
    } finally {
      setIsSending(false);
    }
  }

  useEffect(() => {
    fetchFaucetBalance();
  }, []);

  const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputAddress(e.target.value);
    setStatusMessage('');
    setMusdtBalance(null);
    setEtnBalance(null); // Reset ETN balance too
  };

  return (
    <div className={`min-h-screen flex flex-col bg-black text-white ${spaceGrotesk.className}`}>
      <title>Electroneum Faucet</title>
      <meta name="description" content="Request mUSDT tokens and ETN for testing" />

      <nav className="bg-black p-4 border-b border-gray-800">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold text-cyan-400">ETN Mainnet Faucet by NexTrack</h1>
          <div className="text-cyan-300 text-lg font-bold">
            <p>
              Faucet mUSDT: {faucetBalance === null ? 'Loading...' : `${Number(faucetBalance).toLocaleString()} mUSDT`}
            </p>
            <p>
              Faucet ETN: {faucetEtnBalance === null ? 'Loading...' : `${Number(faucetEtnBalance).toLocaleString()} ETN`}
            </p>
          </div>
        </div>
      </nav>

      {/* Banner */}
      {(faucetBalance !== null && faucetEtnBalance !== null &&
        (parseFloat(faucetBalance) < 10000 || parseFloat(faucetEtnBalance) < 0.5)) && (
          <div className="bg-red-900 text-xl text-red-100 p-4 text-center border-b border-red-700 font-bold">
            <p>
              Faucet is out of funds, please consider sending some to{' '}
              <span className="font-mono">0xD2d3F84d881b4205f18fE933729689508c4dF653</span>{' '}
              OR contact me on{' '}
              <a
                href="https://t.me/psy_tan"
                className="text-cyan-300 hover:text-cyan-200 underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Telegram
              </a>
            </p>
          </div>
        )}

      <main className="flex flex-col items-center justify-center w-full flex-1 px-4 sm:px-20 text-center">
        <h1 className="text-3xl sm:text-4xl font-bold mb-8 text-cyan-400">
          Request <span className="text-white">10,000 mUSDT</span> and <span className="text-white">0.5 ETN</span> for checking out{' '}
          <a
            href="https://nextrack-ui.vercel.app/"
            className="text-cyan-300 hover:text-cyan-200 underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            NexTrack <ExternalLinkIcon />
          </a>

        </h1>

        <div className="mb-6 w-full max-w-md">
          <input
            type="text"
            value={inputAddress}
            onChange={handleAddressChange}
            placeholder="Enter your Electroneum mainnet address (0x...)"
            className="w-full bg-gray-800/50 border border-gray-700 rounded-lg py-3 px-4 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 mb-4"
          />
          <button
            onClick={requestFunds}
            disabled={isSending || (faucetBalance !== null && faucetEtnBalance !== null &&
              (parseFloat(faucetBalance) < 10000 || parseFloat(faucetEtnBalance) < 0.5))}
            className={`w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-8 rounded-lg text-xl transition duration-200 ease-in-out transform hover:scale-105 ${isSending || (faucetBalance !== null && faucetEtnBalance !== null && (parseFloat(faucetBalance) < 10000 || parseFloat(faucetEtnBalance) < 0.5)) ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isSending ? 'Processing...' : 'Request 10,000 mUSDT & 0.5 ETN'}
          </button>
          {(musdtBalance !== null || etnBalance !== null) && (
            <div className="text-gray-300 mt-2">
              <p>
                mUSDT Balance: {musdtBalance === 'Error' || musdtBalance === null ? 'Error' : `${Number(musdtBalance).toLocaleString()} mUSDT`}
              </p>
              <p>
                ETN Balance: {etnBalance === 'Error' || etnBalance === null ? 'Error' : `${Number(etnBalance).toLocaleString()} ETN`}
              </p>
            </div>
          )}
        </div>

        {statusMessage && (
          <div className={`mt-6 p-4 rounded-lg ${statusMessage.includes('Success')
            ? 'bg-green-900 text-green-200 border border-green-700'
            : 'bg-yellow-900 text-yellow-200 border border-yellow-700'
            }`}>
            {statusMessage}
          </div>
        )}
      </main>

      <footer className="bg-black p-4 border-t border-gray-800">
        <div className="max-w-7xl mx-auto text-center text-gray-400">
          Made with <span className="text-red-500">❤️</span> by{' '}
          <a
            href="https://github.com/Psyphon361"
            className="text-cyan-300 hover:text-cyan-200 underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Tanish Sharma
          </a>
        </div>
        <div className="max-w-7xl mx-auto text-center text-gray-400 mt-2">
          Powered by Electroneum • Use for testing purposes only
        </div>
      </footer>
    </div>
  );
}