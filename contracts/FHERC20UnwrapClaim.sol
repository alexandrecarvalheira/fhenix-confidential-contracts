// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts (last updated v5.1.0) (token/ERC20/ERC20.sol)

pragma solidity ^0.8.25;

import { IERC20, IERC20Metadata, ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { EnumerableSet } from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { euint64, FHE } from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import { IFHERC20, FHERC20 } from "./FHERC20.sol";

abstract contract FHERC20UnwrapClaim {
    using EnumerableSet for EnumerableSet.UintSet;

    struct Claim {
        uint256 ctHash;
        uint64 requestedAmount;
        uint64 decryptedAmount;
        bool decrypted;
        address to;
        bool claimed;
    }

    mapping(uint256 ctHash => Claim) private _claims;
    mapping(address => EnumerableSet.UintSet) private _userClaims;

    error ClaimNotFound();
    error AlreadyClaimed();

    function _createClaim(address to, uint64 value, euint64 claimable) internal {
        _claims[euint64.unwrap(claimable)] = Claim({
            ctHash: euint64.unwrap(claimable),
            requestedAmount: value,
            decryptedAmount: 0,
            decrypted: false,
            to: to,
            claimed: false
        });
        _userClaims[to].add(euint64.unwrap(claimable));
    }

    function _handleClaim(uint256 ctHash) internal returns (Claim memory claim) {
        claim = _claims[ctHash];

        // Check that the claimable amount exists and has not been claimed yet
        if (claim.to == address(0)) revert ClaimNotFound();
        if (claim.claimed) revert AlreadyClaimed();

        // Get the decrypted amount (reverts if the amount is not decrypted yet)
        uint64 amount = SafeCast.toUint64(FHE.getDecryptResult(ctHash));

        // Update the claim
        claim.decryptedAmount = amount;
        claim.decrypted = true;
        claim.claimed = true;

        // Update the claim in storage
        _claims[ctHash] = claim;

        // Remove the claimable amount from the user's claimable set
        _userClaims[claim.to].remove(ctHash);
    }

    function _handleClaimAll() internal returns (Claim[] memory claims) {
        claims = new Claim[](_userClaims[msg.sender].length());

        uint256[] memory ctHashes = _userClaims[msg.sender].values();
        for (uint256 i = 0; i < ctHashes.length; i++) {
            claims[i] = _handleClaim(ctHashes[i]);
        }
    }

    function getClaim(uint256 ctHash) public view returns (Claim memory) {
        Claim memory _claim = _claims[ctHash];
        (uint256 amount, bool decrypted) = FHE.getDecryptResultSafe(ctHash);
        _claim.decryptedAmount = SafeCast.toUint64(amount);
        _claim.decrypted = decrypted;
        return _claim;
    }

    function getUserClaims(address user) public view returns (Claim[] memory) {
        uint256[] memory ctHashes = _userClaims[user].values();
        Claim[] memory userClaims = new Claim[](ctHashes.length);
        for (uint256 i = 0; i < ctHashes.length; i++) {
            userClaims[i] = _claims[ctHashes[i]];
            (uint256 amount, bool decrypted) = FHE.getDecryptResultSafe(ctHashes[i]);
            userClaims[i].decryptedAmount = SafeCast.toUint64(amount);
            userClaims[i].decrypted = decrypted;
        }
        return userClaims;
    }
}
