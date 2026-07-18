import type { Address, Hex } from 'viem';
import type { ChainDeployment } from './addresses';

export type PoolVersion = 'v2' | 'v3';

export interface RuntimeConfig {
  wsRpcUrl?: string;
  httpRpcUrl: string;
  privateKey?: Hex;
  enableTrading: boolean;
  minLiquidityWei: bigint;
  buyAmountWei: bigint;
  candidateTimeoutMs: number;
}

export interface PoolCandidate {
  version: PoolVersion;
  poolAddress: Address;
  token0: Address;
  token1: Address;
  fee?: number;
}

export interface BotConfig {
  chainId: number;
  chainDeployment: ChainDeployment;
  wsRpcUrl?: string;
  httpRpcUrl: string;
  privateKey?: Hex;
  enableTrading: boolean;
  minLiquidityWei: bigint;
  buyAmountWei: bigint;
  candidateTimeoutMs: number;
}

export interface LiquiditySnapshot {
  liquidityWei: bigint;
  targetToken: Address;
}

export interface TradeContext {
  candidate: PoolCandidate;
  liquiditySnapshot: LiquiditySnapshot;
}
