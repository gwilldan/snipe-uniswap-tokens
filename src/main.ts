import "dotenv/config";
import { createPublicClient, createWalletClient, formatEther, http, webSocket } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { resolveChainDeployment } from './lib/addresses';
import { loadConfig } from './lib/config';
import { createLogger } from './lib/logger';
import { executeTrade } from './lib/trading';
import { startV2Watcher } from './lib/uni-v2';
import { startV3Watcher } from './lib/uni-v3';
import type { BotConfig, TradeContext } from './lib/types';

async function main(): Promise<void> {
  const runtimeConfig = loadConfig();
  const logger = createLogger('bot');

  const publicTransport = runtimeConfig.wsRpcUrl
    ? webSocket(runtimeConfig.wsRpcUrl)
    : http(runtimeConfig.httpRpcUrl);

  const publicClient = createPublicClient({
    transport: publicTransport,
  });

  const chainId = await publicClient.getChainId();
  const chainDeployment = resolveChainDeployment(chainId);
  const config: BotConfig = {
    ...runtimeConfig,
    chainId,
    chainDeployment,
  };

  logger.info('Starting Uniswap sniper', {
    chainId: config.chainId,
    network: config.chainDeployment.chainLabel,
    transport: runtimeConfig.wsRpcUrl ? 'websocket' : 'http',
    tradeMode: config.enableTrading ? 'enabled' : 'dry-run',
    minLiquidityEth: formatEther(config.minLiquidityWei),
    buyAmountEth: formatEther(config.buyAmountWei),
    wrappedNativeToken: config.chainDeployment.wrappedNativeTokenAddress,
  });

  const walletClient =
    config.enableTrading && config.privateKey
      ? createWalletClient({
          account: privateKeyToAccount(config.privateKey),
          transport: http(config.httpRpcUrl),
        })
      : undefined;

  const handleQualifiedCandidate = async (context: TradeContext): Promise<void> => {
    logger.info('Liquidity threshold reached', {
      pool: context.candidate.poolAddress,
      version: context.candidate.version,
      liquidityEth: (Number(context.liquiditySnapshot.liquidityWei) / 10 ** 18).toString(),
    });

    await executeTrade(context, config, walletClient, logger);
  };

  const stopV2 = startV2Watcher({
    publicClient,
    config,
    logger: createLogger('v2'),
    onQualifiedCandidate: handleQualifiedCandidate,
  });

  const stopV3 = startV3Watcher({
    publicClient,
    config,
    logger: createLogger('v3'),
    onQualifiedCandidate: handleQualifiedCandidate,
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.warn(`Received ${signal}, shutting down`);
    stopV2();
    stopV3();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

void main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error('[bot] Fatal error:', message);
  process.exit(1);
});
