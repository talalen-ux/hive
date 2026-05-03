# Hive — Security Plan

## 0a. Architecture pivot — no-lock model + launch-only rewards

The protocol now ships a simplified mechanism design. Two structural changes
that supersede earlier sections:

1. **No staking locks, no tiers, no time multipliers.** `HiveStaking.stake`
   takes only an amount; `unstake(amount)` and `unstakeAll()` are always
   available unless the user is in a vote-freeze window. `weightOf(user) ==
   stakes[user].amount` (1:1).
2. **Rewards are released, not streamed.** `HiveRewards.sync` is gone. The
   multisig calls `distributeLaunchPool(hiveAmt, ethAmt)` to advance the
   accumulator — typically when a project hits its LAUNCH stage. Funds can
   flow continuously into the pending pool (tax, NectarVault.harvest,
   treasury contributions); only an explicit owner action releases them
   to stakers.

Three implications:
- Vote integrity now leans entirely on the **vote-freeze** mechanism.
  When `HiveGovernor.vote` records a vote it calls
  `staking.freezeUntil(voter, votingEnd)`. The staking contract refuses
  unstakes while the freeze is active. Without locks, this is the only
  thing stopping a "vote then walk with principal" attack.
- The lock-end constraint on votes (`lockEnd >= votingEnd`) is **removed**.
  Anyone with a positive stake at vote-cast time can vote.
- Community proposals (`submitCommunityProposal`) gate on
  `staking.weightOf(msg.sender) >= minProposeStake` — anti-spam by capital
  rather than by lock duration.

### New residual risk — launch-payout sandwich
With no minimum staking duration, an attacker can stake large size right
before a `distributeLaunchPool` tx and unstake right after, capturing a
disproportionate slice of the payout. The MasterChef accumulator math
correctly gives them only their stake-share of *that specific* payout
(no back-credit for past distributions), but their share of the
in-flight payout is still nonzero.

Operational mitigation (no contract change):
1. Multisig **announces every launch payout** off-chain (Discord / Twitter
   / governance forum) at least 24h before execution.
2. Staking activity in that 24h window is publicly observable; legitimate
   stakers join early, sandwich actors get noticed.
3. Multisig sizes payouts so the sandwich economics don't pencil out
   against gas + the social cost.

Optional code-level mitigation (deferred): per-staker eligibility timer
that disqualifies stakes younger than the most recent `lastPayoutAt`.
Tracked off the existing `firstStakeAt` field; not yet enforced.

### New community-proposal path
`HiveGovernor.submitCommunityProposal(projectKey, title, description,
votingEnd, threshold)` is open to any wallet holding at least
`minProposeStake` of HIVE staked. Vote rules mirror idea proposals
(60% YES of yes+no plus quorum). On pass, `finalizeCommunityProposal`
auto-creates a task on the project (`status: PASSED`, no options — the
action item *is* the description).

`minProposeStake` is owner-tunable via `setMinProposeStake`. Setting it
high spam-proofs at the cost of locking out small holders; setting it
low is permissive but invites spam. Default at deploy: 100 HIVE.

### `createProposal` and `createTask` are now community-callable
Both AI-only entrypoints opened up:

* `createProposal(...)` — submits a **project idea**. Open to the oracle
  (AI generator) and to any wallet with `weightOf >= minProposeStake`.
  Stakers can pitch new project ideas; off-chain compares
  `proposals(id).submitter` to `oracle()` to distinguish AI vs community
  provenance. Same vote rules as before.
* `createTask(...)` — submits a **multi-option task** (e.g. naming
  votes: "Buzz" / "Hum" / "Comb"). Same access tier and provenance
  recording.

Both functions write `msg.sender` to a new `submitter` field on the
Proposal / Task structs. Auto-promoted tasks (from passed community
proposals) carry the original community proposer's address as
`submitter`, preserving the lineage.

**Spam surface.** A staker holding `minProposeStake` can flood the
governor with proposals/tasks — bounded by:
1. **Gas cost** per submission (each createProposal writes ~5 storage
   slots; each createTask writes 5 + 3·options).
2. **Stake gate** (capital requirement scales with `minProposeStake`).
3. **Voting window cap** ([24h, 7d]) — proposals churn out quickly.

If spam becomes a real issue, the multisig raises `minProposeStake` via
`setMinProposeStake`. The dapp filters out low-quorum / unfinalised
proposals from prominent surfaces.

**Provenance griefing.** A community member can submit a task with
`projectKey == keccak256("proj-foobar")` for a project they don't own.
The vote runs harmlessly — if no one votes, finalize REJECTS. UI clutter
on the wrong project page is the main cost. Mitigation: the dapp filters
ACTIVE-only proposals by default; finalised-no-quorum rows fade into a
collapsed "history" tail (TODO).

The previous lock-based audit findings (H-G1 vote-survives-unstake,
H-G3 duplicate unstake bodies, etc.) remain mitigated. Findings tied to
removed mechanisms (lock multipliers, forfeit, sync auto-distribution)
are obsolete in the no-lock model.

---



This document captures every concrete vulnerability surfaced in the audits
of the Hive contract suite and the engineering response. It is the
source of truth for what is fixed in code, what is mitigated by
deployment procedure, and what remains an accepted residual risk.

