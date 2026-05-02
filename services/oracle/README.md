# Hive Oracle Service

The AI scout for the Hive Incubator. Runs on a schedule, asks Claude to
generate fresh startup ideas, dedupes against the most recent on-chain
proposals, and publishes survivors to `HiveGovernor.createProposal()`.

This is the only privileged off-chain component in the Hive system. Treat
its private key like a hot wallet: rotate it whenever a CI artifact, log,
or config file might have leaked.

## What it does, end to end

1. Reads `proposalCount` and the most recent 20 titles from `HiveGovernor`.
2. Calls Claude (Opus 4.7) with a frozen system prompt + the dedup list, and
   gets back a Zod-validated batch of ideas.
3. Drops ideas whose titles match recent ones (case-insensitive).
4. For each survivor, calls `governor.createProposal(...)` from the oracle
   key with `threshold = 0` (the contract picks 1% of `totalWeighted`).

It does **not** create tasks (those are governance decisions on already-
approved projects, edited by the team for now), and it does **not** vote.

## Setup

```sh
cd services/oracle
npm install
cp .env.example .env
# fill in the env vars
```

Required env vars:

| var | meaning |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API key. Must have access to `claude-opus-4-7`. |
| `RPC_URL` | HTTPS endpoint for the chain (Infura/Alchemy/your node). |
| `CHAIN_ID` | `1` for mainnet, `11155111` for sepolia. |
| `GOVERNOR_ADDRESS` | From `scripts/deploy.ts` — the `HiveGovernor` address. |
| `ORACLE_PRIVATE_KEY` | EOA matching `HiveGovernor.oracle()`. |

Optional knobs:

| var | default | meaning |
|---|---|---|
| `IDEAS_PER_RUN` | 5 | How many ideas to ask for. Hard-capped at 8. |
| `VOTING_WINDOW_HOURS` | 48 | New-proposal voting window. Must be 24–168. |
| `DRY_RUN` | `false` | If `true`, generate and print but skip on-chain writes. |

## Smoke test

```sh
npm run dry-run
```

You should see:

- `[oracle] N recent titles loaded for dedup` (0 on a fresh deploy).
- `[ai] tokens — in:… out:… cache_read:0 cache_write:N` on first call.
- A list of 5 generated ideas with title / category / scores.
- `[oracle] dry-run done; not posting on-chain`.

Run it again immediately. The second run should show
`cache_read:N` matching the first run's `cache_write:N` — that confirms the
system prompt is caching cleanly. If `cache_read` stays 0, something
silently invalidated the prefix; see `shared/prompt-caching.md` in the
claude-api skill.

## Posting for real

```sh
npm run generate
```

The script will refuse to run if the wired private key doesn't match
`HiveGovernor.oracle()` on-chain, so a misconfigured key fails fast rather
than wasting a Claude call.

Successful runs print one line per posted proposal:

```
[oracle] posted "Pollen" — 0x9c4a…
```

The proposal is immediately votable via the dapp (or `governor.vote()`)
once the next block confirms.

## Scheduling

The oracle is stateless and idempotent (modulo dedup): two runs in a row are
safe — the second will see the first's titles and avoid them. Pick whatever
scheduler matches your ops:

### GitHub Actions (recommended for small teams)

`.github/workflows/oracle.yml` (already provided):

```yaml
on:
  schedule:
    - cron: "0 */6 * * *"  # every 6 hours
  workflow_dispatch:
```

Set the env vars as repo secrets:

- `ANTHROPIC_API_KEY`
- `RPC_URL`
- `GOVERNOR_ADDRESS`
- `ORACLE_PRIVATE_KEY` ← treat as the hottest secret in the repo

The workflow runs `npm install && npm run generate`. It does not need a
deploy target — just GitHub's runner.

### Vercel Cron + a serverless function

If you'd rather host inside Vercel, wrap the script in an authenticated
API route under `frontend/pages/api/oracle/run.ts`, gate it on a header
secret, and have Vercel Cron hit it on the desired cadence. The
`@anthropic-ai/sdk` and `viem` packages already work in Vercel's Node
runtime; you just need to copy the env vars into Vercel project settings.

### A long-running VM

For mainnet at scale, a small VM (or a containerized oracle) gives you
independent log retention and easy rate-limit observability. The script
exits cleanly after each run; just call it from cron / systemd-timer.

## Key management

The oracle key has exactly one privilege: calling
`HiveGovernor.createProposal()` (and, in a future revision, `createTask()`
— not yet wired by this service). It cannot move user funds, change
reward distribution, or bypass any vote. The blast radius is "spammy
proposals" — bad but reversible.

Recommendations from cheapest to safest:

1. **GitHub Actions secrets** — fine for sepolia and early mainnet.
2. **A cloud KMS** (AWS/GCP) signing via a viem custom transport — better
   for production. The oracle never sees the raw key.
3. **A multisig as oracle**, with the AI service emitting a signed Safe
   transaction that a human (or another bot) co-signs — most paranoid.
   Requires changing `HiveGovernor.oracle()` to a Gnosis Safe address.

If a key leaks: from any owner-controlled key, call
`governor.setOracle(<new oracle>)`. The old key instantly loses access.

## Costs

Per run, with `IDEAS_PER_RUN=5`:

- ~2.5K input tokens (system prompt) — cached after the first run, so the
  steady-state input is ~0.25K.
- ~1.5K output tokens.
- 5 × `createProposal` gas. Each is roughly 200K gas; on mainnet at 30 gwei
  that's ~$15 per run, dominated by the on-chain write, not the LLM call.

Use `DRY_RUN=true` while iterating on the prompt to avoid both costs.

## Failure modes

| symptom | likely cause | fix |
|---|---|---|
| `wired private key does not match governor.oracle()` | wrong key | rotate `ORACLE_PRIVATE_KEY` to the EOA you set on deploy |
| `claude returned unparseable output (stop_reason=…)` | safety refusal or token cap | inspect the prompt; raise `max_tokens` if the response was clipped |
| `transaction reverted with reason: NotOracle` | governor was rotated to a new address | update `ORACLE_PRIVATE_KEY`. If the governor is in a 2-step rotation cooldown, wait for `acceptOracleRotation` |
| `WindowTooShort` / `WindowEndsInPast` | `VOTING_WINDOW_HOURS=24` + clock drift | use 25 or higher (the oracle enforces this; if you see it, the env was bypassed) |
| `ThresholdRequired` | governor was upgraded; oracle is sending threshold=0 | update the oracle: `snapshotThreshold` already returns ≥1 |
| `dedup degraded: N/M title reads failed` | RPC unhealthy across more than half of the recent-title reads | retry; switch RPC; abort + investigate before posting |
| `cache_read_input_tokens: 0` on every run | the system prompt is being mutated per-call | check that `prompt.ts` is a frozen string with no interpolation |

## Slice 3 boundary

This oracle is the AI generator only. Project metadata (logos, taglines,
stage status) is served from `frontend/data/projects.json` and the
`/api/projects` route. When the volume of governance traffic outgrows
12-second polling, slice 3.5 adds a Postgres indexer + websocket layer
on the read path — but the oracle's write path stays exactly as it is.
