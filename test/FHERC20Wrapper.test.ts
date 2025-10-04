import { expect } from "chai";
import hre, { ethers } from "hardhat";
import { FHERC20Wrapper, ERC20_Harness } from "../typechain-types";
import {
  expectERC20BalancesChange,
  expectFHERC20BalancesChange,
  prepExpectERC20BalancesChange,
  ticksToIndicated,
} from "./utils";
import { prepExpectFHERC20BalancesChange } from "./utils";

describe("FHERC20Wrapper", function () {
  // We define a fixture to reuse the same setup in every test.
  const deployContracts = async () => {
    // Deploy wBTC
    const wBTCFactory = await ethers.getContractFactory("ERC20_Harness");
    const wBTC = (await wBTCFactory.deploy("Wrapped BTC", "wBTC", 8)) as ERC20_Harness;
    await wBTC.waitForDeployment();

    // Deploy eBTC
    const eBTCFactory = await ethers.getContractFactory("FHERC20Wrapper");
    const eBTC = (await eBTCFactory.deploy(wBTC, "eBTC")) as FHERC20Wrapper;
    await eBTC.waitForDeployment();

    return { wBTC, eBTC };
  };

  async function setupFixture() {
    const [owner, bob, alice, eve] = await ethers.getSigners();
    const { wBTC, eBTC } = await deployContracts();

    await hre.cofhe.initializeWithHardhatSigner(owner);

    return { owner, bob, alice, eve, wBTC, eBTC };
  }

  describe("initialization", function () {
    it("Should be constructed correctly", async function () {
      const { wBTC, eBTC } = await setupFixture();

      expect(await eBTC.name()).to.equal("FHERC20 Wrapped Wrapped BTC", "FHERC20Wrapper name correct");
      expect(await eBTC.symbol()).to.equal("eBTC", "FHERC20Wrapper symbol correct");
      expect(await eBTC.decimals()).to.equal(8, "FHERC20Wrapper decimals correct");
      expect(await eBTC.erc20()).to.equal(wBTC.target, "FHERC20Wrapper underlying ERC20 correct");
      expect(await eBTC.isFherc20()).to.equal(true, "FHERC20Wrapper isFherc20 correct");
    });

    it("Should handle symbol correctly", async function () {
      // Deploy TEST
      const TESTFactory = await ethers.getContractFactory("ERC20_Harness");
      const TEST = (await TESTFactory.deploy("Test Token", "TEST", 18)) as ERC20_Harness;
      await TEST.waitForDeployment();

      // Deploy eTEST
      const eTESTFactory = await ethers.getContractFactory("FHERC20Wrapper");
      const eTEST = (await eTESTFactory.deploy(TEST, "eTEST")) as FHERC20Wrapper;
      await eTEST.waitForDeployment();

      expect(await eTEST.name()).to.equal("FHERC20 Wrapped Test Token", "eTEST name correct");
      expect(await eTEST.symbol()).to.equal("eTEST", "eTEST symbol correct");
      expect(await eTEST.decimals()).to.equal(await TEST.decimals(), "eTEST decimals correct");
      expect(await eTEST.erc20()).to.equal(TEST.target, "eTEST underlying ERC20 correct");

      await eTEST.updateSymbol("encTEST");
      expect(await eTEST.symbol()).to.equal("encTEST", "eTEST symbol updated correct");
    });

    it("Should revert if underlying token is not ERC20", async function () {
      const { eBTC } = await setupFixture();

      // Deploy eeBTC
      const eeBTCFactory = await ethers.getContractFactory("FHERC20Wrapper");
      await expect(eeBTCFactory.deploy(eBTC, "eeBTC")).to.be.revertedWithCustomError(eBTC, "FHERC20InvalidErc20");
    });
  });

  describe("wrap balance (ERC20 -> FHERC20)", function () {
    it("Should succeed", async function () {
      const { eBTC, bob, wBTC } = await setupFixture();

      expect(await eBTC.totalSupply()).to.equal(0, "Total indicated supply init 0");
      expect(await eBTC.confidentialTotalSupply()).to.equal(0, "Total supply not initialized (hash is 0)");

      const mintValue = BigInt(10e8);
      const transferValue = BigInt(1e8);

      // Mint wBTC
      await wBTC.mint(bob, mintValue);
      await wBTC.connect(bob).approve(eBTC.target, mintValue);

      // 1st TX, indicated + 5001, true + 1e8

      await prepExpectERC20BalancesChange(wBTC, bob.address);
      await prepExpectFHERC20BalancesChange(eBTC, bob.address);

      await expect(eBTC.connect(bob).wrap(bob, transferValue)).to.emit(eBTC, "Transfer");

      await expectERC20BalancesChange(wBTC, bob.address, -1n * transferValue);
      await expectFHERC20BalancesChange(eBTC, bob.address, await ticksToIndicated(eBTC, 5001n), transferValue);

      expect(await eBTC.totalSupply()).to.equal(
        await ticksToIndicated(eBTC, 5001n),
        "Total indicated supply increases",
      );
      await hre.cofhe.mocks.expectPlaintext(await eBTC.confidentialTotalSupply(), transferValue);

      // 2nd TX, indicated + 1, true + 1e8

      await prepExpectERC20BalancesChange(wBTC, bob.address);
      await prepExpectFHERC20BalancesChange(eBTC, bob.address);

      await expect(eBTC.connect(bob).wrap(bob, transferValue)).to.emit(eBTC, "Transfer");

      await expectERC20BalancesChange(wBTC, bob.address, -1n * transferValue);
      await expectFHERC20BalancesChange(eBTC, bob.address, await ticksToIndicated(eBTC, 1n), transferValue);
    });
  });

  describe("unwrap & claim balance (FHERC20 -> ERC20)", function () {
    it("Should succeed", async function () {
      const { eBTC, bob, wBTC } = await setupFixture();

      expect(await eBTC.totalSupply()).to.equal(0, "Total supply init 0");
      expect(await eBTC.confidentialTotalSupply()).to.equal(0, "Total supply not initialized (hash is 0)");

      const mintValue = BigInt(10e8);
      const transferValue = BigInt(1e8);

      // Mint and wrap wBTC
      await wBTC.mint(bob, mintValue);
      await wBTC.connect(bob).approve(eBTC.target, mintValue);
      await eBTC.connect(bob).wrap(bob, mintValue);

      // TX

      await prepExpectERC20BalancesChange(wBTC, bob.address);
      await prepExpectFHERC20BalancesChange(eBTC, bob.address);

      await expect(eBTC.connect(bob).unwrap(bob, transferValue)).to.emit(eBTC, "Transfer");

      // -- expect only **FHERC20** balance to change
      await expectERC20BalancesChange(wBTC, bob.address, 0n);
      await expectFHERC20BalancesChange(
        eBTC,
        bob.address,
        -1n * (await ticksToIndicated(eBTC, 1n)),
        -1n * transferValue,
      );

      // Unwrap inserts a claimable amount into the user's claimable set

      let claims = await eBTC.getUserClaims(bob.address);
      expect(claims.length).to.equal(1, "Bob has 1 claimable amount");

      const claimableCtHash = claims[0].ctHash;
      let claim = await eBTC.getClaim(claimableCtHash);
      expect(claim.claimed).to.equal(false, "Claimable amount not claimed");
      await hre.cofhe.mocks.expectPlaintext(claimableCtHash, transferValue);

      // Hardhat time travel 11 seconds
      await hre.network.provider.send("evm_increaseTime", [11]);
      await hre.network.provider.send("evm_mine");

      // Claim Unwrapped tokens

      await prepExpectERC20BalancesChange(wBTC, bob.address);
      await prepExpectFHERC20BalancesChange(eBTC, bob.address);

      await eBTC.connect(bob).claimUnwrapped(claimableCtHash);

      // -- expect only **ERC20** balance to change
      await expectERC20BalancesChange(wBTC, bob.address, 1n * transferValue);
      await expectFHERC20BalancesChange(eBTC, bob.address, 0n, 0n);

      // Claimable amount is now claimed
      claim = await eBTC.getClaim(claimableCtHash);
      expect(claim.claimed).to.equal(true, "Claimable amount claimed");

      // User has no claimable amounts left
      claims = await eBTC.getUserClaims(bob.address);
      expect(claims.length).to.equal(0, "Bob has no claimable amounts");

      // Total indicated supply decreases
      expect(await eBTC.totalSupply()).to.equal(
        await ticksToIndicated(eBTC, 5000n),
        "Total indicated supply decreases",
      );
      await hre.cofhe.mocks.expectPlaintext(await eBTC.confidentialTotalSupply(), mintValue - transferValue);
    });
    it("Should claim all unwrapped amounts", async function () {
      const { eBTC, bob, wBTC } = await setupFixture();

      expect(await eBTC.totalSupply()).to.equal(0, "Total supply init 0");
      expect(await eBTC.confidentialTotalSupply()).to.equal(0, "Total supply not initialized (hash is 0)");

      const mintValue = BigInt(10e8);
      const transferValue = BigInt(1e8);

      // Mint and wrap wBTC
      await wBTC.mint(bob, mintValue);
      await wBTC.connect(bob).approve(eBTC.target, mintValue);
      await eBTC.connect(bob).wrap(bob.address, mintValue);

      // Multiple unwraps

      await eBTC.connect(bob).unwrap(bob.address, transferValue);
      await eBTC.connect(bob).unwrap(bob.address, transferValue);

      // Hardhat time travel 11 seconds
      await hre.network.provider.send("evm_increaseTime", [11]);
      await hre.network.provider.send("evm_mine");

      prepExpectERC20BalancesChange(wBTC, bob.address);

      // Claim all unwrapped amounts
      await eBTC.connect(bob).claimAllUnwrapped();

      await expectERC20BalancesChange(wBTC, bob.address, 2n * transferValue);

      // Expect all unwrapped amounts to be claimed
      const claims = await eBTC.getUserClaims(bob.address);
      expect(claims.length).to.equal(0, "Bob has no claimable amounts");
    });
  });
});
