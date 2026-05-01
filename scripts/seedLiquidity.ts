import { ethers } from "hardhat";

/**
 * Seed a Uniswap V2 pool with initial HIVE/WETH liquidity.
 *
 * Required env:
 *   HIVE_ADDRESS   — deployed HiveToken
 *   ROUTER         — Uniswap V2 router (mainnet: 0x7a25...488D)
 *   HIVE_AMOUNT    — HIVE to deposit (e.g. "10000000")
 *   ETH_AMOUNT     — ETH to deposit (e.g. "5")
 *
 * After this script runs, get the pair address from the factory and call
 * `HiveToken.setTaxedPair(pair, true)` so swap-routed transfers are taxed.
 */
const ROUTER_ABI = [
  "function addLiquidityETH(address token, uint amountTokenDesired, uint amountTokenMin, uint amountETHMin, address to, uint deadline) external payable returns (uint, uint, uint)",
  "function factory() view returns (address)",
];
const FACTORY_ABI = ["function getPair(address,address) view returns (address)"];
const ERC20_ABI = ["function approve(address,uint256) returns (bool)"];

async function main() {
  const [deployer] = await ethers.getSigners();
  const hiveAddr = required("HIVE_ADDRESS");
  const router = required("ROUTER");
  const hiveAmount = ethers.parseUnits(required("HIVE_AMOUNT"), 18);
  const ethAmount = ethers.parseEther(required("ETH_AMOUNT"));

  const hive = new ethers.Contract(hiveAddr, ERC20_ABI, deployer);
  const r = new ethers.Contract(router, ROUTER_ABI, deployer);

  console.log("Approving router to pull HIVE...");
  await (await hive.approve(router, hiveAmount)).wait();

  const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
  console.log(`Adding liquidity: ${ethers.formatUnits(hiveAmount, 18)} HIVE + ${ethers.formatEther(ethAmount)} ETH`);
  const tx = await r.addLiquidityETH(
    hiveAddr,
    hiveAmount,
    (hiveAmount * 95n) / 100n,
    (ethAmount * 95n) / 100n,
    deployer.address,
    deadline,
    { value: ethAmount }
  );
  const receipt = await tx.wait();
  console.log("Liquidity added in", receipt?.hash);

  const factoryAddr = await r.factory();
  const factory = new ethers.Contract(factoryAddr, FACTORY_ABI, deployer);
  const weth = await getWETH(router, deployer);
  const pair = await factory.getPair(hiveAddr, weth);
  console.log("Pair address:", pair);
  console.log("→ Run HiveToken.setTaxedPair(pair, true) and setTaxEnabled(true) when ready.");
}

async function getWETH(router: string, signer: any): Promise<string> {
  const c = new ethers.Contract(router, ["function WETH() view returns (address)"], signer);
  return await c.WETH();
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

main().catch((e) => { console.error(e); process.exit(1); });
