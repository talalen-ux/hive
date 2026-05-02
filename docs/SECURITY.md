# Hive — Security Plan

This document captures every concrete vulnerability surfaced in the audit
of the Hive contract suite and the engineering response. It is the
source of truth for what is fixed in code, what is mitigated by
deployment procedure, and what remains an accepted residual risk.

The audit covered four contracts:
- `HiveToken.sol` — ERC-20 + optional 4% transfer tax
- `HiveStaking.sol` — lock-tier staking with forfeit-on-early-exit
- `HiveRewards.sol` — MasterChef-style HIVE+ETH accumulator
- `NectarVault.sol` — permissionless fee harvester

## 0. Threat model

We design against the following adversaries:
1. **Malicious user** with arbitrary capital and a re-entrant contract
   wallet. They cannot mint HIVE; they can only stake, claim, unstake,
   and donate.
2. **MEV searcher** with the ability to front-run, back-run, and
   sandwich any public mempool transaction. Cannot censor.
3. **Compromised owner key** between launch and ownership renouncement.
   We minimise blast radius via `Ownable2Step`, one-shot setters, a
   timelock, and a planned ownership renouncement.
4. **Buggy LP / DEX integration**: tax routing must not break if the
   pair contract behaves unexpectedly.

Out of scope: governance attacks (no on-chain governance), oracle
manipulation (no oracle dependency), social engineering of the
multisig.

## 1. Critical findings & responses

### C-1. Fee-on-transfer self-cannibalisation when staking HIVE
*Risk:* If `HiveStaking` is ever non-tax-exempt, `safeTransferFrom`
delivers `amount * 0.96` while the contract credits `amount`. On
unstake, `safeTransfer(s.amount)` reverts or steals from the next
staker. **Latent critical.**

*Fix (code):*
- `HiveStaking.stake()` now measures the actual delta with a pre/post
  balance read and credits the received amount, not the requested one.
- `HiveToken` constructor auto-exempts `address(this)` and the initial
  owner; `setRewardsPool`/`setStaking`/`setVault` auto-exempt their
  argument.
- `setTaxExempt(...)` rejects attempts to *un*-exempt the protocol-
  critical addresses (`rewardsPool`, `staking`, `vault`, `treasury`).

*Fix (process):* `scripts/deploy.ts` calls `setTaxExempt(staking, true)`
on the token immediately after deployment, and the `setTaxEnabled(true)`
flip is gated behind a check that all three protocol contracts are
exempt.

### C-2. First-staker / donation sandwich on the accumulator
*Risk:* An attacker observes pre-existing HIVE/ETH at `HiveRewards`
(arrived before any weight existed), front-runs the first stake with a
1-wei stake of their own, and on next sync receives 100 % of the
donation as their share. Repeatable; trivial.

*Fix:* Borrow Uniswap V2's `MINIMUM_LIQUIDITY` pattern.
`HiveStaking.seedDeadWeight(amount)` is a one-shot, owner-callable
function that pulls `amount` HIVE from the deployer, adds it to
`totalWeighted` permanently (registered to `address(0xdEaD)` with no
unstake path), and burns it from the deployer's perspective. The
deploy script seeds 1 000 HIVE of dead weight as the very first
post-deploy action, before announcing the staking address publicly.

### C-3. `sync()` underflow → DoS on stake/unstake/claim
*Risk:* Solidity 0.8 checked subtraction reverts the entire path if
`_accountedHive > hive.balanceOf(this)` ever holds — possible if a
future rescue, selfdestruct beneficiary, or a token-hook misroute
removes HIVE from `HiveRewards`. Bricks the protocol.

*Fix:* `sync()` now uses ternary-guarded subtractions exactly like the
view functions. If `_accountedHive > balance`, snap `_accountedHive`
down to `balance` so subsequent syncs recover. Same for ETH.

### C-4. Owner can swap `staking`/`rewards`/`vault` to attacker contract
*Risk:* Compromised owner key → swap `HiveRewards.staking` to a
contract that returns `weightOf(attacker) = 2^255` → drain entire
accumulator on a single `claim`.

