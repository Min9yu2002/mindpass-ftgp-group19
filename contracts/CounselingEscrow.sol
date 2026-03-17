// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title CounselingEscrow
/// @author M1n9yu
/// @notice Holds a patient's ETH payment in escrow until the patient confirms
/// completion, then releases 95% to the counselor and 5% to the platform.
/// @dev Uses checks-effects-interactions ordering to reduce reentrancy risk.
contract CounselingEscrow {
    /// @notice Address of the patient who funded the escrow.
    address public immutable patient;

    /// @notice Address of the counselor who receives 95% of the escrow.
    address public immutable counselor;

    /// @notice Address of the platform wallet that receives the 5% fee.
    address public immutable platformAddress;

    /// @notice Amount of ETH originally deposited into escrow at deployment.
    uint256 public immutable escrowAmount;

    /// @notice Indicates whether the escrow payment has already been released.
    bool public isCompleted;

    /// @notice Emitted when the escrowed ETH is released.
    /// @param counselorAddress Address receiving the counselor payout.
    /// @param amount Amount of ETH sent to the counselor.
    /// @param fee Amount of ETH sent to the platform.
    event PaymentReleased(address counselorAddress, uint256 amount, uint256 fee);

    /// @notice Restricts execution to the patient who created the escrow.
    modifier onlyPatient() {
        require(msg.sender == patient, "Only patient can call");
        _;
    }

    /// @notice Creates a new counseling escrow and locks the sent ETH.
    /// @dev The deployer becomes the patient and must send ETH on deployment.
    /// @param _counselor Address that will receive 95% when payment is released.
    /// @param _platformAddress Address that will receive the 5% platform fee.
    constructor(address _counselor, address _platformAddress) payable {
        require(msg.value > 0, "Escrow must be funded");
        require(_counselor != address(0), "Invalid counselor address");
        require(_platformAddress != address(0), "Invalid platform address");

        patient = msg.sender;
        counselor = _counselor;
        platformAddress = _platformAddress;
        escrowAmount = msg.value;
    }

    /// @notice Releases the escrowed ETH after the patient confirms completion.
    /// @dev Sets completion state before external calls to prevent double spend
    /// through re-entrancy.
    function releasePayment() external onlyPatient {
        require(!isCompleted, "Payment already released");
        require(address(this).balance >= escrowAmount, "Insufficient escrow balance");

        uint256 platformFee = (escrowAmount * 5) / 100;
        uint256 counselorAmount = escrowAmount - platformFee;

        isCompleted = true;

        (bool feeSent, ) = payable(platformAddress).call{value: platformFee}("");
        require(feeSent, "Platform fee transfer failed");

        (bool counselorSent, ) = payable(counselor).call{value: counselorAmount}("");
        require(counselorSent, "Counselor transfer failed");

        emit PaymentReleased(counselor, counselorAmount, platformFee);
    }
}
