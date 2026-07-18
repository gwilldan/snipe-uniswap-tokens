import { getAddress, type Abi, type Address } from 'viem';

export interface ChainDeployment {
  chainId: number;
  chainLabel: string;
  wrappedNativeTokenAddress: Address;
  uniswapV2FactoryAddress: Address;
  uniswapV2RouterAddress: Address;
  uniswapV3FactoryAddress: Address;
  uniswapV3SwapRouterAddress: Address;
}

export const MAINNET_DEPLOYMENT: ChainDeployment = {
  chainId: 4663,
  chainLabel: 'Robinhood Mainnet',
  // wrappedNativeTokenAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  // uniswapV2FactoryAddress: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
  // uniswapV2RouterAddress: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
  // uniswapV3FactoryAddress: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  // uniswapV3SwapRouterAddress: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
  wrappedNativeTokenAddress: '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73', // L2 WETH
uniswapV2FactoryAddress: '0x8bceaa40b9acdfaedf85adf4ff01f5ad6517937f',
uniswapV2RouterAddress: '0x89e5db8b5aa49aa85ac63f691524311aeb649eba',
uniswapV3FactoryAddress: '0x1f7d7550b1b028f7571e69a784071f0205fd2efa',
uniswapV3SwapRouterAddress: '0xcaf681a66d020601342297493863e78c959e5cb2', // SwapRouter02
};

function readAddress(name: string, env: NodeJS.ProcessEnv): Address | undefined {
  const raw = env[name];
  if (!raw) {
    return undefined;
  }

  return getAddress(raw);
}

function resolveAddress(name: string, fallback: Address, env: NodeJS.ProcessEnv): Address {
  return readAddress(name, env) ?? fallback;
}

export function resolveChainDeployment(chainId: number, env: NodeJS.ProcessEnv = process.env): ChainDeployment {
  const chainLabel = env.CHAIN_LABEL ?? (chainId === 1 ? MAINNET_DEPLOYMENT.chainLabel : `chain-${chainId}`);
  const wrappedNativeTokenAddress = readAddress('WRAPPED_NATIVE_TOKEN_ADDRESS', env);
  const uniswapV2FactoryAddress = readAddress('UNISWAP_V2_FACTORY_ADDRESS', env);
  const uniswapV2RouterAddress = readAddress('UNISWAP_V2_ROUTER_ADDRESS', env);
  const uniswapV3FactoryAddress = readAddress('UNISWAP_V3_FACTORY_ADDRESS', env);
  const uniswapV3SwapRouterAddress = readAddress('UNISWAP_V3_SWAP_ROUTER_ADDRESS', env);

  if (chainId === MAINNET_DEPLOYMENT.chainId) {
    return {
      chainId,
      chainLabel,
      wrappedNativeTokenAddress: resolveAddress(
        'WRAPPED_NATIVE_TOKEN_ADDRESS',
        MAINNET_DEPLOYMENT.wrappedNativeTokenAddress,
        env,
      ),
      uniswapV2FactoryAddress: resolveAddress(
        'UNISWAP_V2_FACTORY_ADDRESS',
        MAINNET_DEPLOYMENT.uniswapV2FactoryAddress,
        env,
      ),
      uniswapV2RouterAddress: resolveAddress(
        'UNISWAP_V2_ROUTER_ADDRESS',
        MAINNET_DEPLOYMENT.uniswapV2RouterAddress,
        env,
      ),
      uniswapV3FactoryAddress: resolveAddress(
        'UNISWAP_V3_FACTORY_ADDRESS',
        MAINNET_DEPLOYMENT.uniswapV3FactoryAddress,
        env,
      ),
      uniswapV3SwapRouterAddress: resolveAddress(
        'UNISWAP_V3_SWAP_ROUTER_ADDRESS',
        MAINNET_DEPLOYMENT.uniswapV3SwapRouterAddress,
        env,
      ),
    };
  }

  if (
    !wrappedNativeTokenAddress ||
    !uniswapV2FactoryAddress ||
    !uniswapV2RouterAddress ||
    !uniswapV3FactoryAddress ||
    !uniswapV3SwapRouterAddress
  ) {
    throw new Error(
      [
        `Unsupported chain id ${chainId}.`,
        'Set the following environment variables for this chain:',
        'WRAPPED_NATIVE_TOKEN_ADDRESS',
        'UNISWAP_V2_FACTORY_ADDRESS',
        'UNISWAP_V2_ROUTER_ADDRESS',
        'UNISWAP_V3_FACTORY_ADDRESS',
        'UNISWAP_V3_SWAP_ROUTER_ADDRESS',
      ].join(' '),
    );
  }

  return {
    chainId,
    chainLabel,
    wrappedNativeTokenAddress,
    uniswapV2FactoryAddress,
    uniswapV2RouterAddress,
    uniswapV3FactoryAddress,
    uniswapV3SwapRouterAddress,
  };
}