*Fix:* All wire-up setters (`HiveStaking.setRewards`,
`HiveRewards.setStaking`, `HiveRewards.setVault`,
`NectarVault.setRewards`) are now **one-shot**: they revert if the
target slot is already non-zero. After the deploy script wires the
system, these setters are dead. Combined with `Ownable2Step` and the
post-launch ownership transfer to a 24-hour-timelocked multisig, this
class of attack is closed.

## 2. High findings & responses

### H-1. Owner can redirect tax stream via `setRewardsPool`
*Fix:* `setRewardsPool` is one-shot (same pattern as C-4).
Once set, the rewards pool address is permanent.

### H-2. Owner can revoke exemption on rewards pool → tax-on-claim drift
*Fix:* `setTaxExempt` reverts when the target is `rewardsPool`,
`treasury`, `staking`, or `vault` and `exempt` is `false`.

### H-3. Top-up with shorter `lockDuration` downgrades the multiplier
*Risk:* User has a 7-day stake with 5 days remaining. They top up
specifying `lockDuration = 24h`. The require allows it (lock isn't
shortening — `lockEnd` extension only goes forward), but
`s.lockDuration` is overwritten to 24h, so future `multiplierFor()`
reads see the 24h tier despite 5 days of real lock remaining. User loses
yield silently.

*Fix:* In `stake()`, `s.lockDuration` is now set to the *effective*
remaining lock (`newLockEnd - block.timestamp`), and the multiplier is
recomputed against that. A top-up at a lower nominal tier therefore
keeps the higher tier as long as `lockEnd` enforces it.

### H-4. `unstake()` ETH transfer to a contract that rejects ETH bricks the user's exit
*Risk:* If a contract wallet rejects ETH in its receive path, calling
`unstake()` reverts on `rewards.claim(...)` and the user can never
retrieve their stake.

*Fix:* `HiveStaking.unstake(address ethRecipient)` now accepts an
optional ETH recipient. If `ethRecipient == address(0)` it defaults to
`msg.sender`. Unstakers using a smart wallet route ETH to an EOA they
control. Additionally, `HiveRewards.claim` falls back to credit-back
(adds ETH amount back to `pendingEth` and emits `EthClaimDeferred`) on
`call` failure rather than reverting, so the staker's HIVE is always
recoverable.

## 3. Medium findings & responses

### M-1. `unstake()` ordering: `forfeit` runs before `delete stake`
*Risk:* Forfeit divides the redistributed amount by `totalWeighted`
which still includes the leaver's weight, slightly over-bumping
`accPerWeight` and trapping a few wei in the contract.

*Fix:* `HiveStaking.unstake()` now decrements `totalWeighted` and
deletes the stake **before** invoking `forfeit`, so redistribution
divides only over remaining stakers' weight. `HiveRewards.forfeit()`
also calls `sync()` first so any unsynced fees are picked up before the
acc bump.

### M-2. Division-before-multiplication dust loss in `sync()` and `forfeit()`
*Fix:* `HiveRewards` now tracks two residuals (`_hiveResidual`,
`_ethResidual`). Each acc bump is computed as
`(numerator + residual) / totalW`, with the new residual being the
modulus. Over time the residual is consumed and dust is fully
distributed.

### M-3. No partial unstake / no extend-lock-only operation
*Status:* Accepted. Adding partial unstake invites
forfeit-skim attacks where users repeatedly cycle small amounts to
extract favourable acc snapshots without committing to a real lock.
Users wanting to take profits should use `claim()` after the lock
matures and roll the residual into a fresh stake.

### M-4. No `Pausable` / emergency switch
*Fix:* `HiveStaking` and `HiveRewards.claim` now inherit OZ
`Pausable`. The owner (multisig + timelock) can `pause()` to stop new
stakes and claims in the event of an emergency. `unstake()` is
intentionally **not** pausable — users can always exit their funds
even if the protocol is paused, with the standard forfeit rule applied.

