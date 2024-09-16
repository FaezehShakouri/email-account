// SPDX-License-Identifier: MIT

pragma solidity ^0.8.23;

import "@account-abstraction/contracts/core/BaseAccount.sol";


contract EmailAccount is BaseAccount {
    IEntryPoint private immutable _entryPoint;
    uint256 public dkimPubkeyHash; // hash of the dkim public key of email domain
    uint256 public ownerEmailCommitment; // hash of the owner's salted email
    IGroth16Verifier public immutable verifier; // the zk verifier for email integrity and ownership

    uint256 public constant p = 21888242871839275222246405745257275088548364400416034343698204186575808495617;

    constructor(
        IEntryPoint anEntryPoint,
        IGroth16Verifier _verifier,
        bytes32 _dkimPubkeyHash,
        bytes32 _accountCommitment
    ) {
        _entryPoint = anEntryPoint;
        verifier = _verifier;
        dkimPubkeyHash = uint256(_dkimPubkeyHash) % p;
        ownerEmailCommitment = uint256(_accountCommitment) % p;
    }

    function entryPoint() public view override returns (IEntryPoint) {
        return _entryPoint;
    }

    function _validateSignature(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash
    ) internal view override returns (uint256 validationData) {
        (
            uint[2] memory _pA,
            uint[2][2] memory _pB,
            uint[2] memory _pC,
            uint[3] memory _pubSignals
        ) = abi.decode(
                userOp.signature,
                (uint[2], uint[2][2], uint[2], uint[3])
            );
        
        // optimizing this to return early if any of the checks fail causes gas estimation to be off by a lot in the bundler
        bool isUserOpHashValid = _pubSignals[0] == uint256(userOpHash) % p;
        bool isAccountCommitmentValid = _pubSignals[1] == ownerEmailCommitment;
        bool isDkimPubkeyHashValid = _pubSignals[2] == dkimPubkeyHash;
        bool isProofValid = verifier.verifyProof(_pA, _pB, _pC, _pubSignals);
        bool result = isUserOpHashValid &&
            isDkimPubkeyHashValid &&
            isAccountCommitmentValid &&
            isProofValid;
        return result ? 0 : 1;
    }

    function execute(
        address dest,
        uint256 value,
        bytes calldata func
    ) external {
        _requireFromEntryPoint();
        (bool success, bytes memory result) = dest.call{value: value}(func);
        if (!success) {
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
    }

    // Function to receive Ether. msg.data must be empty
    receive() external payable {}

    // Fallback function is called when msg.data is not empty
    fallback() external payable {}
}

interface IGroth16Verifier {
    function verifyProof(
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[3] calldata _pubSignals
    ) external view returns (bool);
}
