// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@fhenixprotocol/cofhe-contracts/FHE.sol";
import { FHERC20 } from "../FHERC20.sol";
import { IFHERC20 } from "../interfaces/IFHERC20.sol";
import { FHESafeMath } from "../utils/FHESafeMath.sol";

contract Vault {
    FHERC20 public immutable asset;
    mapping(address => euint128) public balances;

    constructor(address _asset) {
        require(_asset != address(0), "Invalid asset");
        asset = FHERC20(_asset);
    }

    function deposit(InEuint128 calldata inAmount, IFHERC20.FHERC20_EIP712_Permit calldata permit) external {
        euint128 amount = FHE.asEuint128(inAmount);
        FHE.allow(amount, address(asset));
        euint128 transferred = asset.encTransferFrom(msg.sender, address(this), amount, permit);
        (, euint128 updated) = FHESafeMath.tryAdd(balances[msg.sender], transferred);
        balances[msg.sender] = updated;
    }

    function withdraw(InEuint128 calldata inAmount) external {
        euint128 amount = FHE.asEuint128(inAmount);
        (, euint128 updated) = FHESafeMath.trySub(balances[msg.sender], amount);
        balances[msg.sender] = updated;
    }
}