## 4. Low findings & responses

### L-1. `lockDuration > MAX_LOCK` silently caps multiplier
*Fix:* `stake()` now reverts if `lockDuration > MAX_LOCK`.

### L-2. `amount > type(uint128).max` silently truncates
*Fix:* `stake()` requires `amount <= type(uint128).max`.

### L-3. Standard ERC-20 approve race
*Mitigation:* HIVE supports EIP-2612 permit. The dapp prefers permit
over approve where possible. New `stakeWithPermit(...)` helper added.

### L-4. Missing events for state mutations
*Fix:* Added events for lock-end extensions on top-up, dead-weight
seeding, and pause toggles.

### L-5. `block.timestamp` 12-second skew
*Status:* Accepted — negligible against a 24h minimum lock.

## 5. Operational controls

### Deployment order (enforced by `scripts/deploy.ts`)
1. Deploy `HiveToken` with the multisig as treasury.
2. Deploy `HiveStaking`, `HiveRewards`, `NectarVault`.
3. **Tax-exempt** `staking`, `rewards`, `vault` on the token. This
   happens *before* any other action so accidental tax flips cannot
   break accounting.
4. Wire one-shot pointers (`staking → rewards`, `rewards → staking`,
   `rewards → vault`, `vault → rewards`, `token → rewardsPool`).
5. **Seed dead weight** (1 000 HIVE) on `staking` to defeat the first-
   staker donation sandwich.
6. Optionally, seed initial Uniswap V2 liquidity via `seedLiquidity.ts`.
7. Call `setTaxedPair(<pair>, true)` and `setTaxEnabled(true)` only
   after the LP is funded.
8. Transfer ownership of all four contracts to a 24h-timelocked
   multisig. The multisig accepts via `acceptOwnership()` (Ownable2Step).

### Post-launch
- Run a public bug bounty (target: 30 days, 5–10 % of TVL pool).
- After 30 days of clean operation, the multisig can call `renounceOwnership()` on
  `HiveToken` (locking the tax parameters forever) if the team chooses
  the "purist" governance path.
- `HiveStaking` and `HiveRewards` retain `Pausable` ownership; even
  after pause-only ownership remains, no setter can move funds.

### Monitoring
On-chain alerts (Tenderly / Defender) on:
- Any owner action on the four contracts.
- `HiveRewards._accountedHive` drift > 1 % vs `balanceOf`.
- `pause()` / `unpause()`.
- Tax exemption changes.
- `forfeit` events with HIVE+ETH > 1 % of TVL.

## 6. Out-of-scope / accepted risk

- **No upgradeability.** All four contracts are immutable. Bugs require
  a redeploy and migration; this is the trade-off for not having an
  upgrade owner-rug surface.
- **No on-chain governance.** Parameters (tax flag, paused state) are
  controlled by the multisig until renouncement.
- **NectarVault swap path is intentionally absent.** Today
  `harvest()` only forwards balances. If a future version adds an
  on-chain swap, that version is a **separate audit** because it
  introduces MEV/sandwich exposure.

## 7. Test coverage targets

The test suite must cover, at minimum:
1. ✅ `MIN_LOCK` rejection
2. ✅ 7-day multiplier
3. ✅ Forfeit on early unstake
4. ✅ Claim after lock matures
5. **Forfeit redistribution to remaining stakers** (new)
6. **Multi-user pro-rata accrual** (new)
7. **ETH reward path end-to-end via NectarVault** (new)
8. **Top-up: lock-end extends, multiplier reflects effective lock** (new)
9. **Fee-on-transfer fail-safe** (new — mock token with tax)
10. **Pause halts stake/claim but not unstake** (new)
11. **Sync underflow guard** (new)
12. **Dead-weight permanently dilutes** (new)
13. **One-shot setter rejects second call** (new)
14. **Tax exemption cannot be revoked from protocol contracts** (new)
