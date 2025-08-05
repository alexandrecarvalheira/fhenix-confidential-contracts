import hre, { ethers } from "hardhat";
import { FHERC20_Harness, Vault } from "../typechain-types";
import { cofhejs, Encryptable } from "cofhejs/node";
import { appendMetadataToInput } from "./metadata";
import { expect } from "chai";
import {
  expectFHERC20BalancesChange,
  generateTransferFromPermit,
  prepExpectFHERC20BalancesChange,
  tick,
  ticksToIndicated,
} from "./utils";

describe.only("Vault (encTransferFrom)", function () {
  // We define a fixture to reuse the same setup in every test.
  const deployContracts = async () => {
    // Deploy XFHE
    const XFHEFactory = await ethers.getContractFactory("FHERC20_Harness");
    const XFHE = (await XFHEFactory.deploy("Unknown FHERC20", "XFHE", 18)) as FHERC20_Harness;
    const XFHEAddress = await XFHE.getAddress();
    await XFHE.waitForDeployment();

    // Deploy Vault
    const VaultFactory = await ethers.getContractFactory("Vault");
    const Vault = (await VaultFactory.deploy(XFHEAddress)) as Vault;
    await Vault.waitForDeployment();

    return { XFHE, Vault };
  };

  async function setupFixture() {
    const [owner, bob, alice, eve] = await ethers.getSigners();
    const { XFHE, Vault } = await deployContracts();

    await hre.cofhe.initializeWithHardhatSigner(owner);

    // Give bob and alice XFHE
    const mintValue = ethers.parseEther("10");
    await XFHE.mint(bob, mintValue);
    await XFHE.mint(alice, mintValue);

    return { owner, bob, alice, eve, XFHE, Vault };
  }

  describe("Deposit", async function () {
    it("test", async function () {
      const { bob, XFHE, Vault } = await setupFixture();
      const VaultAddress = await Vault.getAddress();

      // Mint to vault (initialize indicator)
      await XFHE.mint(VaultAddress, await ethers.parseEther("1"));

      // Encrypt transfer value
      const transferValue = ethers.parseEther("1");
      const encTransferResult = await cofhejs.encrypt([Encryptable.uint128(transferValue)] as const);
      const [encTransferInput] = await hre.cofhe.expectResultSuccess(encTransferResult);

      // Append metadata to encTransferInput.ctHash
      const encTransferCtHashWMetadata = appendMetadataToInput(encTransferInput);

      // Generate encTransferFrom permit
      const permit = await generateTransferFromPermit({
        token: XFHE,
        signer: bob,
        owner: bob.address,
        spender: VaultAddress,
        valueHash: encTransferCtHashWMetadata,
      });

      // Success - Bob -> Vault

      await prepExpectFHERC20BalancesChange(XFHE, bob.address);
      await prepExpectFHERC20BalancesChange(XFHE, VaultAddress);

      await expect(Vault.connect(bob).deposit(encTransferInput, permit))
        .to.emit(XFHE, "Transfer")
        .withArgs(bob.address, VaultAddress, await tick(XFHE));

      await expectFHERC20BalancesChange(
        XFHE,
        bob.address,
        -1n * (await ticksToIndicated(XFHE, 1n)),
        -1n * transferValue,
      );
      await expectFHERC20BalancesChange(
        XFHE,
        VaultAddress,
        1n * (await ticksToIndicated(XFHE, 1n)),
        1n * transferValue,
      );

      // Bob Vault Balance
      const bobBalance = await Vault.balances(bob.address);
      await hre.cofhe.mocks.expectPlaintext(bobBalance, transferValue);
    });
  });
});