export const ERC20_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: 'success', type: 'bool' }],
  },
] as const satisfies Abi;

export const WETH9_ABI = [
  ...ERC20_ABI,
  {
    type: 'function',
    name: 'deposit',
    stateMutability: 'payable',
    inputs: [],
    outputs: [],
  },
] as const satisfies Abi;

export const UNISWAP_V2_FACTORY_ABI = [
  {
    type: 'event',
    name: 'PairCreated',
    anonymous: false,
    inputs: [
      { name: 'token0', type: 'address', indexed: true },
      { name: 'token1', type: 'address', indexed: true },
      { name: 'pair', type: 'address', indexed: false },
      { name: '', type: 'uint256', indexed: false },
    ],
  },
] as const satisfies Abi;

export const UNISWAP_V2_PAIR_ABI = [
  {
    type: 'function',
    name: 'getReserves',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'reserve0', type: 'uint112' },
      { name: 'reserve1', type: 'uint112' },
      { name: 'blockTimestampLast', type: 'uint32' },
    ],
  },
  {
    type: 'event',
    name: 'Sync',
    anonymous: false,
    inputs: [
      { name: 'reserve0', type: 'uint112', indexed: false },
      { name: 'reserve1', type: 'uint112', indexed: false },
    ],
  },
] as const satisfies Abi;

export const UNISWAP_V3_FACTORY_ABI = [
  {
    type: 'event',
    name: 'PoolCreated',
    anonymous: false,
    inputs: [
      { name: 'token0', type: 'address', indexed: true },
      { name: 'token1', type: 'address', indexed: true },
      { name: 'fee', type: 'uint24', indexed: true },
      { name: 'tickSpacing', type: 'int24', indexed: false },
      { name: 'pool', type: 'address', indexed: false },
    ],
  },
] as const satisfies Abi;

export const UNISWAP_V3_POOL_ABI = [
  {
    type: 'event',
    name: 'Mint',
    anonymous: false,
    inputs: [
      { name: 'sender', type: 'address', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'tickLower', type: 'int24', indexed: true },
      { name: 'tickUpper', type: 'int24', indexed: true },
      { name: 'amount', type: 'uint128', indexed: false },
      { name: 'amount0', type: 'uint256', indexed: false },
      { name: 'amount1', type: 'uint256', indexed: false },
    ],
  },
] as const satisfies Abi;

export const UNISWAP_V2_ROUTER_ABI = [
  {
    type: 'function',
    name: 'swapExactETHForTokensSupportingFeeOnTransferTokens',
    stateMutability: 'payable',
    inputs: [
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [],
  },
] as const satisfies Abi;

export const UNISWAP_V3_SWAP_ROUTER_ABI = [
  {
    type: 'function',
    name: 'exactInputSingle',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'recipient', type: 'address' },
          { name: 'deadline', type: 'uint256' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'amountOutMinimum', type: 'uint256' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
      },
    ],
    outputs: [{ name: 'amountOut', type: 'uint256' }],
  },
] as const satisfies Abi;
