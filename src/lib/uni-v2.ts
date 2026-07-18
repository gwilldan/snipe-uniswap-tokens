import { formatEther, getAddress, type Address, type PublicClient } from 'viem';
import { UNISWAP_V2_FACTORY_ABI, UNISWAP_V2_PAIR_ABI } from './addresses';
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
  const reserves = await publicClient.readContract({
    address: candidate.poolAddress,
    abi: UNISWAP_V2_PAIR_ABI,
    functionName: 'getReserves',
  });

  const wethLiquidity =
    normalize(candidate.token0) === normalize(wrappedNativeTokenAddress) ? reserves[0] : reserves[1];

  return {
    liquidityWei: wethLiquidity,
    targetToken: getTargetToken(candidate, wrappedNativeTokenAddress),
  };
}

function createCandidate(
  token0: Address,
  token1: Address,
  poolAddress: Address,
  wrappedNativeTokenAddress: Address,
): PoolCandidate | undefined {
  if (
    normalize(token0) !== normalize(wrappedNativeTokenAddress) &&
    normalize(token1) !== normalize(wrappedNativeTokenAddress)
  ) {
    return undefined;
  }

  return {
    version: 'v2',
    poolAddress,
    token0,
    token1,
  };
}

export function startV2Watcher(params: {
  publicClient: PublicClient;
  config: BotConfig;
  logger: Logger;
  onQualifiedCandidate: (context: TradeContext) => Promise<void>;
}): () => void {
  const activeUnwatches = new Map<Address, () => void>();
  const deployment = params.config.chainDeployment;
  const wrappedNativeTokenAddress = deployment.wrappedNativeTokenAddress;

  const stopFactoryWatch = params.publicClient.watchContractEvent({
    address: deployment.uniswapV2FactoryAddress,
    abi: UNISWAP_V2_FACTORY_ABI,
    eventName: 'PairCreated',
    onLogs: (logs) => {
      for (const log of logs) {
        const { token0, token1, pair: poolAddress } = log.args as unknown as {
          token0: Address;
          token1: Address;
          pair: Address;
        };

        const candidate = createCandidate(token0, token1, poolAddress, wrappedNativeTokenAddress);
        if (!candidate) {
          continue;
        }

        params.logger.info('Observed V2 pair creation', {
          pool: poolAddress,
          token0,
          token1,
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
      params.logger.info('Stopped V2 pool monitor', { pool: candidate.poolAddress, reason });
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
        params.logger.info('V2 liquidity check', {
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
        params.logger.error('Failed to evaluate V2 liquidity', {
          pool: candidate.poolAddress,
          source,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    const stopWatch = params.publicClient.watchContractEvent({
      address: candidate.poolAddress,
      abi: UNISWAP_V2_PAIR_ABI,
      eventName: 'Sync',
      onLogs: (logs) => {
        if (logs.length > 0) {
          void evaluate('sync');
        }
      },
    });

    activeUnwatches.set(candidate.poolAddress, () => {
      stopWatch();
    });

    timeoutId = setTimeout(() => finish('timeout'), params.config.candidateTimeoutMs);
    void evaluate('initial');
  }

  params.logger.info('V2 factory watcher started', {
    factory: deployment.uniswapV2FactoryAddress,
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
