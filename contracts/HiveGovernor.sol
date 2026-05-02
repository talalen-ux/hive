// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

interface IHiveStakingView {
    function weightOf(address user) external view returns (uint256);
    function stakes(address user)
        external
        view
        returns (uint128 amount, uint64 lockEnd, uint64 lockDuration);
    function totalWeighted() external view returns (uint256);
}

/// @title HiveGovernor
/// @notice On-chain governance for the Hive Incubator. Two artefacts:
///         * Proposals — yes/no/abstain votes on AI-generated startup ideas.
///         * Tasks — A/B/C votes on milestone decisions for live projects.
///
/// Voting power is the staker's `weightOf` at vote-cast time. To defeat
/// flash-borrow attacks AND align with the lock-tier philosophy, voters
/// must have `stakes(user).lockEnd >= votingEnd` — i.e. their stake must
/// remain committed until the vote closes.
///
/// Only the configured `oracle` (AI backend, or a multisig the team
/// controls today) may create proposals/tasks. Anyone may finalise after
/// `votingEnd`. The contract has no admin override of votes, no setter
/// that can move funds, and no upgradeability — it is intentionally
/// minimal and immutable.
contract HiveGovernor is Ownable2Step, Pausable {
    /// @notice Hard caps on the voting window so the lock-end constraint is
    ///         always satisfiable by an active staker.
    uint64 public constant VOTING_WINDOW_MIN = 1 days;
    uint64 public constant VOTING_WINDOW_MAX = 7 days;

    /// @notice Quorum + threshold defaults expressed in basis points.
    uint16 public constant PROPOSAL_PASS_BPS = 6_000; // 60%
    uint16 public constant TASK_PASS_BPS = 5_500; // 55%
    uint16 public constant BPS = 10_000;

    uint8 public constant MAX_OPTIONS = 5;
    uint8 public constant MAX_STAGES = 5; // INITIATION..LAUNCH

    /// @notice Vote choice on a proposal. 0 = none, set when uninitialised.
    uint8 public constant VOTE_NONE = 0;
    uint8 public constant VOTE_YES = 1;
    uint8 public constant VOTE_NO = 2;
    uint8 public constant VOTE_ABSTAIN = 3;

    /// @notice Lifecycle status. Same enum used for proposals + tasks.
    uint8 public constant STATUS_ACTIVE = 0;
    uint8 public constant STATUS_PASSED = 1; // tasks: DECIDED
    uint8 public constant STATUS_REJECTED = 2; // tasks: REJECTED (no quorum / below threshold)

    IHiveStakingView public immutable staking;
    address public oracle;

    struct Proposal {
        // content
        string title;
        string description;
        string category;
        string buildTime;
        uint8 complexity;
        uint8 marketPotential;
        // window
        uint64 votingStart;
        uint64 votingEnd;
        // tally
        uint128 yes;
        uint128 no;
        uint128 abstain;
        uint128 threshold;
        uint32 participants;
        // result
        uint8 status;
    }

    struct Task {
        bytes32 projectKey;
        string description;
        uint8 stage;
        uint64 votingStart;
        uint64 votingEnd;
        uint128 threshold;
        uint128 totalVotes;
        uint8 optionCount;
        uint8 status;
        uint8 decidedOption;
    }

    struct TaskOption {
        string label;
        string description;
        uint128 votes;
    }

    /// @notice Input shape for createTask — keeps the public function signature
    ///         compact and lets us store options under a nested mapping.
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
    /// @dev option index is 1-based (0 = "did not vote") to fit voted state in a single uint8.
    mapping(uint256 => mapping(address => uint8)) public taskVotes;

    event OracleSet(address indexed oracle);
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
        require(msg.sender == oracle, "not oracle");
        _;
    }

    constructor(address initialOwner, address _staking, address _oracle) Ownable(initialOwner) {
        require(_staking != address(0), "staking=0");
        require(_oracle != address(0), "oracle=0");
        staking = IHiveStakingView(_staking);
        oracle = _oracle;
        emit OracleSet(_oracle);
    }

    // ─────────────────────────── Admin ───────────────────────────

    function setOracle(address _oracle) external onlyOwner {
        require(_oracle != address(0), "oracle=0");
        oracle = _oracle;
        emit OracleSet(_oracle);
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
        require(complexity <= 10 && marketPotential <= 10, "bad score");
        require(bytes(title).length > 0 && bytes(title).length <= 80, "bad title");
        require(bytes(description).length <= 1024, "desc too long");

        if (threshold == 0) {
            // default = 1% of current totalWeighted
            uint256 t = staking.totalWeighted() / 100;
            threshold = t > type(uint128).max ? type(uint128).max : uint128(t);
        }

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
        require(choice == VOTE_YES || choice == VOTE_NO || choice == VOTE_ABSTAIN, "bad choice");
        Proposal storage p = proposals[id];
        require(p.votingEnd != 0, "no proposal");
        require(p.status == STATUS_ACTIVE, "not active");
        require(block.timestamp < p.votingEnd, "closed");
        require(proposalVotes[id][msg.sender] == VOTE_NONE, "already voted");

        uint256 w = _eligibleWeight(msg.sender, p.votingEnd);
        require(w > 0, "no weight");
        require(w <= type(uint128).max, "weight too large");

        proposalVotes[id][msg.sender] = choice;
        if (choice == VOTE_YES) p.yes += uint128(w);
        else if (choice == VOTE_NO) p.no += uint128(w);
        else p.abstain += uint128(w);
        unchecked { p.participants += 1; }

        emit ProposalVoted(id, msg.sender, choice, w);
    }

    function finalizeProposal(uint256 id) external {
        Proposal storage p = proposals[id];
        require(p.votingEnd != 0, "no proposal");
        require(p.status == STATUS_ACTIVE, "already finalised");
        require(block.timestamp >= p.votingEnd, "still open");

        uint256 total = uint256(p.yes) + p.no + p.abstain;
        uint8 result;
        if (total < p.threshold) {
            result = STATUS_REJECTED;
        } else {
            // pass threshold ignores ABSTAIN, computed against YES+NO
            uint256 binary = uint256(p.yes) + p.no;
            if (binary > 0 && (uint256(p.yes) * BPS) / binary >= PROPOSAL_PASS_BPS) {
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
        require(stage < MAX_STAGES, "bad stage");
        require(options.length >= 2 && options.length <= MAX_OPTIONS, "bad options");
        require(projectKey != bytes32(0), "key=0");
        require(bytes(description).length > 0 && bytes(description).length <= 512, "bad desc");

        if (threshold == 0) {
            uint256 t = staking.totalWeighted() / 100;
            threshold = t > type(uint128).max ? type(uint128).max : uint128(t);
        }

        unchecked { id = ++taskCount; }
        Task storage t = tasks[id];
        t.projectKey = projectKey;
        t.description = description;
        t.stage = stage;
        t.votingStart = uint64(block.timestamp);
        t.votingEnd = votingEnd;
        t.threshold = threshold;
        t.optionCount = uint8(options.length);

        for (uint8 i = 0; i < options.length; ++i) {
            require(bytes(options[i].label).length > 0, "empty label");
            // store at 1-based index — see taskVotes mapping comment.
            _taskOptions[id][i + 1] = TaskOption({
                label: options[i].label,
                description: options[i].description,
                votes: 0
            });
        }

        emit TaskCreated(id, projectKey, stage, t.optionCount, votingEnd);
    }

    function voteTask(uint256 id, uint8 option) external whenNotPaused {
        Task storage t = tasks[id];
        require(t.votingEnd != 0, "no task");
        require(t.status == STATUS_ACTIVE, "not active");
        require(block.timestamp < t.votingEnd, "closed");
        require(option >= 1 && option <= t.optionCount, "bad option");
        require(taskVotes[id][msg.sender] == 0, "already voted");

        uint256 w = _eligibleWeight(msg.sender, t.votingEnd);
        require(w > 0, "no weight");
        require(w <= type(uint128).max, "weight too large");

        taskVotes[id][msg.sender] = option;
        _taskOptions[id][option].votes += uint128(w);
        t.totalVotes += uint128(w);

        emit TaskVoted(id, msg.sender, option, w);
    }

    function finalizeTask(uint256 id) external {
        Task storage t = tasks[id];
        require(t.votingEnd != 0, "no task");
        require(t.status == STATUS_ACTIVE, "already finalised");
        require(block.timestamp >= t.votingEnd, "still open");

        if (t.totalVotes < t.threshold) {
            t.status = STATUS_REJECTED;
            emit TaskFinalized(id, STATUS_REJECTED, 0);
            return;
        }

        // find leader
        uint8 leaderIdx = 0;
        uint128 leaderVotes = 0;
        for (uint8 i = 1; i <= t.optionCount; ++i) {
            uint128 v = _taskOptions[id][i].votes;
            if (v > leaderVotes) {
                leaderVotes = v;
                leaderIdx = i;
            }
        }
        // leader must clear PASS_BPS of all task votes
        if (leaderIdx == 0 || (uint256(leaderVotes) * BPS) / t.totalVotes < TASK_PASS_BPS) {
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
        return _taskOptions[id][option];
    }

    function taskOptions(uint256 id) external view returns (TaskOption[] memory out) {
        Task storage t = tasks[id];
        out = new TaskOption[](t.optionCount);
        for (uint8 i = 0; i < t.optionCount; ++i) {
            out[i] = _taskOptions[id][i + 1];
        }
    }

    /// @notice The voting weight `user` would commit if they voted right now on
    ///         a proposal that ends at `endTime`. Returns 0 if the user lacks
    ///         the lock-end commitment.
    function eligibleWeight(address user, uint64 endTime) external view returns (uint256) {
        return _eligibleWeight(user, endTime);
    }

    // ─────────────────────────── Internal ───────────────────────────

    function _checkWindow(uint64 votingEnd) internal view {
        require(votingEnd > block.timestamp, "end<=now");
        uint64 window = votingEnd - uint64(block.timestamp);
        require(window >= VOTING_WINDOW_MIN, "window too short");
        require(window <= VOTING_WINDOW_MAX, "window too long");
    }

    function _eligibleWeight(address user, uint64 endTime) internal view returns (uint256) {
        (, uint64 lockEnd, ) = staking.stakes(user);
        if (lockEnd < endTime) return 0;
        return staking.weightOf(user);
    }
}