The audits covered five contracts:
- `HiveToken.sol` — ERC-20 + optional 4% transfer tax
- `HiveStaking.sol` — lock-tier staking with forfeit-on-early-exit
- `HiveRewards.sol` — MasterChef-style HIVE+ETH accumulator
- `NectarVault.sol` — permissionless fee harvester
- `HiveGovernor.sol` — proposal + task voting (added in slice 2)

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

## 7. Audit round 2 — HiveGovernor + regressions

A second audit (post-slice-2) covered `HiveGovernor.sol` for the first time
plus a regression sweep of the four older contracts.

### H-G1 — Vote-survives-unstake (governance integrity)
*Risk:* `HiveGovernor.vote` checks `lockEnd >= votingEnd` at vote-cast time
but nothing prevents the voter from calling `HiveStaking.unstake` immediately
after. Their cast vote remains tallied while their principal walks. Cost
of attack = the user's pending reward dust.

*Fix (code):* `HiveStaking` now exposes `voteFreezeUntil[user]` and a one-shot
`setGovernor` that authorises only the configured governor to extend the
freeze. Each `vote` / `voteTask` call invokes
`staking.freezeUntil(voter, votingEnd)`. `_unstake` reverts with
`VoteFreezeActive(until)` when called inside the freeze. The vote is now
collateralised through close.

*Operational:* deploy script calls `staking.setGovernor(governor)` after the
governor is deployed. `setGovernor` is one-shot — the relationship is
permanent.

### H-G2 — Threshold default gameable
*Risk:* the prior `threshold == 0 → snapshot 1% of totalWeighted at create`
let an actor mass-unstake right before an oracle tx to crater
`totalWeighted` and drop the bar to a value they alone could clear.

*Fix:* `createProposal` and `createTask` revert with `ThresholdRequired` on
`threshold == 0`. The oracle now reads `staking.totalWeighted()` once per
batch (via `governor.staking()`), takes 1% (floored at 1), and passes that
fixed threshold to every proposal in the batch — single snapshot, no
per-tx manipulation surface.

### H-G3 — Duplicate `unstake()` bodies
*Fix:* both overloads route through a shared `_unstake(address)` so the
two paths cannot diverge.

### M-G3 / M-G4 — Unbounded strings, duplicate option labels
*Fix:* explicit byte-length caps on every free-form field
(`MAX_TITLE_LEN`, `MAX_CATEGORY_LEN`, `MAX_OPTION_LABEL_LEN`, etc.). Tasks
reject duplicate option labels via an O(n²) keccak compare (n ≤ 5).

### M-G2 (task) — Tie at the top of `finalizeTask`
*Fix:* the loop now tracks `runnerUpVotes`. When `leaderVotes ==
runnerUpVotes`, `finalizeTask` returns `STATUS_REJECTED` with
`decidedOption = 0` instead of silently picking the lowest-indexed option.

### M-G5 — Two-step oracle rotation with cooldown
*Fix:* `proposeOracle` → `acceptOracleRotation` flow with
`ORACLE_ROTATION_DELAY = 24h` between them, plus a `cancelOracleRotation`
abort. A compromised owner key can no longer instantly swap the oracle.

### M-V1 — `NectarVault.harvest` doesn't sync rewards
*Fix:* `harvest` now calls `rewards.sync()` after forwarding so the next
user-facing read reflects the harvest without piggybacking the gas onto a
random staker. Also short-circuits and skips the `Harvested` event when
both balances are zero.

### M-T1 — `setTaxedPair(0, true)` accepted dead bookkeeping
*Fix:* explicit `pair != address(0)` revert.

### L-G3 / L-S1 / L-R1 — Misc hygiene
- `taskOption(0)` reverts with `BadOption` instead of returning a zero struct.
- `stakeWithPermit` swallows benign permit reverts when allowance already
  covers the stake (front-run protection / re-use UX).
- `HiveRewards.claim` ETH transfer gas budget bumped from 50k to 100k —
  fewer benign deferrals from contract wallets that emit logs in `receive`.

### Gas pass
- All five contracts use custom errors instead of revert strings on hot
  paths (~50% calldata savings on revert + ~120 gas per check).
- `HiveGovernor.Proposal` and `Task` structs reordered so the fixed-width
  trailers pack into the minimum number of slots.
- `unchecked` blocks on subtractions that are safe-by-invariant
  (`HiveStaking.totalStaked/totalWeighted -= …` on unstake,
  `HiveRewards._accountedHive/Eth -= …` on claim).

### Frontend / oracle (separate audits)
The `useTick` re-subscribe storm was fixed by hoisting the subscribe
function to module scope behind a single 1Hz interval. Per-id reads to
`proposalVotes`/`taskVotes` are gated on a connected wallet and capped at
50. The on-chain decoders dropped their dead "array shape" branches with
unsafe casts. The oracle's dedup window grew from 20 to 200 with normalized
matching, threshold is read live from `staking.totalWeighted()`, content is
sanitized before posting, and viem revert reasons surface in the catch
block. See the audit transcripts for the full punch list.

## 8. Test coverage targets

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
15. **Vote freeze blocks unstake during open vote** (round 2)
16. **Threshold == 0 rejected** (round 2)
17. **Duplicate option labels rejected** (round 2)
18. **Tie in finalizeTask → REJECTED** (round 2)
19. **Two-step oracle rotation enforces cooldown** (round 2)
20. **harvest no-ops cleanly when nothing pending** (round 2)
21. **Bounded strings on every free-form proposal/task field** (round 2)
