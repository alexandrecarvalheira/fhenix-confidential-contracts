// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, ebool, euint128 } from "@fhenixprotocol/cofhe-contracts/FHE.sol";

/**
 * @dev Library providing safe arithmetic operations for encrypted values
 * to handle potential overflows in FHE operations.
 */
library FHESafeMath {
    /**
     * @dev Try to increase the encrypted value `oldValue` by `delta`. If the operation is successful,
     * `success` will be true and `updated` will be the new value. Otherwise, `success` will be false
     * and `updated` will be the original value.
     */
    function tryAdd(euint128 oldValue, euint128 delta) internal returns (ebool success, euint128 updated) {
        if (euint128.unwrap(oldValue) == 0) {
            success = FHE.asEbool(true);
            updated = delta;
        } else {
            euint128 newValue = FHE.add(oldValue, delta);
            success = FHE.gte(newValue, oldValue);
            updated = FHE.select(success, newValue, oldValue);
        }
    }

    /**
     * @dev Try to decrease the encrypted value `oldValue` by `delta`. If the operation is successful,
     * `success` will be true and `updated` will be the new value. Otherwise, `success` will be false
     * and `updated` will be the original value.
     */
    function trySub(euint128 oldValue, euint128 delta) internal returns (ebool success, euint128 updated) {
        success = FHE.gte(oldValue, delta);
        updated = FHE.select(success, FHE.sub(oldValue, delta), oldValue);
    }
}
