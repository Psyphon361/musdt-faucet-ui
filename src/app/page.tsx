"use client"

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<string[] | unknown>;
      on: (event: 'accountsChanged', callback: (accounts: string[]) => void) => void;
      removeListener: (event: 'accountsChanged', callback: (accounts: string[]) => void) => void;
    };
  }
}

import { useState, useEffect } from 'react';
import { ethers } from 'ethers';

export default function Home() {
  const [isConnected, setIsConnected] = useState(false);
  const [account, setAccount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [musdtBalance, setMusdtBalance] = useState<string | null>(null);
  const [faucetBalance, setFaucetBalance] = useState<string | null>(null);

  const FAUCET_ADDRESS: string | undefined = process.env.NEXT_PUBLIC_FAUCET_ADDRESS;
  const MUSDT_ADDRESS: string | undefined = process.env.NEXT_PUBLIC_MUSDT_ADDRESS;
  const RPC_URL: string | undefined = process.env.NEXT_PUBLIC_RPC_URL;
  const CHAIN_ID: string | undefined = process.env.NEXT_PUBLIC_CHAIN_ID;

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

  if (!FAUCET_ADDRESS || !RPC_URL || !CHAIN_ID || !MUSDT_ADDRESS) {
    console.error('Missing environment variables');
    throw new Error('Required environment variables are missing');
  }

  async function connectWallet() {
    if (!window.ethereum) {
      setStatusMessage('Please install MetaMask or another web3 wallet');
      return;
    }

    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }) as string[];
      setAccount(accounts[0]);
      setIsConnected(true);

      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${parseInt(CHAIN_ID!).toString(16)}` }],
      });
      await fetchBalance(accounts[0]);
      await fetchFaucetBalance();
    } catch (error) {
      console.error('Connection error:', error);
      if (error instanceof Error && 'code' in error) {
        const errorCode = (error as { code: number }).code;
        if (errorCode === 4902) {
          setStatusMessage('Please add the network to MetaMask');
        } else if (errorCode === -32002) {
          setStatusMessage('Please unlock or connect your wallet');
        } else {
          setStatusMessage('Failed to connect wallet');
        }
      } else {
        setStatusMessage('An unknown error occurred');
      }
    }
  }

  async function fetchBalance(userAddress: string) {
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum!);
      const musdtContract = new ethers.Contract(MUSDT_ADDRESS!, IERC20_ABI, provider);
      const balance = await musdtContract.balanceOf(userAddress);
      const formattedBalance = ethers.utils.formatUnits(balance, 18);
      setMusdtBalance(formattedBalance);
    } catch (error) {
      console.error('Error fetching balance:', error);
      setMusdtBalance('Error');
    }
  }

  async function fetchFaucetBalance() {
    try {
      const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
      const musdtContract = new ethers.Contract(MUSDT_ADDRESS!, IERC20_ABI, provider);
      const balance = await musdtContract.balanceOf(FAUCET_ADDRESS!);
      const formattedBalance = ethers.utils.formatUnits(balance, 18);
      setFaucetBalance(formattedBalance);
    } catch (error) {
      console.error('Error fetching faucet balance:', error);
      setFaucetBalance('Error');
    }
  }

  async function requestTokens() {
    if (!isConnected) {
      setStatusMessage('Please connect your wallet first');
      return;
    }

    setIsLoading(true);
    setStatusMessage('Requesting tokens...');

    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum!);
      const signer = provider.getSigner();
      const faucetContract = new ethers.Contract(FAUCET_ADDRESS!, FAUCET_ABI, signer);

      const tx = await faucetContract.getFunds(account, {
        gasLimit: ethers.utils.hexlify(100000)
      });

      setStatusMessage('Transaction submitted! Waiting for confirmation...');
      const receipt = await tx.wait();

      setStatusMessage(`Success! 10,000 mUSDT sent. Tx: ${receipt.transactionHash}`);
      await fetchBalance(account);
      await fetchFaucetBalance();
    } catch (error) {
      console.error('Token request error:', error);
      if (error instanceof Error) {
        const errorCode = 'code' in error ? (error as { code: string | number }).code : null;
        const errorMessage = error.message;
        const errorReason = 'reason' in error ? (error as { reason: string }).reason : null;

        if (errorCode === 'INSUFFICIENT_FUNDS') {
          setStatusMessage('Faucet might be out of funds');
        } else if (errorMessage?.includes('revert')) {
          setStatusMessage('Transaction reverted - you might already have tokens or hit a limit');
        } else {
          setStatusMessage(`Error: ${errorReason || errorMessage}`);
        }
      } else {
        setStatusMessage('An unknown error occurred during token request');
      }
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        setIsConnected(false);
        setAccount('');
        setMusdtBalance(null);
        setStatusMessage('Wallet disconnected');
      } else {
        setAccount(accounts[0]);
        setIsConnected(true);
        fetchBalance(accounts[0]);
      }
    };

    window.ethereum.on('accountsChanged', handleAccountsChanged);

    return () => {
      window.ethereum?.removeListener('accountsChanged', handleAccountsChanged);
    };
  }, [CHAIN_ID, fetchBalance]);

  useEffect(() => {
    if (isConnected && account) {
      fetchBalance(account);
      fetchFaucetBalance();
    }
  }, [account, isConnected, fetchBalance]);

  useEffect(() => {
    fetchFaucetBalance();
  }, []);

  const hasEnoughFunds = musdtBalance ? parseFloat(musdtBalance) > 1000 : false;

  return (
    <div className="min-h-screen flex flex-col bg-black text-white">
      <title>mUSDT Faucet</title>
      <meta name="description" content="Request mUSDT tokens for testing" />

      <nav className="bg-black p-4 border-b border-gray-800">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold text-cyan-400">mUSDT Faucet by NexTrack</h1>
          <p className="text-cyan-300 text-lg font-bold">
            Faucet Balance: {faucetBalance === null ? 'Loading...' : `${Number(faucetBalance).toLocaleString()} mUSDT`}
          </p>
        </div>
      </nav>

      <main className="flex flex-col items-center justify-center w-full flex-1 px-4 sm:px-20 text-center">
        <h1 className="text-3xl sm:text-4xl font-bold mb-8 text-cyan-400">
          Request mUSDT tokens for checking out{' '}
          <a
            href="https://nextrack-ui.vercel.app/"
            className="text-cyan-300 hover:text-cyan-200 underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            NexTrack
          </a>
        </h1>

        {!isConnected ? (
          <button
            onClick={connectWallet}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-lg transition duration-200 ease-in-out transform hover:scale-105 mb-6"
          >
            Connect Wallet
          </button>
        ) : (
          <div className="mb-6">
            <p className="text-gray-300 mb-2">Connected: {account.substring(0, 6)}...{account.substring(account.length - 4)}</p>
            <p className="text-gray-300 mb-4">
              mUSDT Balance: {musdtBalance === null ? 'Loading...' : `${Number(musdtBalance).toLocaleString()} mUSDT`}
            </p>
            <button
              onClick={requestTokens}
              disabled={isLoading || hasEnoughFunds}
              className={`bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-8 rounded-lg text-xl transition duration-200 ease-in-out transform hover:scale-105 ${(isLoading || hasEnoughFunds) ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isLoading ? 'Processing...' : hasEnoughFunds ? 'You already have funds!' : 'Request 10,000 mUSDT!'}
            </button>
          </div>
        )}

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