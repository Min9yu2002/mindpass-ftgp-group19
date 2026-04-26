// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title MindPassEscrow
/// @author M1n9yu
/// @notice Session escrow for MindPass bookings.
contract MindPassEscrow is Ownable, Pausable, ReentrancyGuard {
    uint256 public constant SESSION_FEE = 0.005 ether;
    uint256 public constant NORMAL_PROTOCOL_FEE = 0.00025 ether;
    uint256 public constant NORMAL_THERAPIST_PAYOUT = 0.00475 ether;
    uint256 public constant PATIENT_NO_SHOW_PENALTY = 0.001 ether;
    uint256 public constant PATIENT_NO_SHOW_REFUND = 0.004 ether;
    uint256 public constant THERAPIST_NO_SHOW_REFUND = 0.005 ether;

    uint256 public constant PAYMENT_WINDOW = 3 minutes;
    uint256 public constant NO_SHOW_WINDOW = 5 minutes;

    enum SessionStatus {
        None,
        Requested,
        AcceptedAwaitingPayment,
        Funded,
        InSession,
        Completed,
        Rejected,
        CancelledUnstarted,
        PaymentTimeout,
        PatientNoShow,
        TherapistNoShow
    }

    struct Session {
        uint256 id;
        address patient;
        address therapist;
        SessionStatus status;
        uint256 feeWei;
        uint256 walletRequiredWei;
        uint256 subsidyRequiredWei;
        uint256 walletFundedWei;
        uint256 subsidyFundedWei;
        uint256 providerAcceptedAt;
        uint256 paymentDueAt;
        uint256 fundedAt;
        uint256 patientJoinedAt;
        uint256 therapistJoinedAt;
        uint256 sessionStartedAt;
        uint256 completedAt;
        uint256 cancelledAt;// no need now but still keep the pervious ABI place
        uint256 noShowDeadlineAt;
        uint256 paymentTimeoutAt;
        uint256 penaltyFeeWei;
        uint256 refundAmountWei;
        uint256 protocolFeeWei;
        uint256 therapistPayoutWei;
        bytes32 sessionMode;
    }

    error ZeroAddress();
    error InvalidTherapist();
    error InvalidFundingSplit();
    error SessionNotFound(uint256 sessionId);
    error SessionAlreadyExists(address patient, uint256 activeSessionId);
    error UnauthorizedCaller(uint256 sessionId, address caller);
    error OnlyVault(address caller);
    error InvalidStatus(uint256 sessionId, SessionStatus expected, SessionStatus actual);
    error InvalidFundingAmount(uint256 expected, uint256 actual);
    error NothingToFund(uint256 sessionId);
    error PortionAlreadyFunded(uint256 sessionId);
    error PaymentWindowExpired(uint256 sessionId, uint256 paymentDueAt);
    error PaymentWindowStillOpen(uint256 sessionId, uint256 paymentDueAt);
    error NoShowWindowStillOpen(uint256 sessionId, uint256 noShowDeadlineAt);
    error NoShowDeadlineNotSet(uint256 sessionId);
    error CheckInWindowClosed(uint256 sessionId, uint256 noShowDeadlineAt);
    error AlreadyCheckedIn(uint256 sessionId, address participant);
    error SessionAlreadyStarted(uint256 sessionId);
    error SessionNotStarted(uint256 sessionId);
    error BothParticipantsAlreadyCheckedIn(uint256 sessionId);
    error SessionEndAlreadyRequested(uint256 sessionId, address requester);
    error SessionEndNotRequested(uint256 sessionId);
    error SessionEndRequesterCannotConfirm(uint256 sessionId, address requester);
    error SessionNotFullyFunded(uint256 sessionId, uint256 fundedWei, uint256 requiredWei);
    error NoClaimableBalance(address account);
    error TransferFailed(address recipient, uint256 amount);
    error InvalidDistribution(uint256 expectedTotal, uint256 actualTotal);
    error DirectPaymentsDisabled();

    event BookingRequested(
        uint256 indexed sessionId,
        address indexed patient,
        address indexed therapist,
        uint256 walletRequiredWei,
        uint256 subsidyRequiredWei,
        bytes32 sessionMode
    );
    event BookingAccepted(
        uint256 indexed sessionId,
        address indexed therapist,
        uint256 providerAcceptedAt,
        uint256 paymentDueAt,
        uint256 noShowDeadlineAt
    );
    event BookingRejected(uint256 indexed sessionId, address indexed therapist);
    event PatientPortionFunded(uint256 indexed sessionId, address indexed patient, uint256 amountWei);
    event SubsidyPortionFunded(uint256 indexed sessionId, address indexed vault, uint256 amountWei);
    event SessionFunded(
        uint256 indexed sessionId,
        uint256 walletFundedWei,
        uint256 subsidyFundedWei,
        uint256 fundedAt,
        uint256 noShowDeadlineAt
    );
    event PaymentTimedOut(
        uint256 indexed sessionId,
        uint256 paymentTimeoutAt,
        uint256 patientRefundWei,
        uint256 vaultRefundWei
    );
    event PatientCheckedIn(uint256 indexed sessionId, address indexed patient, uint256 checkedInAt);
    event TherapistCheckedIn(uint256 indexed sessionId, address indexed therapist, uint256 checkedInAt);
    event SessionStarted(uint256 indexed sessionId, uint256 sessionStartedAt);
    event SessionEndRequested(uint256 indexed sessionId, address indexed requestedBy, uint256 requestedAt);
    event PatientNoShowResolved(
        uint256 indexed sessionId,
        uint256 therapistPayoutWei,
        uint256 patientRefundWei,
        uint256 vaultRefundWei,
        uint256 penaltyFeeWei
    );
    event TherapistNoShowResolved(
        uint256 indexed sessionId,
        uint256 patientRefundWei,
        uint256 vaultRefundWei
    );
    event SessionCompleted(
        uint256 indexed sessionId,
        uint256 therapistPayoutWei,
        uint256 protocolFeeWei,
        uint256 completedAt
    );
    event Withdrawal(address indexed account, uint256 amount);
    event VaultUpdated(address indexed previousVault, address indexed newVault);
    event ProtocolTreasuryUpdated(address indexed previousProtocolTreasury, address indexed newProtocolTreasury);

    mapping(uint256 => Session) public sessions;
    mapping(address => uint256) public activeSessionOfPatient;
    mapping(address => uint256) public claimableBalance;
    mapping(uint256 => address) public sessionEndRequestedBy;

    uint256 public nextSessionId;
    address public vault;
    address public protocolTreasury;

    constructor(address initialVault, address initialProtocolTreasury) Ownable(msg.sender) {
        if (initialVault == address(0) || initialProtocolTreasury == address(0)) {
            revert ZeroAddress();
        }

        vault = initialVault;
        protocolTreasury = initialProtocolTreasury;
    }

    receive() external payable {
        revert DirectPaymentsDisabled();
    }

    /// @notice Creates a booking request with the patient and vault split.
    function createBookingRequest(
        address therapist,
        uint256 walletRequiredWei,
        uint256 subsidyRequiredWei,
        bytes32 sessionMode
    ) external whenNotPaused returns (uint256 sessionId) {
        if (therapist == address(0)) {
            revert ZeroAddress();
        }
        if (therapist == msg.sender) {
            revert InvalidTherapist();
        }
        if (walletRequiredWei + subsidyRequiredWei != SESSION_FEE) {
            revert InvalidFundingSplit();
        }

        uint256 activeSessionId = activeSessionOfPatient[msg.sender];
        if (activeSessionId != 0) {
            revert SessionAlreadyExists(msg.sender, activeSessionId);
        }

        sessionId = ++nextSessionId;
        Session storage session = sessions[sessionId];
        session.id = sessionId;
        session.patient = msg.sender;
        session.therapist = therapist;
        session.status = SessionStatus.Requested;
        session.feeWei = SESSION_FEE;
        session.walletRequiredWei = walletRequiredWei;
        session.subsidyRequiredWei = subsidyRequiredWei;
        session.sessionMode = sessionMode;

        activeSessionOfPatient[msg.sender] = sessionId;

        emit BookingRequested(
            sessionId,
            msg.sender,
            therapist,
            walletRequiredWei,
            subsidyRequiredWei,
            sessionMode
        );
    }

    /// @notice Starts the payment window after the therapist accepts.
    function acceptBooking(uint256 sessionId) external whenNotPaused {
        Session storage session = _getSession(sessionId);
        _requireTherapist(session, msg.sender);
        _requireStatus(session, SessionStatus.Requested);

        uint256 acceptedAt = block.timestamp;
        session.status = SessionStatus.AcceptedAwaitingPayment;
        session.providerAcceptedAt = acceptedAt;
        session.paymentDueAt = acceptedAt + PAYMENT_WINDOW;
        session.noShowDeadlineAt = 0;

        emit BookingAccepted(
            sessionId,
            msg.sender,
            session.providerAcceptedAt,
            session.paymentDueAt,
            session.noShowDeadlineAt
        );
    }

    /// @notice Rejects a requested booking.
    function rejectBooking(uint256 sessionId) external whenNotPaused {
        Session storage session = _getSession(sessionId);
        _requireTherapist(session, msg.sender);
        _requireStatus(session, SessionStatus.Requested);

        session.status = SessionStatus.Rejected;
        _clearActiveSession(session.patient, sessionId);

        emit BookingRejected(sessionId, msg.sender);
    }

    /// @notice Funds the patient wallet portion.
    function fundPatientPortion(uint256 sessionId) external payable whenNotPaused {
        Session storage session = _getSession(sessionId);
        _requirePatient(session, msg.sender);
        _requireStatus(session, SessionStatus.AcceptedAwaitingPayment);
        _requireBeforePaymentDue(sessionId, session);

        uint256 requiredAmount = session.walletRequiredWei;
        if (requiredAmount == 0) {
            revert NothingToFund(sessionId);
        }
        if (session.walletFundedWei != 0) {
            revert PortionAlreadyFunded(sessionId);
        }
        if (msg.value != requiredAmount) {
            revert InvalidFundingAmount(requiredAmount, msg.value);
        }

        session.walletFundedWei = msg.value;
        emit PatientPortionFunded(sessionId, msg.sender, msg.value);

        _maybeMarkFunded(sessionId, session);
    }

    /// @notice Funds the subsidy portion from the vault.
    function fundSubsidyPortion(uint256 sessionId) external payable whenNotPaused {
        Session storage session = _getSession(sessionId);
        if (msg.sender != vault) {
            revert OnlyVault(msg.sender);
        }
        _requireStatus(session, SessionStatus.AcceptedAwaitingPayment);
        _requireBeforePaymentDue(sessionId, session);

        uint256 requiredAmount = session.subsidyRequiredWei;
        if (requiredAmount == 0) {
            revert NothingToFund(sessionId);
        }
        if (session.subsidyFundedWei != 0) {
            revert PortionAlreadyFunded(sessionId);
        }
        if (msg.value != requiredAmount) {
            revert InvalidFundingAmount(requiredAmount, msg.value);
        }

        session.subsidyFundedWei = msg.value;
        emit SubsidyPortionFunded(sessionId, msg.sender, msg.value);

        _maybeMarkFunded(sessionId, session);
    }

    /// @notice Resolves a booking that missed its payment deadline.
    function resolvePaymentTimeout(uint256 sessionId) external whenNotPaused {
        Session storage session = _getSession(sessionId);
        _requireStatus(session, SessionStatus.AcceptedAwaitingPayment);
        if (block.timestamp <= session.paymentDueAt) {
            revert PaymentWindowStillOpen(sessionId, session.paymentDueAt);
        }

        uint256 patientRefundWei = session.walletFundedWei;
        uint256 vaultRefundWei = session.subsidyFundedWei;
        uint256 totalRefundWei = patientRefundWei + vaultRefundWei;

        session.status = SessionStatus.PaymentTimeout;
        session.paymentTimeoutAt = block.timestamp;
        session.refundAmountWei = totalRefundWei;
        session.protocolFeeWei = 0;
        session.therapistPayoutWei = 0;
        session.penaltyFeeWei = 0;
        session.noShowDeadlineAt = 0;

        if (patientRefundWei > 0) {
            claimableBalance[session.patient] += patientRefundWei;
        }
        if (vaultRefundWei > 0) {
            claimableBalance[vault] += vaultRefundWei;
        }
        _clearActiveSession(session.patient, sessionId);

        emit PaymentTimedOut(sessionId, session.paymentTimeoutAt, patientRefundWei, vaultRefundWei);
    }

    /// @notice Checks the patient into a funded live session.
    function checkInAsPatient(uint256 sessionId) external whenNotPaused {
        Session storage session = _getSession(sessionId);
        _requirePatient(session, msg.sender);
        _checkInPatient(sessionId, session);
    }

    /// @notice Checks the therapist into a funded live session.
    function checkInAsTherapist(uint256 sessionId) external whenNotPaused {
        Session storage session = _getSession(sessionId);
        _requireTherapist(session, msg.sender);
        _checkInTherapist(sessionId, session);
    }

    /// @notice Resolves a funded session after the no-show deadline.
    function resolveNoShow(uint256 sessionId) external whenNotPaused {
        Session storage session = _getSession(sessionId);
        _requireStatus(session, SessionStatus.Funded);
        _requireNoShowDeadline(sessionId, session);
        _requireFullyFunded(sessionId, session);

        if (block.timestamp <= session.noShowDeadlineAt) {
            revert NoShowWindowStillOpen(sessionId, session.noShowDeadlineAt);
        }
        if (session.sessionStartedAt != 0) {
            revert SessionAlreadyStarted(sessionId);
        }

        bool patientJoined = session.patientJoinedAt != 0;
        bool therapistJoined = session.therapistJoinedAt != 0;

        if (patientJoined && therapistJoined) {
            revert BothParticipantsAlreadyCheckedIn(sessionId);
        }

        if (therapistJoined && !patientJoined) {
            _applyPatientNoShowSettlement(sessionId, session);
            return;
        }

        _applyTherapistNoShowSettlement(sessionId, session);
    }

    /// @notice Records the first request to end a live session.
    function requestSessionEnd(uint256 sessionId) external whenNotPaused {
        Session storage session = _getSession(sessionId);
        if (msg.sender != session.patient && msg.sender != session.therapist) {
            revert UnauthorizedCaller(sessionId, msg.sender);
        }
        _requireStatus(session, SessionStatus.InSession);
        _requireFullyFunded(sessionId, session);
        if (session.sessionStartedAt == 0) {
            revert SessionNotStarted(sessionId);
        }
        if (sessionEndRequestedBy[sessionId] != address(0)) {
            revert SessionEndAlreadyRequested(sessionId, sessionEndRequestedBy[sessionId]);
        }

        sessionEndRequestedBy[sessionId] = msg.sender;

        emit SessionEndRequested(sessionId, msg.sender, block.timestamp);
    }

    /// @notice Confirms a pending end request and completes the session.
    function confirmSessionEnd(uint256 sessionId) external whenNotPaused {
        Session storage session = _getSession(sessionId);
        if (msg.sender != session.patient && msg.sender != session.therapist) {
            revert UnauthorizedCaller(sessionId, msg.sender);
        }
        _requireStatus(session, SessionStatus.InSession);
        _requireFullyFunded(sessionId, session);
        if (session.sessionStartedAt == 0) {
            revert SessionNotStarted(sessionId);
        }

        address requester = sessionEndRequestedBy[sessionId];
        if (requester == address(0)) {
            revert SessionEndNotRequested(sessionId);
        }
        if (requester == msg.sender) {
            revert SessionEndRequesterCannotConfirm(sessionId, requester);
        }

        _completeSession(sessionId, session);
    }

    /// @notice Withdraws the caller's claimable balance.
    function withdraw() external nonReentrant {
        uint256 amount = claimableBalance[msg.sender];
        if (amount == 0) {
            revert NoClaimableBalance(msg.sender);
        }

        claimableBalance[msg.sender] = 0;

        (bool sent, ) = payable(msg.sender).call{value: amount}("");
        if (!sent) {
            revert TransferFailed(msg.sender, amount);
        }

        emit Withdrawal(msg.sender, amount);
    }

    /// @notice Updates the vault address.
    function setVault(address newVault) external onlyOwner {
        if (newVault == address(0)) {
            revert ZeroAddress();
        }

        address previousVault = vault;
        vault = newVault;
        emit VaultUpdated(previousVault, newVault);
    }

    /// @notice Updates the protocol treasury.
    function setProtocolTreasury(address newProtocolTreasury) external onlyOwner {
        if (newProtocolTreasury == address(0)) {
            revert ZeroAddress();
        }

        address previousProtocolTreasury = protocolTreasury;
        protocolTreasury = newProtocolTreasury;
        emit ProtocolTreasuryUpdated(previousProtocolTreasury, newProtocolTreasury);
    }

    /// @notice Pauses session lifecycle actions.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpauses session lifecycle actions.
    function unpause() external onlyOwner {
        _unpause();
    }

    function _checkInPatient(uint256 sessionId, Session storage session) internal {
        if (session.status != SessionStatus.Funded && session.status != SessionStatus.InSession) {
            revert InvalidStatus(sessionId, SessionStatus.Funded, session.status);
        }
        _requireNoShowDeadline(sessionId, session);
        if (block.timestamp > session.noShowDeadlineAt) {
            revert CheckInWindowClosed(sessionId, session.noShowDeadlineAt);
        }
        if (session.patientJoinedAt != 0) {
            revert AlreadyCheckedIn(sessionId, session.patient);
        }

        session.patientJoinedAt = block.timestamp;
        emit PatientCheckedIn(sessionId, session.patient, session.patientJoinedAt);
        _maybeStartSession(sessionId, session);
    }

    function _checkInTherapist(uint256 sessionId, Session storage session) internal {
        if (session.status != SessionStatus.Funded && session.status != SessionStatus.InSession) {
            revert InvalidStatus(sessionId, SessionStatus.Funded, session.status);
        }
        _requireNoShowDeadline(sessionId, session);
        if (block.timestamp > session.noShowDeadlineAt) {
            revert CheckInWindowClosed(sessionId, session.noShowDeadlineAt);
        }
        if (session.therapistJoinedAt != 0) {
            revert AlreadyCheckedIn(sessionId, session.therapist);
        }

        session.therapistJoinedAt = block.timestamp;
        emit TherapistCheckedIn(sessionId, session.therapist, session.therapistJoinedAt);
        _maybeStartSession(sessionId, session);
    }

    function _maybeMarkFunded(uint256 sessionId, Session storage session) internal {
        if (session.walletFundedWei > session.walletRequiredWei) {
            revert InvalidFundingAmount(session.walletRequiredWei, session.walletFundedWei);
        }
        if (session.subsidyFundedWei > session.subsidyRequiredWei) {
            revert InvalidFundingAmount(session.subsidyRequiredWei, session.subsidyFundedWei);
        }

        uint256 totalFundedWei = session.walletFundedWei + session.subsidyFundedWei;
        if (totalFundedWei < session.feeWei) {
            return;
        }
        if (totalFundedWei != session.feeWei) {
            revert InvalidDistribution(session.feeWei, totalFundedWei);
        }

        session.status = SessionStatus.Funded;
        session.fundedAt = block.timestamp;
        session.noShowDeadlineAt = block.timestamp + NO_SHOW_WINDOW;

        emit SessionFunded(
            sessionId,
            session.walletFundedWei,
            session.subsidyFundedWei,
            session.fundedAt,
            session.noShowDeadlineAt
        );
    }

    function _maybeStartSession(uint256 sessionId, Session storage session) internal {
        if (session.patientJoinedAt == 0 || session.therapistJoinedAt == 0 || session.sessionStartedAt != 0) {
            return;
        }

        _requireFullyFunded(sessionId, session);
        if (session.status != SessionStatus.Funded && session.status != SessionStatus.InSession) {
            revert InvalidStatus(sessionId, SessionStatus.Funded, session.status);
        }

        session.status = SessionStatus.InSession;
        session.sessionStartedAt = block.timestamp;

        emit SessionStarted(sessionId, session.sessionStartedAt);
    }

    function _completeSession(uint256 sessionId, Session storage session) internal {
        _assertDistribution(session.feeWei, 0, NORMAL_PROTOCOL_FEE, NORMAL_THERAPIST_PAYOUT);

        session.status = SessionStatus.Completed;
        session.completedAt = block.timestamp;
        session.therapistPayoutWei = NORMAL_THERAPIST_PAYOUT;
        session.protocolFeeWei = NORMAL_PROTOCOL_FEE;
        session.refundAmountWei = 0;
        session.penaltyFeeWei = 0;
        // Clear any pending end request before the session closes.
        delete sessionEndRequestedBy[sessionId];

        claimableBalance[session.therapist] += NORMAL_THERAPIST_PAYOUT;
        claimableBalance[protocolTreasury] += NORMAL_PROTOCOL_FEE;
        _clearActiveSession(session.patient, sessionId);

        emit SessionCompleted(
            sessionId,
            session.therapistPayoutWei,
            session.protocolFeeWei,
            session.completedAt
        );
    }

    function _applyPatientNoShowSettlement(uint256 sessionId, Session storage session) internal {
        _assertDistribution(session.feeWei, PATIENT_NO_SHOW_REFUND, 0, PATIENT_NO_SHOW_PENALTY);

        (uint256 patientRefundWei, uint256 vaultRefundWei) = _splitRefundBySource(session, PATIENT_NO_SHOW_REFUND);

        session.status = SessionStatus.PatientNoShow;
        session.penaltyFeeWei = PATIENT_NO_SHOW_PENALTY;
        session.refundAmountWei = PATIENT_NO_SHOW_REFUND;
        session.protocolFeeWei = 0;
        session.therapistPayoutWei = PATIENT_NO_SHOW_PENALTY;

        claimableBalance[session.therapist] += PATIENT_NO_SHOW_PENALTY;
        if (patientRefundWei > 0) {
            claimableBalance[session.patient] += patientRefundWei;
        }
        if (vaultRefundWei > 0) {
            claimableBalance[vault] += vaultRefundWei;
        }
        _clearActiveSession(session.patient, sessionId);

        emit PatientNoShowResolved(
            sessionId,
            session.therapistPayoutWei,
            patientRefundWei,
            vaultRefundWei,
            session.penaltyFeeWei
        );
    }

    function _applyTherapistNoShowSettlement(uint256 sessionId, Session storage session) internal {
        _assertDistribution(session.feeWei, THERAPIST_NO_SHOW_REFUND, 0, 0);

        (uint256 patientRefundWei, uint256 vaultRefundWei) = _splitRefundBySource(
            session,
            THERAPIST_NO_SHOW_REFUND
        );

        session.status = SessionStatus.TherapistNoShow;
        session.penaltyFeeWei = 0;
        session.refundAmountWei = THERAPIST_NO_SHOW_REFUND;
        session.protocolFeeWei = 0;
        session.therapistPayoutWei = 0;

        if (patientRefundWei > 0) {
            claimableBalance[session.patient] += patientRefundWei;
        }
        if (vaultRefundWei > 0) {
            claimableBalance[vault] += vaultRefundWei;
        }
        _clearActiveSession(session.patient, sessionId);

        emit TherapistNoShowResolved(sessionId, patientRefundWei, vaultRefundWei);
    }

    function _splitRefundBySource(
        Session storage session,
        uint256 refundTotalWei
    ) internal view returns (uint256 patientRefundWei, uint256 vaultRefundWei) {
        _requireFullyFunded(session.id, session);

        patientRefundWei = (refundTotalWei * session.walletFundedWei) / session.feeWei;
        vaultRefundWei = refundTotalWei - patientRefundWei;
    }

    function _assertDistribution(
        uint256 feeWei,
        uint256 refundAmountWei,
        uint256 protocolFeeWei,
        uint256 therapistPayoutWei
    ) internal pure {
        uint256 total = refundAmountWei + protocolFeeWei + therapistPayoutWei;
        if (total != feeWei) {
            revert InvalidDistribution(feeWei, total);
        }
    }

    function _clearActiveSession(address patient, uint256 sessionId) internal {
        if (activeSessionOfPatient[patient] == sessionId) {
            activeSessionOfPatient[patient] = 0;
        }
    }

    function _getSession(uint256 sessionId) internal view returns (Session storage session) {
        session = sessions[sessionId];
        if (session.id == 0) {
            revert SessionNotFound(sessionId);
        }
    }

    function _requirePatient(Session storage session, address caller) internal view {
        if (caller != session.patient) {
            revert UnauthorizedCaller(session.id, caller);
        }
    }

    function _requireTherapist(Session storage session, address caller) internal view {
        if (caller != session.therapist) {
            revert UnauthorizedCaller(session.id, caller);
        }
    }

    function _requireStatus(Session storage session, SessionStatus expectedStatus) internal view {
        if (session.status != expectedStatus) {
            revert InvalidStatus(session.id, expectedStatus, session.status);
        }
    }

    function _requireBeforePaymentDue(uint256 sessionId, Session storage session) internal view {
        if (block.timestamp > session.paymentDueAt) {
            revert PaymentWindowExpired(sessionId, session.paymentDueAt);
        }
    }

    function _requireNoShowDeadline(uint256 sessionId, Session storage session) internal view {
        if (session.noShowDeadlineAt == 0) {
            revert NoShowDeadlineNotSet(sessionId);
        }
    }

    function _requireFullyFunded(uint256 sessionId, Session storage session) internal view {
        uint256 fundedWei = session.walletFundedWei + session.subsidyFundedWei;
        if (fundedWei != session.feeWei) {
            revert SessionNotFullyFunded(sessionId, fundedWei, session.feeWei);
        }
    }
}
