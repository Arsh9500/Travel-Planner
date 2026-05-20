/* global BigInt */

const TRAVEL_API_BASE_URL = process.env.REACT_APP_TRAVEL_API_BASE_URL || "http://127.0.0.1:5000";
const CRYPTO_PAYMENT_ADDRESS = process.env.REACT_APP_CRYPTO_PAYMENT_ADDRESS || "";
const CRYPTO_USD_PER_ETH = Number(process.env.REACT_APP_CRYPTO_USD_PER_ETH || 3000);
const REQUIRED_CHAIN_ID = process.env.REACT_APP_CRYPTO_CHAIN_ID || "";

function getEthereumProvider() {
  return typeof window !== "undefined" ? window.ethereum : null;
}

function usdToEth(usdAmount) {
  const rate = Number.isFinite(CRYPTO_USD_PER_ETH) && CRYPTO_USD_PER_ETH > 0 ? CRYPTO_USD_PER_ETH : 3000;
  return Number(usdAmount || 0) / rate;
}

function ethToWeiHex(ethAmount) {
  const wei = BigInt(Math.max(1, Math.round(Number(ethAmount || 0) * 1e9))) * 1000000000n;
  return `0x${wei.toString(16)}`;
}

export function isWalletAvailable() {
  return Boolean(getEthereumProvider());
}

export function getCryptoPaymentConfig() {
  return {
    paymentAddress: CRYPTO_PAYMENT_ADDRESS,
    requiredChainId: REQUIRED_CHAIN_ID,
    usdPerEth: CRYPTO_USD_PER_ETH,
  };
}

export function estimateEthAmount(usdAmount) {
  return usdToEth(usdAmount).toFixed(6);
}

export async function connectCryptoWallet() {
  const provider = getEthereumProvider();
  if (!provider) {
    throw new Error("MetaMask wallet was not found. Install MetaMask and try again.");
  }

  const accounts = await provider.request({ method: "eth_requestAccounts" });
  const chainId = await provider.request({ method: "eth_chainId" });

  return {
    address: accounts?.[0] || "",
    chainId,
  };
}

export async function sendCryptoPayment({ from, amountUsd }) {
  const provider = getEthereumProvider();
  if (!provider) {
    throw new Error("MetaMask wallet was not found. Install MetaMask and try again.");
  }
  if (!CRYPTO_PAYMENT_ADDRESS) {
    throw new Error("Crypto payment address is not configured.");
  }

  const chainId = await provider.request({ method: "eth_chainId" });
  if (REQUIRED_CHAIN_ID && chainId.toLowerCase() !== REQUIRED_CHAIN_ID.toLowerCase()) {
    throw new Error(`Switch MetaMask to the configured test network (${REQUIRED_CHAIN_ID}).`);
  }

  const txHash = await provider.request({
    method: "eth_sendTransaction",
    params: [
      {
        from,
        to: CRYPTO_PAYMENT_ADDRESS,
        value: ethToWeiHex(usdToEth(amountUsd)),
      },
    ],
  });

  return { txHash, chainId, to: CRYPTO_PAYMENT_ADDRESS, cryptoAmount: estimateEthAmount(amountUsd) };
}

export async function confirmCryptoPayment(payload) {
  const response = await fetch(`${TRAVEL_API_BASE_URL}/payments/crypto/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Crypto payment could not be confirmed right now.");
  }

  return data;
}
