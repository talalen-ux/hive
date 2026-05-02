import "dotenv/config";

function required(key: string): string {
  const v = process.env[key];
  if (!v || v.length === 0) {
    throw new Error(`missing required env var: ${key}`);
  }
  return v;
}

function intIn(key: string, fallback: number, min: number, max: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(
      `${key} must be an integer in [${min}, ${max}]; got ${raw}`,
    );
  }
  return n;
}

function privateKey(key: string): string {
  const v = required(key);
  if (!/^0x[0-9a-fA-F]{64}$/.test(v)) {
    throw new Error(`${key} must be a 0x-prefixed 32-byte hex string`);
  }
  return v;
}

export const env = {
  anthropicApiKey: required("ANTHROPIC_API_KEY"),
  rpcUrl: required("RPC_URL"),
  chainId: intIn("CHAIN_ID", 1, 1, 2147483647),
  governor: required("GOVERNOR_ADDRESS"),
  privateKey: privateKey("ORACLE_PRIVATE_KEY"),
  ideasPerRun: intIn("IDEAS_PER_RUN", 5, 1, 8),
  // Minimum 25h: gives a 1h safety margin above the contract's 24h floor so
  // simulate→write timing slop never lands a tx outside the window.
  votingWindowHours: intIn("VOTING_WINDOW_HOURS", 48, 25, 168),
  dryRun: (process.env.DRY_RUN ?? "false").toLowerCase() === "true",
} as const;
