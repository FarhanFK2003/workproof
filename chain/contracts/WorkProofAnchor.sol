// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @title WorkProofAnchor
/// @notice Records integrity commitments for client-confirmed WorkProof records.
/// @dev Stores only opaque 32-byte values. `commitment` is a salted hash of the
/// record ID and `contentHash` is the SHA-256 of the canonical record document;
/// no names, emails, amounts, or confirmation tokens are ever written here.
/// An anchor proves the document existed unchanged at anchoring time. It does not
/// prove that the work claim is true or that any payment was made.
contract WorkProofAnchor {
    struct Anchor {
        bytes32 contentHash;
        uint64 anchoredAt;
    }

    /// @notice The only account allowed to anchor, fixed at deployment.
    /// @dev Prevents third parties from front-running a commitment with a
    /// different content hash. Rotating it means deploying a new contract.
    address public immutable anchorer;

    mapping(bytes32 commitment => Anchor) private _anchors;

    event RecordAnchored(bytes32 indexed commitment, bytes32 contentHash, uint64 anchoredAt);

    error ZeroAnchorer();
    error NotAnchorer();
    error ZeroValue();
    error AlreadyAnchored(bytes32 commitment);

    constructor(address anchorer_) {
        if (anchorer_ == address(0)) revert ZeroAnchorer();
        anchorer = anchorer_;
    }

    /// @notice Anchors a record once. Reverts if the commitment already exists.
    function anchor(bytes32 commitment, bytes32 contentHash) external {
        if (msg.sender != anchorer) revert NotAnchorer();
        if (commitment == bytes32(0) || contentHash == bytes32(0)) revert ZeroValue();
        if (_anchors[commitment].anchoredAt != 0) revert AlreadyAnchored(commitment);

        uint64 anchoredAt = uint64(block.timestamp);
        _anchors[commitment] = Anchor(contentHash, anchoredAt);
        emit RecordAnchored(commitment, contentHash, anchoredAt);
    }

    /// @notice Returns the anchored content hash, or zero values if not anchored.
    function getAnchor(bytes32 commitment) external view returns (bytes32 contentHash, uint64 anchoredAt) {
        Anchor memory stored = _anchors[commitment];
        return (stored.contentHash, stored.anchoredAt);
    }
}
