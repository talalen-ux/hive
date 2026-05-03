// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

interface IHiveStakingGov {
    function weightOf(address user) external view returns (uint256);
    function totalWeighted() external view returns (uint256);
    function freezeUntil(address user, uint64 until) external;
}

/// @title HiveGovernor (no-lock model)
/// @notice On-chain governance for the Hive Incubator. Three artefacts:
///         * Idea proposals — yes/no/abstain on AI-generated startup ideas
///           (oracle-only creation).
///         * Community proposals — yes/no/abstain on staker-submitted
///           project proposals. Anyone with `weightOf(msg.sender) >=
///           minProposeStake` can submit.
///         * Tasks — A/B/C votes on milestone decisions for live projects
///           (oracle-only creation).
///
/// Voting power: stake at vote-cast time (no time multiplier in the no-lock
/// model). To stop "vote then unstake principal" the governor calls
/// `staking.freezeUntil(voter, votingEnd)` on every vote — the staking
/// contract refuses unstakes while the freeze is active.
///
/// Pass criteria mirror the prior model: 60% YES of (yes+no) + quorum
/// for proposals; 55% leader of all task votes for tasks; ties → REJECTED.
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
    uint8 public constant STATUS_PASSED = 1;
    uint8 public constant STATUS_REJECTED = 2;

    uint16 public constant MAX_TITLE_LEN = 80;
    uint16 public constant MAX_DESCRIPTION_LEN = 1024;
    uint16 public constant MAX_CATEGORY_LEN = 32;
    uint16 public constant MAX_BUILD_TIME_LEN = 32;
    uint16 public constant MAX_OPTION_LABEL_LEN = 64;
    uint16 public constant MAX_OPTION_DESC_LEN = 256;

    uint64 public constant ORACLE_ROTATION_DELAY = 24 hours;

    IHiveStakingGov public immutable staking;
    address public oracle;
    address public pendingOracle;
    uint64 public pendingOracleEffectiveAt;

    /// @notice Minimum staked weight required to submit a community
    ///         proposal. Anti-spam — the multisig tunes via setMinProposeStake.
    uint128 public minProposeStake;

    struct Proposal {
        string title;
        string description;
        string category;
        string buildTime;
        uint64 votingStart;
        uint64 votingEnd;
        uint128 yes;
        uint128 no;
        uint128 abstain;
        uint128 threshold;
        uint32 participants;
        uint8 complexity;
        uint8 marketPotential;
        uint8 status;
        // submitter: oracle address for AI-generated ideas, the staker
        // wallet for community-submitted ones. Off-chain compares against
        // `oracle()` to distinguish provenance.
        address submitter;
    }

    struct CommunityProposal {
        bytes32 projectKey;
        address submitter;
        string title;
        string description;
        uint64 votingStart;
        uint64 votingEnd;
        uint128 yes;
        uint128 no;
        uint128 abstain;
        uint128 threshold;
        uint32 participants;
        uint8 status;
        uint256 becameTaskId; // 0 = none
    }

    struct Task {
        bytes32 projectKey;
        string description;
        uint64 votingStart;
        uint64 votingEnd;
        uint128 threshold;
        uint128 totalVotes;
        uint8 stage;
        uint8 optionCount;
        uint8 status;
        uint8 decidedOption;
        // submitter: same semantics as Proposal.submitter. Auto-promoted
        // tasks from community proposals carry the original proposer's
        // address.
        address submitter;
    }

    struct TaskOption {
        string label;
        string description;
        uint128 votes;
    }

    struct OptionInput {
        string label;
        string description;
    }

    uint256 public proposalCount;
    uint256 public taskCount;
    uint256 public communityProposalCount;

    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => uint8)) public proposalVotes;

    mapping(uint256 => Task) public tasks;
    mapping(uint256 => mapping(uint8 => TaskOption)) internal _taskOptions;
    mapping(uint256 => mapping(address => uint8)) public taskVotes;

    mapping(uint256 => CommunityProposal) public communityProposals;
    mapping(uint256 => mapping(address => uint8)) public communityVotes;

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
    error NoSuchCommunity();
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
    error InsufficientStakeToPropose(uint256 have, uint256 need);

    event OracleSet(address indexed oldOracle, address indexed newOracle);
    event OracleRotationProposed(address indexed pending, uint64 effectiveAt);
    event OracleRotationCancelled(address indexed pending);
    event MinProposeStakeSet(uint128 newValue);
    event ProposalCreated(
        uint256 indexed id,
        address indexed submitter,
        string title,
        uint64 votingEnd,
        uint128 threshold
    );
    event ProposalVoted(uint256 indexed id, address indexed voter, uint8 choice, uint256 weight);
    event ProposalFinalized(uint256 indexed id, uint8 status);
    event TaskCreated(
        uint256 indexed id,
        bytes32 indexed projectKey,
        address indexed submitter,
        uint8 stage,
        uint8 optionCount,
        uint64 votingEnd
    );
    event TaskVoted(uint256 indexed id, address indexed voter, uint8 option, uint256 weight);
    event TaskFinalized(uint256 indexed id, uint8 status, uint8 decidedOption);
    event CommunityProposalSubmitted(
        uint256 indexed id,
        bytes32 indexed projectKey,
        address indexed submitter,
        string title,
        uint64 votingEnd
    );
    event CommunityProposalVoted(uint256 indexed id, address indexed voter, uint8 choice, uint256 weight);
    event CommunityProposalFinalized(uint256 indexed id, uint8 status, uint256 becameTaskId);

    modifier onlyOracle() {
        if (msg.sender != oracle) revert NotOracle();
        _;
    }

    /// @dev Either the oracle (AI generator) or any wallet whose staked
    ///      weight clears `minProposeStake` may submit. This is the same
    ///      anti-spam gate as `submitCommunityProposal`.
    modifier onlyOracleOrStaker() {
        if (msg.sender != oracle) {
            uint256 w = staking.weightOf(msg.sender);
            if (w < minProposeStake) {
                revert InsufficientStakeToPropose(w, minProposeStake);
            }
        }
        _;
    }

    constructor(
        address initialOwner,
        address _staking,
        address _oracle,
        uint128 _minProposeStake
    ) Ownable(initialOwner) {
        if (_staking == address(0) || _oracle == address(0)) revert AddressZero();
        staking = IHiveStakingGov(_staking);
        oracle = _oracle;
        minProposeStake = _minProposeStake;
        emit OracleSet(address(0), _oracle);
        emit MinProposeStakeSet(_minProposeStake);
    }

    // ─────────────────────── Admin ───────────────────────

    function proposeOracle(address _oracle) external onlyOwner {
        if (_oracle == address(0)) revert AddressZero();
        pendingOracle = _oracle;
        pendingOracleEffectiveAt = uint64(block.timestamp) + ORACLE_ROTATION_DELAY;
        emit OracleRotationProposed(_oracle, pendingOracleEffectiveAt);
    }

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

    function cancelOracleRotation() external onlyOwner {
        if (pendingOracle == address(0)) revert NoPendingRotation();
        address abandoned = pendingOracle;
        pendingOracle = address(0);
        pendingOracleEffectiveAt = 0;
        emit OracleRotationCancelled(abandoned);
    }

    function setMinProposeStake(uint128 v) external onlyOwner {
        minProposeStake = v;
        emit MinProposeStakeSet(v);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ─────────────────────── Idea proposals (oracle) ───────────────────────

    /// @notice Submit a project-idea proposal. Open to the oracle (AI
    ///         generator) and to any wallet with `weightOf >= minProposeStake`
    ///         (staker-submitted). Off-chain compares `proposals(id).submitter`
    ///         to `oracle()` to distinguish AI vs community provenance.
    function createProposal(
        string calldata title,
        string calldata description,
        string calldata category,
        string calldata buildTime,
        uint8 complexity,
        uint8 marketPotential,
        uint64 votingEnd,
        uint128 threshold
    ) external onlyOracleOrStaker whenNotPaused returns (uint256 id) {
        _checkWindow(votingEnd);
        if (threshold == 0) revert ThresholdRequired();
        if (complexity > 10 || marketPotential > 10) revert BadScore();
        _checkTitle(title);
        _checkDescription(description);
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
        p.submitter = msg.sender;
        emit ProposalCreated(id, msg.sender, title, votingEnd, threshold);
    }

    function vote(uint256 id, uint8 choice) external whenNotPaused {
        if (choice == 0 || choice > VOTE_ABSTAIN) revert BadChoice();
        Proposal storage p = proposals[id];
        uint64 vEnd = p.votingEnd;
        if (vEnd == 0) revert NoSuchProposal();
        if (p.status != STATUS_ACTIVE) revert NotActive();
        if (block.timestamp >= vEnd) revert VotingClosed();
        if (proposalVotes[id][msg.sender] != VOTE_NONE) revert AlreadyVoted();

        uint256 w = staking.weightOf(msg.sender);
        if (w == 0) revert NoWeight();
        if (w > type(uint128).max) revert WeightTooLarge();

        proposalVotes[id][msg.sender] = choice;
        if (choice == VOTE_YES) p.yes += uint128(w);
        else if (choice == VOTE_NO) p.no += uint128(w);
        else p.abstain += uint128(w);
        p.participants += 1;

        staking.freezeUntil(msg.sender, vEnd);
        emit ProposalVoted(id, msg.sender, choice, w);
    }

    function finalizeProposal(uint256 id) external {
        Proposal storage p = proposals[id];
        if (p.votingEnd == 0) revert NoSuchProposal();
        if (p.status != STATUS_ACTIVE) revert NotActive();
        if (block.timestamp < p.votingEnd) revert VotingStillOpen();

        p.status = _evaluatePass(p.yes, p.no, p.abstain, p.threshold)
            ? STATUS_PASSED
            : STATUS_REJECTED;
        emit ProposalFinalized(id, p.status);
    }

    // ─────────────────────── Community proposals (stakers) ───────────────────────

    function submitCommunityProposal(
        bytes32 projectKey,
        string calldata title,
        string calldata description,
        uint64 votingEnd,
        uint128 threshold
    ) external whenNotPaused returns (uint256 id) {
        // Anti-spam: caller must hold at least `minProposeStake`.
        uint256 stakeAmt = staking.weightOf(msg.sender);
        if (stakeAmt < minProposeStake) {
            revert InsufficientStakeToPropose(stakeAmt, minProposeStake);
        }

        _checkWindow(votingEnd);
        if (threshold == 0) revert ThresholdRequired();
        if (projectKey == bytes32(0)) revert ProjectKeyZero();
        _checkTitle(title);
        _checkDescription(description);

        unchecked { id = ++communityProposalCount; }
        CommunityProposal storage c = communityProposals[id];
        c.projectKey = projectKey;
        c.submitter = msg.sender;
        c.title = title;
        c.description = description;
        c.votingStart = uint64(block.timestamp);
        c.votingEnd = votingEnd;
        c.threshold = threshold;
        emit CommunityProposalSubmitted(id, projectKey, msg.sender, title, votingEnd);
    }

    function voteCommunity(uint256 id, uint8 choice) external whenNotPaused {
        if (choice == 0 || choice > VOTE_ABSTAIN) revert BadChoice();
        CommunityProposal storage c = communityProposals[id];
        uint64 vEnd = c.votingEnd;
        if (vEnd == 0) revert NoSuchCommunity();
        if (c.status != STATUS_ACTIVE) revert NotActive();
        if (block.timestamp >= vEnd) revert VotingClosed();
        if (communityVotes[id][msg.sender] != VOTE_NONE) revert AlreadyVoted();

        uint256 w = staking.weightOf(msg.sender);
        if (w == 0) revert NoWeight();
        if (w > type(uint128).max) revert WeightTooLarge();

        communityVotes[id][msg.sender] = choice;
        if (choice == VOTE_YES) c.yes += uint128(w);
        else if (choice == VOTE_NO) c.no += uint128(w);
        else c.abstain += uint128(w);
        c.participants += 1;

        staking.freezeUntil(msg.sender, vEnd);
        emit CommunityProposalVoted(id, msg.sender, choice, w);
    }

    /// @notice Finalise a community proposal after its window closes. On
    ///         pass, auto-creates a task on the project (status PASSED,
    ///         no options — the action item IS the description).
    function finalizeCommunityProposal(uint256 id) external {
        CommunityProposal storage c = communityProposals[id];
        if (c.votingEnd == 0) revert NoSuchCommunity();
        if (c.status != STATUS_ACTIVE) revert NotActive();
        if (block.timestamp < c.votingEnd) revert VotingStillOpen();

        bool passed = _evaluatePass(c.yes, c.no, c.abstain, c.threshold);
        if (passed) {
            c.status = STATUS_PASSED;
            uint256 newTaskId;
            unchecked { newTaskId = ++taskCount; }
            Task storage t = tasks[newTaskId];
            t.projectKey = c.projectKey;
            t.description = c.title;
            t.votingStart = uint64(block.timestamp);
            t.votingEnd = uint64(block.timestamp);
            // Already decided — no live vote, no options.
            t.threshold = 0;
            t.totalVotes = 0;
            t.stage = 0;
            t.optionCount = 0;
            t.status = STATUS_PASSED;
            t.decidedOption = 0;
            t.submitter = c.submitter; // preserve community-proposal provenance
            c.becameTaskId = newTaskId;
            emit TaskCreated(newTaskId, c.projectKey, c.submitter, 0, 0, uint64(block.timestamp));
            emit TaskFinalized(newTaskId, STATUS_PASSED, 0);
            emit CommunityProposalFinalized(id, STATUS_PASSED, newTaskId);
        } else {
            c.status = STATUS_REJECTED;
            emit CommunityProposalFinalized(id, STATUS_REJECTED, 0);
        }
    }

    // ─────────────────────── Multi-option tasks ───────────────────────

    /// @notice Submit a multi-option task vote (e.g. naming options A/B/C
    ///         for a project). Open to the oracle and to any wallet with
    ///         `weightOf >= minProposeStake`.
    function createTask(
        bytes32 projectKey,
        string calldata description,
        uint8 stage,
        OptionInput[] calldata options,
        uint64 votingEnd,
        uint128 threshold
    ) external onlyOracleOrStaker whenNotPaused returns (uint256 id) {
        _checkWindow(votingEnd);
        if (threshold == 0) revert ThresholdRequired();
        if (stage >= MAX_STAGES) revert BadStage();
        if (projectKey == bytes32(0)) revert ProjectKeyZero();

        uint256 n = options.length;
        if (n < 2) revert TooFewOptions();
        if (n > MAX_OPTIONS) revert TooManyOptions();
        _checkDescription(description);

        unchecked { id = ++taskCount; }
        Task storage t = tasks[id];
        t.projectKey = projectKey;
        t.description = description;
        t.stage = stage;
        t.votingStart = uint64(block.timestamp);
        t.votingEnd = votingEnd;
        t.threshold = threshold;
        t.optionCount = uint8(n);
        t.submitter = msg.sender;

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

            _taskOptions[id][uint8(i + 1)] = TaskOption({
                label: label,
                description: desc,
                votes: 0
            });
            unchecked { ++i; }
        }
        emit TaskCreated(id, projectKey, msg.sender, stage, uint8(n), votingEnd);
    }

    function voteTask(uint256 id, uint8 option) external whenNotPaused {
        Task storage t = tasks[id];
        uint64 vEnd = t.votingEnd;
        if (vEnd == 0) revert NoSuchTask();
        if (t.status != STATUS_ACTIVE) revert NotActive();
        if (block.timestamp >= vEnd) revert VotingClosed();
        if (option == 0 || option > t.optionCount) revert BadOption();
        if (taskVotes[id][msg.sender] != 0) revert AlreadyVoted();

        uint256 w = staking.weightOf(msg.sender);
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

        if (leaderIdx == 0 || leaderVotes == runnerUpVotes) {
            t.status = STATUS_REJECTED;
            emit TaskFinalized(id, STATUS_REJECTED, 0);
            return;
        }
        if ((uint256(leaderVotes) * BPS) / t.totalVotes < TASK_PASS_BPS) {
            t.status = STATUS_REJECTED;
            emit TaskFinalized(id, STATUS_REJECTED, 0);
            return;
        }

        t.status = STATUS_PASSED;
        t.decidedOption = leaderIdx;
        emit TaskFinalized(id, STATUS_PASSED, leaderIdx);
    }

    // ─────────────────────── Views ───────────────────────

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

    function eligibleWeight(address user) external view returns (uint256) {
        return staking.weightOf(user);
    }

    function canPropose(address user) external view returns (bool) {
        return staking.weightOf(user) >= minProposeStake;
    }

    // ─────────────────────── Internal ───────────────────────

    function _checkWindow(uint64 votingEnd) internal view {
        if (votingEnd <= block.timestamp) revert WindowEndsInPast();
        uint64 window;
        unchecked { window = votingEnd - uint64(block.timestamp); }
        if (window < VOTING_WINDOW_MIN) revert WindowTooShort();
        if (window > VOTING_WINDOW_MAX) revert WindowTooLong();
    }

    function _checkTitle(string calldata title) internal pure {
        uint256 n = bytes(title).length;
        if (n == 0) revert TitleEmpty();
        if (n > MAX_TITLE_LEN) revert TitleTooLong();
    }

    function _checkDescription(string calldata d) internal pure {
        uint256 n = bytes(d).length;
        if (n == 0) revert DescriptionEmpty();
        if (n > MAX_DESCRIPTION_LEN) revert DescriptionTooLong();
    }

    function _evaluatePass(
        uint128 yes,
        uint128 no,
        uint128 abstain,
        uint128 threshold
    ) internal pure returns (bool) {
        uint256 total = uint256(yes) + no + abstain;
        if (total < threshold) return false;
        uint256 binary = uint256(yes) + no;
        if (binary == 0) return false;
        return (uint256(yes) * BPS) / binary >= PROPOSAL_PASS_BPS;
    }
}
