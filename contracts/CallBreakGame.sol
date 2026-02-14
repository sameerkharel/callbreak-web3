// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/// @title CallBreak V3 - PRODUCTION READY
/// @notice Handles matchmaking, wagering, and secure settlements for CallBreak on Base
contract CallBreak_V3 is ReentrancyGuard, Pausable, Ownable, EIP712 {
    using ECDSA for bytes32;

    // --- CONFIGURATION ---
    uint256[] public tierEntryFees = [0.00001 ether, 0.0001 ether, 0.001 ether, 0.01 ether];
    address public serverSigner;
    uint256 public challengeWindow = 5 minutes;
    uint256 public challengeBond = 0.001 ether;

    // --- ADMIN SETTINGS ---
    uint256 public constant MAX_ADMINS = 5;
    uint256 public feePercent = 10;
    address[] public admins;
    mapping(address => bool) public isAdmin;
    uint256 public adminThreshold = 1;
    uint256 public adminNonce;

    // --- EIP-712 TYPEHASHES ---
    bytes32 private constant JOIN_TYPEHASH = keccak256("Join(bytes32 serverHash,uint256 tier,address player,uint256 nonce,uint256 expiryBlock)");
    bytes32 private constant FINAL_STATE_TYPEHASH = keccak256("FinalState(bytes32 gameId,uint256 randomSeed,bytes32 transcriptHash,bytes32 scoresHash,address winner,uint256 expiryTimestamp)");
    bytes32 private constant ADMIN_RESOLVE_TYPEHASH = keccak256("AdminResolve(bytes32 gameId,address correctWinner,bytes32 reasonHash,uint256 nonce)");

    // --- STRUCTS ---
    struct JoinParams {
        bytes32 serverHash;
        bytes signature;
        uint256 nonce;
        uint256 expiryBlock;
    }

    struct FinalStateParams {
        address winner;
        int256[] scores;
        bytes32 transcriptHash;
        uint256 expiryTimestamp;
        bytes signature;
    }

    struct GameCore {
        uint256 tier;
        address[4] players;
        uint256 originalStake;
        bytes32 serverCommitHash;
        uint256 revealBlockNumber;
        uint256 creationTime;
    }

    struct GameState {
        uint256 totalStake;
        uint256 randomSeed;
        bytes32 finalStateHash;
        address signedWinner;
        uint256 challengeWindowEnds;
        uint256 gameChallengeBond;
        uint256 gameChallengeWindow;
        bool finalSubmitted;
        address challenger;
        bool isActive;
        bool isSettled;
    }

    // --- STATE ---
    uint256 public serverBond;
    uint256 public lockedBond;
    uint256 public minimumServerBond;

    mapping(bytes32 => GameCore) public gameCores;
    mapping(bytes32 => GameState) public gameStates;
    mapping(address => bytes32) public playerActiveGame;
    mapping(uint256 => address[]) public matchmakingQueues;
    mapping(address => uint256) public queuedTier;
    mapping(address => bool) public isQueued;
    mapping(bytes32 => bool) public usedSignatures;
    mapping(address => uint256) public pendingWithdrawals;
    
    // Snapshot for user deposits in Queue
    mapping(address => uint256) public playerEscrow; 

    // --- EVENTS ---
    event QueueEntered(address indexed player, uint256 tier, uint256 currentQueueLength);
    event QueueLeft(address indexed player, uint256 tier);
    event QueueJoined(address indexed player, uint256 tier);

    event GameReadyToStart(bytes32 indexed gameId, uint256 revealBlock);
    event GameStarted(bytes32 indexed gameId, uint256 indexed randomSeed);
    event GameCancelled(bytes32 indexed gameId, string reason);

    event FinalStateSubmitted(bytes32 indexed gameId, address indexed winner);
    event FinalStateChallenged(bytes32 indexed gameId, address indexed challenger);
    event DisputeResolved(bytes32 indexed gameId, address indexed winner, string reason);
    event GameFinalized(bytes32 indexed gameId, address indexed winner, uint256 prize);

    event EmergencyExit(address indexed player, uint256 amount);
    event AdminsUpdated(address[] admins, uint256 threshold);
    event TierFeesUpdated(uint256[] newFees);
    event FeeUpdated(uint256 newFeePercent);
    event ChallengeWindowUpdated(uint256 newWindow);
    event ChallengeBondUpdated(uint256 newBond);
    event MinimumServerBondUpdated(uint256 newMinimum);

    event BondLocked(bytes32 indexed gameId, uint256 amount);
    event BondUnlocked(bytes32 indexed gameId, uint256 amount);
    event PendingWithdrawalAdded(address indexed who, uint256 amount, string reason);
    event PendingWithdrawalClaimed(address indexed who, uint256 amount);
    event BondDeposited(address indexed who, uint256 amount);
    event BondWithdrawn(address indexed who, uint256 amount);
    event BondSlashed(address indexed who, uint256 amount, bytes32 indexed gameId);

    // --- CUSTOM ERRORS ---
    error InvalidTier();
    error IncorrectETH();
    error ActiveGameExists();
    error AlreadyQueued();
    error QueueFull();
    error NotQueued();
    error QueueMismatch();
    error InvalidSigner();
    error SignatureExpired();
    error SignatureReused();
    error InvalidServerSignature();
    error ServerBondLow();
    error QueueNotReady();
    error BondLimitExceeded();
    error GameInactive();
    error GameAlreadyStarted();
    error RevealTooEarly();
    error CommitMismatch();
    error InvalidGameState();
    error FinalStateAlreadySubmitted();
    error FinalStateNotSubmitted();
    error GameAlreadyChallenged();
    error ChallengeWindowClosed();
    error InsufficientChallengeBond();
    error NotAPlayer();
    error ChallengeWindowNotEnded();
    error GameAlreadySettled();
    error GameNotChallenged();
    error NotEnoughSignatures();
    error InvalidNonce();
    error SignerNotAdmin();
    error SignaturesNotSorted();
    error BondFundsLocked();
    error ZeroBalance();
    error TransferFailed();
    error GameNotFound();
    error GameNotActive();
    error EmergencyWithdrawTooEarly();
    error InvalidScoresLength();
    error WinnerNotAPlayer();
    error TooManyAdmins();
    error InvalidThreshold();
    error InvalidAdminAddress();
    error DuplicateAdminAddress();
    error FeeTooHigh();
    error InvalidOwner();

    constructor(address _serverSigner)
        Ownable(msg.sender)
        EIP712("CallBreak_V3", "1")
    {
        if (msg.sender == address(0)) revert InvalidOwner();

        serverSigner = _serverSigner;
        admins.push(msg.sender);
        isAdmin[msg.sender] = true;
        adminThreshold = 1;
    }

    // --- ADMIN ---
    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function setServerSigner(address _signer) external onlyOwner {
        if (_signer == address(0)) revert InvalidSigner();
        serverSigner = _signer;
    }

    function setAdmins(address[] calldata _admins, uint256 _threshold) external onlyOwner {
        if (_admins.length > MAX_ADMINS) revert TooManyAdmins();
        if (_admins.length < _threshold || _threshold == 0) revert InvalidThreshold();

        uint256 oldAdminLength = admins.length;
        for(uint i=0; i<oldAdminLength; i++) {
            isAdmin[admins[i]] = false;
        }
        admins = _admins;

        for(uint i=0; i<_admins.length; i++) {
            if (_admins[i] == address(0)) revert InvalidAdminAddress();
            if (isAdmin[_admins[i]]) revert DuplicateAdminAddress();
            isAdmin[_admins[i]] = true;
        }

        adminThreshold = _threshold;
        emit AdminsUpdated(_admins, _threshold);
    }

    function setTierEntryFees(uint256[] calldata _newFees) external onlyOwner {
        require(_newFees.length > 0, "Fees cannot be empty");
        tierEntryFees = _newFees;
        emit TierFeesUpdated(_newFees);
    }

    function setFeePercent(uint256 _newFee) external onlyOwner {
        if (_newFee > 30) revert FeeTooHigh();
        feePercent = _newFee;
        emit FeeUpdated(_newFee);
    }

    function setChallengeWindow(uint256 _newWindow) external onlyOwner {
        challengeWindow = _newWindow;
        emit ChallengeWindowUpdated(_newWindow);
    }

    function setChallengeBond(uint256 _newBond) external onlyOwner {
        challengeBond = _newBond;
        emit ChallengeBondUpdated(_newBond);
    }

    function setMinimumServerBond(uint256 _amount) external onlyOwner {
        minimumServerBond = _amount;
        emit MinimumServerBondUpdated(_amount);
    }

    // --- HELPERS ---
    function _isPlayerBusy(address player) internal view returns (bool) {
        bytes32 gameId = playerActiveGame[player];
        if (gameId == bytes32(0)) return false;
        GameState storage state = gameStates[gameId];
        if (state.finalSubmitted || state.isSettled) return false;
        return true;
    }

    // --- VIEW HELPERS ---
    function getQueueMembers(uint256 tier) external view returns (address[] memory) {
        return matchmakingQueues[tier];
    }

    function getQueueLength(uint256 tier) external view returns (uint256) {
        return matchmakingQueues[tier].length;
    }

    function canJoinQueue(address player, uint256 tier) external view returns (bool canJoin, string memory reason) {
        if (tier >= tierEntryFees.length) return (false, "Invalid tier");
        if (_isPlayerBusy(player)) return (false, "Active game exists");
        if (isQueued[player]) return (false, "Already queued");
        if (matchmakingQueues[tier].length >= 3) return (false, "Queue full");
        return (true, "");
    }

    function getPlayerStatus(address player) external view returns (bytes32 currentGameId, bool isBusy, bool isQueued_, uint256 queuedTier_) {
        return (playerActiveGame[player], _isPlayerBusy(player), isQueued[player], queuedTier[player]);
    }

    function getGameInfo(bytes32 gameId) external view returns (
        uint256 tier,
        address[4] memory players,
        uint256 creationTime,
        uint256 emergencyUnlocksAt,
        uint256 randomSeed,
        bool isActive,
        bool isSettled
    ) {
        GameCore storage core = gameCores[gameId];
        GameState storage state = gameStates[gameId];

        uint256 unlockTime;
        if (state.randomSeed == 0) {
            unlockTime = core.creationTime + 5 minutes;
        } else {
            unlockTime = core.creationTime + 1 hours;
        }

        return (
            core.tier,
            core.players,
            core.creationTime,
            unlockTime,
            state.randomSeed,
            state.isActive,
            state.isSettled
        );
    }

    // --- QUEUE LOGIC ---
    function enterQueue(uint256 tier) external payable nonReentrant whenNotPaused {
        if (tier >= tierEntryFees.length) revert InvalidTier();
        if (msg.value != tierEntryFees[tier]) revert IncorrectETH();
        if (_isPlayerBusy(msg.sender)) revert ActiveGameExists();
        if (isQueued[msg.sender]) revert AlreadyQueued();
        if (matchmakingQueues[tier].length >= 3) revert QueueFull();

        // Snapshot the deposit
        playerEscrow[msg.sender] = msg.value;

        matchmakingQueues[tier].push(msg.sender);
        isQueued[msg.sender] = true;
        queuedTier[msg.sender] = tier;

        emit QueueJoined(msg.sender, tier);
        emit QueueEntered(msg.sender, tier, matchmakingQueues[tier].length);
    }

    function leaveQueue() external nonReentrant {
        if (!isQueued[msg.sender]) revert NotQueued();
        uint256 tier = queuedTier[msg.sender];
        address[] storage queue = matchmakingQueues[tier];

        bool found = false;
        uint256 queueLength = queue.length;
        for(uint i=0; i<queueLength; i++) {
            if(queue[i] == msg.sender) {
                queue[i] = queue[queueLength - 1];
                queue.pop();
                found = true;
                break;
            }
        }
        if (!found) revert QueueMismatch();

        isQueued[msg.sender] = false;
        delete queuedTier[msg.sender];

        // Refund EXACT amount from snapshot
        uint256 refund = playerEscrow[msg.sender];
        playerEscrow[msg.sender] = 0;

        _safeTransferWithFallback(payable(msg.sender), refund, "QueueRefund");
        emit QueueLeft(msg.sender, tier);
    }

    // --- START GAME ---
    function joinAndStartGame(uint256 tier, JoinParams calldata params) external payable nonReentrant whenNotPaused {
        if (tier >= tierEntryFees.length) revert InvalidTier();
        if (msg.value != tierEntryFees[tier]) revert IncorrectETH();
        if (_isPlayerBusy(msg.sender)) revert ActiveGameExists();
        if (isQueued[msg.sender]) revert AlreadyQueued();

        if (serverBond < minimumServerBond) revert ServerBondLow();
        if (matchmakingQueues[tier].length != 3) revert QueueNotReady();
        if (block.number > params.expiryBlock) revert SignatureExpired();

        bytes32 structHash = keccak256(abi.encode(
            JOIN_TYPEHASH,
            params.serverHash,
            tier,
            msg.sender,
            params.nonce,
            params.expiryBlock
        ));

        bytes32 digest = _hashTypedDataV4(structHash);
        if (usedSignatures[digest]) revert SignatureReused();

        address signer = ECDSA.recover(digest, params.signature);
        if (signer != serverSigner) revert InvalidServerSignature();
        usedSignatures[digest] = true;

        // Capture sender's deposit for logic consistency
        playerEscrow[msg.sender] = msg.value;

        _createGameInternal(tier, params.serverHash, params.nonce);
    }

    function _createGameInternal(uint256 tier, bytes32 serverHash, uint256 nonce) internal {
        address[] storage queue = matchmakingQueues[tier];

        if (queue.length != 3) revert QueueMismatch();

        queue.push(msg.sender);
        
        // Clear escrow for players entering game
        playerEscrow[queue[0]] = 0;
        playerEscrow[queue[1]] = 0;
        playerEscrow[queue[2]] = 0;
        playerEscrow[queue[3]] = 0;

        bytes32 gameId = keccak256(abi.encode(block.timestamp, queue[0], queue[1], queue[2], queue[3], nonce));
        uint256 pot = tierEntryFees[tier] * 4;

        if (serverBond - lockedBond < pot) revert BondLimitExceeded();
        lockedBond += pot;
        emit BondLocked(gameId, pot);

        gameCores[gameId] = GameCore({
            tier: tier,
            players: [queue[0], queue[1], queue[2], queue[3]],
            originalStake: pot,
            serverCommitHash: serverHash,
            revealBlockNumber: block.number + 3,
            creationTime: block.timestamp
        });

        gameStates[gameId] = GameState({
            totalStake: pot,
            randomSeed: 0,
            finalStateHash: bytes32(0),
            signedWinner: address(0),
            challengeWindowEnds: 0,
            gameChallengeBond: challengeBond,
            gameChallengeWindow: challengeWindow,
            finalSubmitted: false,
            challenger: address(0),
            isActive: true,
            isSettled: false
        });

        address[4] memory gamePlayers = [queue[0], queue[1], queue[2], queue[3]];
        
        // Explicit reset instead of delete
        matchmakingQueues[tier] = new address[](0);

        for(uint i=0; i<4; i++) {
            playerActiveGame[gamePlayers[i]] = gameId;
            isQueued[gamePlayers[i]] = false;
            delete queuedTier[gamePlayers[i]];
        }

        emit GameReadyToStart(gameId, block.number + 3);
    }

    // --- REVEAL AND START ---
    function revealAndStart(bytes32 gameId, bytes32 secretKey) external nonReentrant whenNotPaused {
        GameCore storage core = gameCores[gameId];
        GameState storage state = gameStates[gameId];

        if (!state.isActive) revert GameInactive();
        if (state.randomSeed != 0) revert GameAlreadyStarted();
        if (block.number <= core.revealBlockNumber) revert RevealTooEarly();

        bytes32 bh = blockhash(core.revealBlockNumber);
        if (bh == bytes32(0)) {
            uint256 penalty = core.originalStake / 2;
            if (penalty > 0) {
                uint256 sharePerPlayer = penalty / 4;
                for(uint i = 0; i < 4; i++) {
                    _slashServerBond(gameId, payable(core.players[i]), sharePerPlayer);
                }
            }
            _refundAllPlayers(gameId, "BlockhashExpired");
            return;
        }

        if (keccak256(abi.encodePacked(secretKey)) != core.serverCommitHash) revert CommitMismatch();

        state.randomSeed = uint256(keccak256(abi.encode(
            secretKey,
            bh,
            block.timestamp,
            gameId,
            core.players
        )));

        emit GameStarted(gameId, state.randomSeed);
    }

    // --- SUBMIT FINAL STATE ---
    function submitFinalState(bytes32 gameId, FinalStateParams calldata params) external nonReentrant whenNotPaused {
        GameState storage state = gameStates[gameId];

        if (!state.isActive || state.isSettled) revert InvalidGameState();
        if (state.finalSubmitted) revert FinalStateAlreadySubmitted();
        if (block.timestamp > params.expiryTimestamp) revert SignatureExpired();
        if (params.scores.length != 4) revert InvalidScoresLength();

        bytes32 scoresHash = keccak256(abi.encodePacked(params.scores));

        bytes32 structHash = keccak256(abi.encode(
            FINAL_STATE_TYPEHASH,
            gameId,
            state.randomSeed,
            params.transcriptHash,
            scoresHash,
            params.winner,
            params.expiryTimestamp
        ));

        bytes32 digest = _hashTypedDataV4(structHash);
        if (usedSignatures[digest]) revert SignatureReused();
        if (ECDSA.recover(digest, params.signature) != serverSigner) revert InvalidServerSignature();
        usedSignatures[digest] = true;

        state.finalSubmitted = true;
        state.signedWinner = params.winner;
        state.challengeWindowEnds = block.timestamp + state.gameChallengeWindow;
        emit FinalStateSubmitted(gameId, params.winner);
    }

    // --- CHALLENGE & FINALIZE ---
    function challengeFinalState(bytes32 gameId) external payable nonReentrant whenNotPaused {
        GameState storage state = gameStates[gameId];
        GameCore storage core = gameCores[gameId];

        if (!state.finalSubmitted) revert FinalStateNotSubmitted();
        if (state.challenger != address(0)) revert GameAlreadyChallenged();
        if (block.timestamp > state.challengeWindowEnds) revert ChallengeWindowClosed();
        if (msg.value < state.gameChallengeBond) revert InsufficientChallengeBond();

        bool isPlayer = false;
        for(uint i=0; i<4; i++) {
            if(core.players[i] == msg.sender) {
                isPlayer = true;
                break;
            }
        }
        if (!isPlayer) revert NotAPlayer();

        state.challenger = msg.sender;
        emit FinalStateChallenged(gameId, msg.sender);
    }

    function finalizeGame(bytes32 gameId) external nonReentrant whenNotPaused {
        GameState storage state = gameStates[gameId];

        if (!state.finalSubmitted) revert FinalStateNotSubmitted();
        if (block.timestamp <= state.challengeWindowEnds) revert ChallengeWindowNotEnded();
        if (state.isSettled) revert GameAlreadySettled();
        if (state.challenger != address(0)) revert GameNotChallenged();

        _settleGame(gameId, state.signedWinner);
    }

    // --- ADMIN RESOLUTION ---
    function adminResolveMultiSig(
        bytes32 gameId,
        address correctWinner,
        string calldata reason,
        uint256 nonce,
        bytes[] calldata signatures
    ) external nonReentrant whenNotPaused {
        _verifyAdminSigs(gameId, correctWinner, reason, nonce, signatures);
        adminNonce = nonce;

        GameCore storage core = gameCores[gameId];
        GameState storage state = gameStates[gameId];

        if (state.challenger == address(0)) revert GameNotChallenged();
        if (!state.finalSubmitted) revert FinalStateNotSubmitted();

        bool validWinner = false;
        for(uint i=0; i<4; i++) {
            if(core.players[i] == correctWinner) {
                validWinner = true;
                break;
            }
        }
        if (!validWinner) revert WinnerNotAPlayer();

        bool challengerWasCorrect = (correctWinner != state.signedWinner);
        bool serverLied = (keccak256(bytes(reason)) == keccak256(bytes("SERVER_LIED")));

        if (serverLied) {
            uint256 pot = core.originalStake;
            address beneficiary = state.challenger;
            _slashServerBond(gameId, payable(beneficiary), pot);
            
            // Refund challenger their bond too
            _safeTransferWithFallback(payable(state.challenger), state.gameChallengeBond, "ChallengerRefund");
        } else if (challengerWasCorrect) {
            _safeTransferWithFallback(payable(state.challenger), state.gameChallengeBond, "ChallengerRefund");
        } else {
            _safeTransferWithFallback(payable(owner()), state.gameChallengeBond, "BondSeizure");
        }

        _settleGame(gameId, correctWinner);
        emit DisputeResolved(gameId, correctWinner, reason);
    }

    function _verifyAdminSigs(
        bytes32 gameId,
        address correctWinner,
        string calldata reason,
        uint256 nonce,
        bytes[] calldata signatures
    ) internal view {
        if (signatures.length < adminThreshold) revert NotEnoughSignatures();
        if (nonce != adminNonce + 1) revert InvalidNonce();

        bytes32 structHash = keccak256(abi.encode(
            ADMIN_RESOLVE_TYPEHASH,
            gameId,
            correctWinner,
            keccak256(bytes(reason)),
            nonce
        ));
        bytes32 digest = _hashTypedDataV4(structHash);

        address lastSigner = address(0);
        uint256 sigLength = signatures.length;
        for (uint i = 0; i < sigLength; i++) {
            address signer = ECDSA.recover(digest, signatures[i]);
            if (!isAdmin[signer]) revert SignerNotAdmin();
            if (uint160(signer) <= uint160(lastSigner)) revert SignaturesNotSorted();
            lastSigner = signer;
        }
    }

    // --- HELPERS ---
    function _settleGame(bytes32 gameId, address winner) internal {
        GameState storage state = gameStates[gameId];
        GameCore storage core = gameCores[gameId];

        state.isSettled = true;
        state.isActive = false;

        require(lockedBond >= core.originalStake, "Bond accounting error");
        lockedBond -= core.originalStake;
        emit BondUnlocked(gameId, core.originalStake);

        for(uint i=0; i<4; i++) {
            address player = core.players[i];
            if(player != address(0)) {
                if (playerActiveGame[player] == gameId) {
                    playerActiveGame[player] = bytes32(0);
                }
            }
        }

        uint256 pot = state.totalStake;
        uint256 fee = (pot * feePercent) / 100;
        uint256 prize = pot - fee;

        _safeTransferWithFallback(payable(winner), prize, "Prize");
        _safeTransferWithFallback(payable(owner()), fee, "Fee");
        emit GameFinalized(gameId, winner, prize);
    }

    function _safeTransferWithFallback(address payable to, uint256 amount, string memory reason) internal {
        if (amount == 0) return;
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) {
            pendingWithdrawals[to] += amount;
            emit PendingWithdrawalAdded(to, amount, reason);
        }
    }

    function withdrawPending() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert ZeroBalance();
        pendingWithdrawals[msg.sender] = 0;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit PendingWithdrawalClaimed(msg.sender, amount);
    }

    // --- BONDS & FUNDS ---
    function depositServerBond() external payable {
        serverBond += msg.value;
        emit BondDeposited(msg.sender, msg.value);
    }

    function withdrawServerBond(uint256 amount) external nonReentrant {
        if (msg.sender != serverSigner) revert InvalidSigner();
        if (amount > serverBond - lockedBond) revert BondFundsLocked();
        serverBond -= amount;
        _safeTransferWithFallback(payable(msg.sender), amount, "BondWithdraw");
        emit BondWithdrawn(msg.sender, amount);
    }

    function _slashServerBond(bytes32 gameId, address payable beneficiary, uint256 amount) internal {
        uint256 toSlash = amount <= serverBond ? amount : serverBond;
        if (toSlash == 0) return;
        serverBond -= toSlash;
        _safeTransferWithFallback(beneficiary, toSlash, "Slash");
        emit BondSlashed(beneficiary, toSlash, gameId);
    }

    // --- EMERGENCY ---
    function emergencyWithdraw(bytes32 gameId) external nonReentrant whenNotPaused {
        GameCore storage core = gameCores[gameId];
        GameState storage state = gameStates[gameId];

        if (core.players[0] == address(0)) revert GameNotFound();
        if (!state.isActive) revert GameNotActive();
        if (state.isSettled) revert GameAlreadySettled();

        bool isPlayer = false;
        for(uint i=0; i<4; i++) {
            if(core.players[i] == msg.sender) {
                isPlayer = true;
                break;
            }
        }
        if (!isPlayer) revert NotAPlayer();

        if (state.randomSeed == 0) {
            if (block.timestamp <= core.creationTime + 5 minutes) revert EmergencyWithdrawTooEarly();
        } else {
            if (block.timestamp <= core.creationTime + 1 hours) revert EmergencyWithdrawTooEarly();
        }

        state.isActive = false;
        state.isSettled = true;

        require(lockedBond >= core.originalStake, "Bond accounting error");
        lockedBond -= core.originalStake;
        emit BondUnlocked(gameId, core.originalStake);

        for(uint i=0; i<4; i++) {
            address player = core.players[i];
            if(player != address(0)) {
                if (playerActiveGame[player] == gameId) {
                    playerActiveGame[player] = bytes32(0);
                }
                // Use originalStake
                _safeTransferWithFallback(payable(player), core.originalStake / 4, "EmergencyRefund");
            }
        }

        emit GameCancelled(gameId, "EmergencyWithdraw");
        emit EmergencyExit(msg.sender, core.originalStake / 4);
    }

    function _refundAllPlayers(bytes32 gameId, string memory reason) internal {
        GameCore storage core = gameCores[gameId];
        GameState storage state = gameStates[gameId];

        state.isActive = false;
        state.isSettled = true;

        require(lockedBond >= core.originalStake, "Bond accounting error");
        lockedBond -= core.originalStake;
        emit BondUnlocked(gameId, core.originalStake);

        for(uint i=0; i<4; i++) {
            address player = core.players[i];
            if(player != address(0)) {
                if (playerActiveGame[player] == gameId) {
                    playerActiveGame[player] = bytes32(0);
                }
                //Use originalStake
                _safeTransferWithFallback(payable(player), core.originalStake / 4, reason);
            }
        }

        emit GameCancelled(gameId, reason);
    }

    receive() external payable {}
}