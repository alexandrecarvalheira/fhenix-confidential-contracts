// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts (last updated v5.1.0) (token/ERC20/ERC20.sol)

pragma solidity ^0.8.25;

import { FHE, InEuint128, euint128 } from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import { IFHERC20 } from "../interfaces/IFHERC20.sol";
import { FHERC20Wrapper } from "../FHERC20Wrapper.sol";

contract MockFherc20Vault {
    IFHERC20 public fherc20;

    constructor(address fherc20_) {
        fherc20 = IFHERC20(fherc20_);
    }

    function deposit(InEuint128 memory inValue, IFHERC20.FHERC20_EIP712_Permit calldata permit) public {
        euint128 value = FHE.asEuint128(inValue);
        FHE.allow(value, address(fherc20));
        fherc20.encTransferFrom(msg.sender, address(this), value, permit);
    }
}
