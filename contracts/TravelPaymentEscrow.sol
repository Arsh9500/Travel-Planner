// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title TravelPaymentEscrow
/// @notice Records travel booking payments transparently and lets the merchant withdraw received funds.
contract TravelPaymentEscrow {
    address public owner;
    uint256 public paymentCount;

    struct Payment {
        address payer;
        uint256 amount;
        string bookingReference;
        string tripDetailsHash;
        uint256 paidAt;
        bool withdrawn;
    }

    mapping(uint256 => Payment) public payments;

    event TravelPaymentReceived(
        uint256 indexed paymentId,
        address indexed payer,
        uint256 amount,
        string bookingReference,
        string tripDetailsHash
    );
    event PaymentWithdrawn(uint256 indexed paymentId, address indexed recipient, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function payForBooking(string calldata bookingReference, string calldata tripDetailsHash) external payable returns (uint256) {
        require(msg.value > 0, "Payment required");
        require(bytes(bookingReference).length > 0, "Booking reference required");

        paymentCount += 1;
        payments[paymentCount] = Payment({
            payer: msg.sender,
            amount: msg.value,
            bookingReference: bookingReference,
            tripDetailsHash: tripDetailsHash,
            paidAt: block.timestamp,
            withdrawn: false
        });

        emit TravelPaymentReceived(paymentCount, msg.sender, msg.value, bookingReference, tripDetailsHash);
        return paymentCount;
    }

    function withdrawPayment(uint256 paymentId, address payable recipient) external onlyOwner {
        Payment storage payment = payments[paymentId];
        require(payment.amount > 0, "Unknown payment");
        require(!payment.withdrawn, "Already withdrawn");
        require(recipient != address(0), "Invalid recipient");

        payment.withdrawn = true;
        recipient.transfer(payment.amount);

        emit PaymentWithdrawn(paymentId, recipient, payment.amount);
    }
}
