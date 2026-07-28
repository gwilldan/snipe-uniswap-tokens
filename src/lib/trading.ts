import type { Address, WalletClient } from 'viem';
import { formatEther } from 'viem';
import {
  WETH9_ABI,
  UNISWAP_V2_ROUTER_ABI,
  UNISWAP_V3_SWAP_ROUTER_ABI,
} from './addresses';
import type { BotConfig, PoolCandidate, TradeContext } from './types';
import type { Logger } from './logger';

function deadlineAfter(seconds: number): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + seconds);
}

function getTargetToken(candidate: PoolCandidate, wrappedNativeTokenAddress: Address): Address {
  if (candidate.token0.toLowerCase() === wrappedNativeTokenAddress.toLowerCase()) {
    return candidate.token1;
  }
  return candidate.token0;
}

export async function executeTrade(
  context: TradeContext,
  config: BotConfig,
  walletClient: WalletClient | undefined,
  logger: Logger,
): Promise<void> {
  const targetToken = getTargetToken(context.candidate, config.chainDeployment.wrappedNativeTokenAddress);
  const liquidityEth = formatEther(context.liquiditySnapshot.liquidityWei);

  if (!config.enableTrading || !walletClient) {
    logger.info('Dry run only, no trade submitted'.green, {
      pool: context.candidate.poolAddress,
      targetToken,
      version: context.candidate.version,
      liquidityEth,
      buyAmountEth: formatEther(config.buyAmountWei),
    });
    return;
  }

  const recipient = walletClient.account?.address;
  if (!recipient) {
    throw new Error('Wallet client is missing a signing account');
  }

  logger.info('Submitting snipe trade', {
    pool: context.candidate.poolAddress,
    targetToken,
    version: context.candidate.version,
    liquidityEth,
    buyAmountEth: formatEther(config.buyAmountWei),
  });

  if (context.candidate.version === 'v2') {
    const txHash = await walletClient.writeContract({
      chain: undefined,
      account: recipient,
      address: config.chainDeployment.uniswapV2RouterAddress,
      abi: UNISWAP_V2_ROUTER_ABI,
      functionName: 'swapExactETHForTokensSupportingFeeOnTransferTokens',
      args: [0n, [config.chainDeployment.wrappedNativeTokenAddress, targetToken], recipient, deadlineAfter(120)],
      value: config.buyAmountWei,
    });

    logger.info('V2 snipe submitted', { txHash, targetToken });
    return;
  }

  const depositHash = await walletClient.writeContract({
    chain: undefined,
    account: recipient,
    address: config.chainDeployment.wrappedNativeTokenAddress,
    abi: WETH9_ABI,
    functionName: 'deposit',
    value: config.buyAmountWei,
  });

  logger.info('WETH deposit submitted for V3 trade', { depositHash, targetToken });

  const approveHash = await walletClient.writeContract({
    chain: undefined,
    account: recipient,
    address: config.chainDeployment.wrappedNativeTokenAddress,
    abi: WETH9_ABI,
    functionName: 'approve',
    args: [config.chainDeployment.uniswapV3SwapRouterAddress, config.buyAmountWei],
  });

  logger.info('WETH approval submitted for V3 trade', { approveHash, targetToken });

  const txHash = await walletClient.writeContract({
    chain: undefined,
    account: recipient,
    address: config.chainDeployment.uniswapV3SwapRouterAddress,
    abi: UNISWAP_V3_SWAP_ROUTER_ABI,
    functionName: 'exactInputSingle',
    args: [
      {
        tokenIn: config.chainDeployment.wrappedNativeTokenAddress,
        tokenOut: targetToken,
        fee: context.candidate.fee ?? 3000,
        recipient,
        deadline: deadlineAfter(120),
        amountIn: config.buyAmountWei,
        amountOutMinimum: 0n,
        sqrtPriceLimitX96: 0n,
      },
    ],
  });

  logger.info('V3 snipe submitted', { txHash, targetToken });
}
