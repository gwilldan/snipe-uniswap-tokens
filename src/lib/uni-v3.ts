import { formatEther, getAddress, type Address, type PublicClient } from 'viem';
import { ERC20_ABI, UNISWAP_V3_FACTORY_ABI, UNISWAP_V3_POOL_ABI } from './addresses';
import type { BotConfig, LiquiditySnapshot, PoolCandidate, TradeContext } from './types';
import type { Logger } from './logger';

function normalize(address: Address): string {
  return getAddress(address).toLowerCase();
}

function getTargetToken(candidate: PoolCandidate, wrappedNativeTokenAddress: Address): Address {
  if (normalize(candidate.token0) === normalize(wrappedNativeTokenAddress)) {
    return candidate.token1;
  }
  return candidate.token0;
}

async function readLiquiditySnapshot(
  publicClient: PublicClient,
  wrappedNativeTokenAddress: Address,
  candidate: PoolCandidate,
): Promise<LiquiditySnapshot> {
  const wethLiquidity = await publicClient.readContract({
    address: wrappedNativeTokenAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [candidate.poolAddress],
  });

  return {
    liquidityWei: wethLiquidity,
    targetToken: getTargetToken(candidate, wrappedNativeTokenAddress),
  };
}

function createCandidate(
  token0: Address,
  token1: Address,
  poolAddress: Address,
  fee: number,
  wrappedNativeTokenAddress: Address,
): PoolCandidate | undefined {
  if (
    normalize(token0) !== normalize(wrappedNativeTokenAddress) &&
    normalize(token1) !== normalize(wrappedNativeTokenAddress)
  ) {
    return undefined;
  }

  return {
    version: 'v3',
    poolAddress,
    token0,
    token1,
    fee,
  };
}

export function startV3Watcher(params: {
  publicClient: PublicClient;
  config: BotConfig;
  logger: Logger;
  onQualifiedCandidate: (context: TradeContext) => Promise<void>;
}): () => void {
  const activeUnwatches = new Map<Address, () => void>();
  const deployment = params.config.chainDeployment;
  const wrappedNativeTokenAddress = deployment.wrappedNativeTokenAddress;

  const stopFactoryWatch = params.publicClient.watchContractEvent({
    address: deployment.uniswapV3FactoryAddress,
    abi: UNISWAP_V3_FACTORY_ABI,
    eventName: 'PoolCreated',
    onLogs: (logs) => {
      for (const log of logs) {
        const { token0, token1, fee, pool: poolAddress } = log.args as unknown as {
          token0: Address;
          token1: Address;
          fee: number;
          pool: Address;
        };

        const candidate = createCandidate(
          token0,
          token1,
          poolAddress,
          Number(fee),
          wrappedNativeTokenAddress,
        );
        if (!candidate) {
          continue;
        }

        params.logger.info('Observed V3 pool creation', {
          pool: poolAddress,
          token0,
          token1,
          fee: Number(fee),
        });

        startPoolMonitor(candidate);
      }
    },
  });

  function startPoolMonitor(candidate: PoolCandidate): void {
    if (activeUnwatches.has(candidate.poolAddress)) {
      return;
    }

    let finished = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const finish = (reason: string): void => {
      if (finished) {
        return;
      }
      finished = true;
      timeoutId && clearTimeout(timeoutId);
      const stop = activeUnwatches.get(candidate.poolAddress);
      stop?.();
      activeUnwatches.delete(candidate.poolAddress);
      params.logger.info('Stopped V3 pool monitor', { pool: candidate.poolAddress, reason });
    };

    const evaluate = async (source: string): Promise<void> => {
      if (finished) {
        return;
      }

      try {
        const snapshot = await readLiquiditySnapshot(
          params.publicClient,
          wrappedNativeTokenAddress,
          candidate,
        );
        params.logger.info('V3 liquidity check', {
          pool: candidate.poolAddress,
          liquidityEth: formatEther(snapshot.liquidityWei),
          source,
        });

        if (snapshot.liquidityWei < params.config.minLiquidityWei) {
          return;
        }

        finish('liquidity threshold met');
        await params.onQualifiedCandidate({ candidate, liquiditySnapshot: snapshot });
      } catch (error) {
        params.logger.error('Failed to evaluate V3 liquidity', {
          pool: candidate.poolAddress,
          source,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    const stopWatch = params.publicClient.watchContractEvent({
      address: candidate.poolAddress,
      abi: UNISWAP_V3_POOL_ABI,
      eventName: 'Mint',
      onLogs: (logs) => {
        if (logs.length > 0) {
          void evaluate('mint');
        }
      },
    });

    activeUnwatches.set(candidate.poolAddress, () => {
      stopWatch();
    });

    timeoutId = setTimeout(() => finish('timeout'), params.config.candidateTimeoutMs);
    void evaluate('initial');
  }

  params.logger.info('V3 factory watcher started', {
    factory: deployment.uniswapV3FactoryAddress,
    wrappedNativeToken: wrappedNativeTokenAddress,
  });

  return () => {
    stopFactoryWatch();
    for (const stop of activeUnwatches.values()) {
      stop();
    }
    activeUnwatches.clear();
  };
}
