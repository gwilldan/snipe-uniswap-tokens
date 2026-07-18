import { parseEther, type Hex } from 'viem';
import type { RuntimeConfig } from './types';

const BUY_AMOUNT_ETH = '0.01';
const MIN_LIQUIDITY_ETH = '1.5';

function readString(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function readOptionalString(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

function readOptionalHex(name: string): Hex | undefined {
  const value = process.env[name];
  if (!value) {
    return undefined;
  }
  if (!value.startsWith('0x')) {
    throw new Error(`${name} must be a hex string starting with 0x`);
  }
  return value as Hex;
}

function readOptionalInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative number`);
  }
  return parsed;
}

function readBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) {
    return fallback;
  }
  return raw === 'true';
}

function toHttpRpcUrl(wsRpcUrl: string): string {
  if (wsRpcUrl.startsWith('wss://')) {
    return wsRpcUrl.replace(/^wss:\/\//, 'https://');
  }
  if (wsRpcUrl.startsWith('ws://')) {
    return wsRpcUrl.replace(/^ws:\/\//, 'http://');
  }
  return wsRpcUrl;
}

export function loadConfig(): RuntimeConfig {
  const wsRpcUrl = readOptionalString('WS_RPC_URL');
  const httpRpcUrl = readOptionalString('HTTP_RPC_URL') ?? (wsRpcUrl ? toHttpRpcUrl(wsRpcUrl) : undefined);
  if (!wsRpcUrl && !httpRpcUrl) {
    throw new Error('Set either WS_RPC_URL or HTTP_RPC_URL');
  }
  const privateKey = readOptionalHex('PRIVATE_KEY');
  const requestedTrading = readBoolean('ENABLE_TRADING', false);

  if (requestedTrading && !privateKey) {
    throw new Error('ENABLE_TRADING is true, but PRIVATE_KEY is missing');
  }

  const baseConfig = {
    httpRpcUrl: httpRpcUrl as string,
    enableTrading: requestedTrading && Boolean(privateKey),
    minLiquidityWei: parseEther(MIN_LIQUIDITY_ETH),
    buyAmountWei: parseEther(BUY_AMOUNT_ETH),
    candidateTimeoutMs: readOptionalInt('CANDIDATE_TIMEOUT_MS', 10 * 60 * 1000),
  };

  return {
    ...baseConfig,
    ...(wsRpcUrl ? { wsRpcUrl } : {}),
    ...(privateKey ? { privateKey } : {}),
  };
}
