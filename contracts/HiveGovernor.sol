// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

interface IHiveStakingGov {
    function weightOf(address user) external view returns (uint256);
    function stakes(address user)
        external
        view
        returns (uint128 amount, uint64 lockEnd, uint64 lockDuration);
    function totalWeighted() external view returns (uint256);
    function freezeUntil(address user, uint64 until) external;
}

/// @title HiveGovernor
/// @notice On-chain governance for the Hive Incubator. Two artefacts:
///         * Proposals — yes/no/abstain votes on AI-generated startup ideas.
///         * Tasks — A/B/C votes on milestone decisions for live projects.
///
/// Voting power is the staker's `weightOf` at vote-cast time. To defeat
/// flash-borrow attacks AND keep voting weight collateralised through the
/// vote, voters must satisfy `stakes(user).lockEnd >= votingEnd`, AND each
/// vote calls `staking.freezeUntil(voter, votingEnd)` to block the staker
/// from unstaking before the latest open vote they cast has closed. This
/// closes the "vote then walk with principal, forfeit only rewards" attack
/// (audit H-G1).
///
/// Audit fixes in this revision:
///  * Vote freeze (H-G1).
///  * Threshold defaults removed — oracle MUST pass an explicit threshold
///    (H-G2).
///  * String length bounds on every free-form field (M-G3).
///  * Duplicate option labels rejected (M-G4).
///  * Tie in `finalizeTask` => REJECTED instead of leftmost-wins (M-G2 task).
///  * Two-step oracle rotation: pendingOracle + acceptOracle, with a min
///    delay (M-G5).
///  * Storage packing: numeric trailers consolidated into 3 slots on
///    Proposal, 2 slots on Task.
///  * Custom errors throughout.
contract HiveGovernor is Ownable2Step, Pausable {
    uint64 public constant VOTING_WINDOW_MIN = 1 days;
    uint64 public constant VOTING_WINDOW_MAX = 7 days;

    uint16 public constant PROPOSAL_PASS_BPS = 6_000; // 60%
    uint16 public constant TASK_PASS_BPS = 5_500; // 55%
    uint16 public constant BPS = 10_000;

    uint8 public constant MAX_OPTIONS = 5;
    uint8 public constant MAX_STAGES = 5;

    uint8 public constant VOTE_NONE = 0;
    uint8 public constant VOTE_YES = 1;
    uint8 public constant VOTE_NO = 2;
    uint8 public constant VOTE_ABSTAIN = 3;

    uint8 public constant STATUS_ACTIVE = 0;
    uint8 public constant STATUS_PASSED = 1; // tasks: DECIDED
    uint8 public constant STATUS_REJECTED = 2;

    /// @notice Field length caps. Bytes (UTF-8 encoded), not glyph counts.
    uint16 public constant MAX_TITLE_LEN = 80;
    uint16 public constant MAX_DESCRIPTION_LEN = 1024;
    uint16 public constant MAX_CATEGORY_LEN = 32;
    uint16 public constant MAX_BUILD_TIME_LEN = 32;
    uint16 public constant MAX_OPTION_LABEL_LEN = 64;
    uint16 public constant MAX_OPTION_DESC_LEN = 256;

    /// @notice Cooldown a pending oracle rotation must serve before the new
    ///         oracle can be accepted. Gives the security multisig time to
    ///         react to a compromise.
    uint64 public constant ORACLE_ROTATION_DELAY = 24 hours;

    IHiveStakingGov public immutable staking;
    address public oracle;
    address public pendingOracle;
    uint64 public pendingOracleEffectiveAt;

    /// @dev `string` fields each occupy a fixed slot (pointer to the dyn
    ///      array); fixed-width trailers are packed into the slots after.
    struct Proposal {
        // dynamic fields — one slot pointer each
        string title;
        string description;
        string category;
        string buildTime;
        // packed slot A: [votingStart u64 | votingEnd u64 | yes u128]  (256 bits)
        uint64 votingStart;
        uint64 votingEnd;
        uint128 yes;
        // packed slot B: [no u128 | abstain u128]
        uint128 no;
        uint128 abstain;
        // packed slot C: [threshold u128 | participants u32 | complexity u8 | marketPotential u8 | status u8]
        uint128 threshold;
        uint32 participants;
        uint8 complexity;
        uint8 marketPotential;
        uint8 status;
    }

    struct Task {
        bytes32 projectKey; // 1 slot
        string description; // 1 slot pointer
        // packed slot: [votingStart u64 | votingEnd u64 | threshold u128]
        uint64 votingStart;
        uint64 votingEnd;
        uint128 threshold;
        // packed slot: [totalVotes u128 | stage u8 | optionCount u8 | status u8 | decidedOption u8]
        uint128 totalVotes;
        uint8 stage;
        uint8 optionCount;
        uint8 status;
        uint8 decidedOption;
    }

    struct TaskOption {
        string label;
        string description;
        uint128 votes;
    }

    /// @notice Input shape for createTask — kept compact and lets us store
    ///         options under a nested mapping.
    struct OptionInput {
        string label;
        string description;
    }

    uint256 public proposalCount;
    uint256 public taskCount;

    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => uint8)) public proposalVotes;

    mapping(uint256 => Task) public tasks;
    mapping(uint256 => mapping(uint8 => TaskOption)) internal _taskOptions;
    /// @dev option index is 1-based (0 = "did not vote").
    mapping(uint256 => mapping(address => uint8)) public taskVotes;

    error NotOracle();
    error AddressZero();
    error WindowTooShort();
    error WindowTooLong();
    error WindowEndsInPast();
    error ThresholdRequired();
    error BadScore();
    error TitleTooLong();
    error TitleEmpty();
    error DescriptionTooLong();
    error DescriptionEmpty();
    error CategoryTooLong();
    error BuildTimeTooLong();
    error OptionLabelEmpty();
    error OptionLabelTooLong();
    error OptionDescTooLong();
    error DuplicateOption();
    error TooFewOptions();
    error TooManyOptions();
    error BadStage();
    error ProjectKeyZero();
    error NoSuchProposal();
    error NoSuchTask();
    error NotActive();
    error VotingClosed();
    error VotingStillOpen();
    error AlreadyVoted();
    error BadChoice();
    error BadOption();
    error NoWeight();
    error WeightTooLarge();
    error NoPendingRotation();
    error RotationCooldown(uint64 effectiveAt);

    event OracleSet(address indexed oldOracle, address indexed newOracle);
    event OracleRotationProposed(address indexed pending, uint64 effectiveAt);
    event OracleRotationCancelled(address indexed pending);
    event ProposalCreated(uint256 indexed id, string title, uint64 votingEnd, uint128 threshold);
    event ProposalVoted(uint256 indexed id, address indexed voter, uint8 choice, uint256 weight);
    event ProposalFinalized(uint256 indexed id, uint8 status);
    event TaskCreated(
        uint256 indexed id,
        bytes32 indexed projectKey,
        uint8 stage,
        uint8 optionCount,
        uint64 votingEnd
    );
    event TaskVoted(uint256 indexed id, address indexed voter, uint8 option, uint256 weight);
    event TaskFinalized(uint256 indexed id, uint8 status, uint8 decidedOption);

    modifier onlyOracle() {
        if (msg.sender != oracle) revert NotOracle();
        _;
    }

    constructor(address initialOwner, address _staking, address _oracle) Ownable(initialOwner) {
        if (_staking == address(0) || _oracle == address(0)) revert AddressZero();
        staking = IHiveStakingGov(_staking);
        oracle = _oracle;
        emit OracleSet(address(0), _oracle);
    }

    // ─────────────────────── Admin: oracle rotation ───────────────────────

    /// @notice Begin a 24h two-step oracle rotation. The new oracle gains
    ///         access only after `ORACLE_ROTATION_DELAY` and an explicit
    ///         `acceptOracleRotation` call. Cancellable via `setOracleNow`
    ///         with the same target (re-proposal) or by the multisig.
    function proposeOracle(address _oracle) external onlyOwner {
        if (_oracle == address(0)) revert AddressZero();
        pendingOracle = _oracle;
        pendingOracleEffectiveAt = uint64(block.timestamp) + ORACLE_ROTATION_DELAY;
        emit OracleRotationProposed(_oracle, pendingOracleEffectiveAt);
    }

    /// @notice Finalise the oracle rotation after the cooldown.
    function acceptOracleRotation() external onlyOwner {
        if (pendingOracle == address(0)) revert NoPendingRotation();
        if (block.timestamp < pendingOracleEffectiveAt) {
            revert RotationCooldown(pendingOracleEffectiveAt);
        }
        address old = oracle;
        oracle = pendingOracle;
        pendingOracle = address(0);
        pendingOracleEffectiveAt = 0;
        emit OracleSet(old, oracle);
    }

    /// @notice Abort a pending rotation (e.g. multisig changed its mind).
    function cancelOracleRotation() external onlyOwner {
        if (pendingOracle == address(0)) revert NoPendingRotation();
        address abandoned = pendingOracle;
        pendingOracle = address(0);
        pendingOracleEffectiveAt = 0;
        emit OracleRotationCancelled(abandoned);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ─────────────────────────── Proposals ───────────────────────────

    function createProposal(
        string calldata title,
        string calldata description,
        string calldata category,
        string calldata buildTime,
        uint8 complexity,
        uint8 marketPotential,
        uint64 votingEnd,
        uint128 threshold
    ) external onlyOracle whenNotPaused returns (uint256 id) {
        _checkWindow(votingEnd);
        if (threshold == 0) revert ThresholdRequired();
        if (complexity > 10 || marketPotential > 10) revert BadScore();

        uint256 titleLen = bytes(title).length;
        if (titleLen == 0) revert TitleEmpty();
        if (titleLen > MAX_TITLE_LEN) revert TitleTooLong();
        uint256 descLen = bytes(description).length;
        if (descLen == 0) revert DescriptionEmpty();
        if (descLen > MAX_DESCRIPTION_LEN) revert DescriptionTooLong();
        if (bytes(category).length > MAX_CATEGORY_LEN) revert CategoryTooLong();
        if (bytes(buildTime).length > MAX_BUILD_TIME_LEN) revert BuildTimeTooLong();

        unchecked { id = ++proposalCount; }
        Proposal storage p = proposals[id];
        p.title = title;
        p.description = description;
        p.category = category;
        p.buildTime = buildTime;
        p.complexity = complexity;
        p.marketPotential = marketPotential;
        p.votingStart = uint64(block.timestamp);
        p.votingEnd = votingEnd;
        p.threshold = threshold;
        // status / yes / no / abstain / participants default to 0

        emit ProposalCreated(id, title, votingEnd, threshold);
    }

    function vote(uint256 id, uint8 choice) external whenNotPaused {
        if (choice == 0 || choice > VOTE_ABSTAIN) revert BadChoice();
        Proposal storage p = proposals[id];
        uint64 vEnd = p.votingEnd;
        if (vEnd == 0) revert NoSuchProposal();
        if (p.status != STATUS_ACTIVE) revert NotActive();
        if (block.timestamp >= vEnd) revert VotingClosed();
        if (proposalVotes[id][msg.sender] != VOTE_NONE) revert AlreadyVoted();

        uint256 w = _eligibleWeight(msg.sender, vEnd);
        if (w == 0) revert NoWeight();
        if (w > type(uint128).max) revert WeightTooLarge();

        proposalVotes[id][msg.sender] = choice;
        if (choice == VOTE_YES) p.yes += uint128(w);
        else if (choice == VOTE_NO) p.no += uint128(w);
        else p.abstain += uint128(w);
        // participants overflow: realistically impossible at uint32 (4.29B).
        // Keeping checked is ~30 gas; cheap insurance vs silent wrap.
        p.participants += 1;

        // Freeze the voter's stake until the vote closes so they can't
        // unstake-and-walk while their tally still counts. Best-effort:
        // if the staking contract is in a deploy/wire-up mode without a
        // governor set, this reverts with `NotGovernor` — surface upward.
        staking.freezeUntil(msg.sender, vEnd);

        emit ProposalVoted(id, msg.sender, choice, w);
    }

    function finalizeProposal(uint256 id) external {
        Proposal storage p = proposals[id];
        if (p.votingEnd == 0) revert NoSuchProposal();
        if (p.status != STATUS_ACTIVE) revert NotActive();
        if (block.timestamp < p.votingEnd) revert VotingStillOpen();

        uint256 yes = p.yes;
        uint256 no = p.no;
        uint256 abstain = p.abstain;
        uint256 total = yes + no + abstain;

        uint8 result;
        if (total < p.threshold) {
            result = STATUS_REJECTED;
        } else {
            // Pass ratio uses YES + NO only; ABSTAIN counts toward quorum
            // but not toward the pass margin.
            uint256 binary = yes + no;
            if (binary > 0 && (yes * BPS) / binary >= PROPOSAL_PASS_BPS) {
                result = STATUS_PASSED;
            } else {
                result = STATUS_REJECTED;
            }
        }
        p.status = result;
        emit ProposalFinalized(id, result);
    }

    // ─────────────────────────── Tasks ───────────────────────────

    function createTask(
        bytes32 projectKey,
        string calldata description,
        uint8 stage,
        OptionInput[] calldata options,
        uint64 votingEnd,
        uint128 threshold
    ) external onlyOracle whenNotPaused returns (uint256 id) {
        _checkWindow(votingEnd);
        if (threshold == 0) revert ThresholdRequired();
        if (stage >= MAX_STAGES) revert BadStage();
        if (projectKey == bytes32(0)) revert ProjectKeyZero();

        uint256 n = options.length;
        if (n < 2) revert TooFewOptions();
        if (n > MAX_OPTIONS) revert TooManyOptions();

        uint256 descLen = bytes(description).length;
        if (descLen == 0) revert DescriptionEmpty();
        if (descLen > MAX_DESCRIPTION_LEN) revert DescriptionTooLong();

        unchecked { id = ++taskCount; }
        Task storage t = tasks[id];
        t.projectKey = projectKey;
        t.description = description;
        t.stage = stage;
        t.votingStart = uint64(block.timestamp);
        t.votingEnd = votingEnd;
        t.threshold = threshold;
        t.optionCount = uint8(n);

        // O(n²) duplicate-label check; n ≤ 5.
        for (uint256 i = 0; i < n; ) {
            string calldata label = options[i].label;
            string calldata desc = options[i].description;
            uint256 lLen = bytes(label).length;
            if (lLen == 0) revert OptionLabelEmpty();
            if (lLen > MAX_OPTION_LABEL_LEN) revert OptionLabelTooLong();
            if (bytes(desc).length > MAX_OPTION_DESC_LEN) revert OptionDescTooLong();

            bytes32 lhash = keccak256(bytes(label));
            for (uint256 j = 0; j < i; ) {
                if (keccak256(bytes(options[j].label)) == lhash) revert DuplicateOption();
                unchecked { ++j; }
            }

            // store at 1-based index (see taskVotes mapping).
            _taskOptions[id][uint8(i + 1)] = TaskOption({
                label: label,
                description: desc,
                votes: 0
            });
            unchecked { ++i; }
        }

        emit TaskCreated(id, projectKey, stage, uint8(n), votingEnd);
    }

    function voteTask(uint256 id, uint8 option) external whenNotPaused {
        Task storage t = tasks[id];
        uint64 vEnd = t.votingEnd;
        if (vEnd == 0) revert NoSuchTask();
        if (t.status != STATUS_ACTIVE) revert NotActive();
        if (block.timestamp >= vEnd) revert VotingClosed();
        if (option == 0 || option > t.optionCount) revert BadOption();
        if (taskVotes[id][msg.sender] != 0) revert AlreadyVoted();

        uint256 w = _eligibleWeight(msg.sender, vEnd);
        if (w == 0) revert NoWeight();
        if (w > type(uint128).max) revert WeightTooLarge();

        taskVotes[id][msg.sender] = option;
        _taskOptions[id][option].votes += uint128(w);
        t.totalVotes += uint128(w);

        staking.freezeUntil(msg.sender, vEnd);

        emit TaskVoted(id, msg.sender, option, w);
    }

    function finalizeTask(uint256 id) external {
        Task storage t = tasks[id];
        if (t.votingEnd == 0) revert NoSuchTask();
        if (t.status != STATUS_ACTIVE) revert NotActive();
        if (block.timestamp < t.votingEnd) revert VotingStillOpen();

        if (t.totalVotes < t.threshold) {
            t.status = STATUS_REJECTED;
            emit TaskFinalized(id, STATUS_REJECTED, 0);
            return;
        }

        // find leader; track second-best to detect ties.
        uint8 leaderIdx = 0;
        uint128 leaderVotes = 0;
        uint128 runnerUpVotes = 0;
        uint8 n = t.optionCount;
        for (uint8 i = 1; i <= n; ) {
            uint128 v = _taskOptions[id][i].votes;
            if (v > leaderVotes) {
                runnerUpVotes = leaderVotes;
                leaderVotes = v;
                leaderIdx = i;
            } else if (v > runnerUpVotes) {
                runnerUpVotes = v;
            }
            unchecked { ++i; }
        }

        // Tie at the top => no decision (audit M-G2 task).
        if (leaderIdx == 0 || leaderVotes == runnerUpVotes) {
            t.status = STATUS_REJECTED;
            emit TaskFinalized(id, STATUS_REJECTED, 0);
            return;
        }

        // Leader must clear PASS_BPS of all task votes.
        if ((uint256(leaderVotes) * BPS) / t.totalVotes < TASK_PASS_BPS) {
            t.status = STATUS_REJECTED;
            emit TaskFinalized(id, STATUS_REJECTED, 0);
            return;
        }

        t.status = STATUS_PASSED;
        t.decidedOption = leaderIdx;
        emit TaskFinalized(id, STATUS_PASSED, leaderIdx);
    }

    // ─────────────────────────── Views ───────────────────────────

    function taskOption(uint256 id, uint8 option) external view returns (TaskOption memory) {
        if (option == 0 || option > tasks[id].optionCount) revert BadOption();
        return _taskOptions[id][option];
    }

    function taskOptions(uint256 id) external view returns (TaskOption[] memory out) {
        Task storage t = tasks[id];
        uint8 n = t.optionCount;
        out = new TaskOption[](n);
        for (uint8 i = 0; i < n; ) {
            out[i] = _taskOptions[id][i + 1];
            unchecked { ++i; }
        }
    }

    /// @notice The voting weight `user` would commit if they voted now on a
    ///         proposal that ends at `endTime`. Returns 0 if the user lacks
    ///         the lock-end commitment.
    function eligibleWeight(address user, uint64 endTime) external view returns (uint256) {
        return _eligibleWeight(user, endTime);
    }

    // ─────────────────────────── Internal ───────────────────────────

    function _checkWindow(uint64 votingEnd) internal view {
        if (votingEnd <= block.timestamp) revert WindowEndsInPast();
        uint64 window;
        unchecked { window = votingEnd - uint64(block.timestamp); }
        if (window < VOTING_WINDOW_MIN) revert WindowTooShort();
        if (window > VOTING_WINDOW_MAX) revert WindowTooLong();
    }

    function _eligibleWeight(address user, uint64 endTime) internal view returns (uint256) {
        (, uint64 lockEnd, ) = staking.stakes(user);
        if (lockEnd < endTime) return 0;
        return staking.weightOf(user);
    }
}
