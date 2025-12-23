import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";

describe("ConfidentialFundraising", function () {
  let fundraisingAddress: string;
  let cusdtAddress: string;
  let deployer: any;
  let alice: any;
  let bob: any;
  let fundraising: any;
  let cusdt: any;

  beforeEach(async function () {
    if (!fhevm.isMock) {
      this.skip();
    }

    [deployer, alice, bob] = await ethers.getSigners();

    const cusdtFactory = await ethers.getContractFactory("ConfidentialUSDT");
    cusdt = await cusdtFactory.deploy();
    cusdtAddress = await cusdt.getAddress();

    const latestBlock = await ethers.provider.getBlock("latest");
    const endTime = (latestBlock?.timestamp || Math.floor(Date.now() / 1000)) + 3600;

    const fundraisingFactory = await ethers.getContractFactory("ConfidentialFundraising");
    fundraising = await fundraisingFactory.deploy(cusdtAddress, "Launch Campaign", 5_000_000, endTime);
    fundraisingAddress = await fundraising.getAddress();

    await cusdt.mint(alice.address, 1_000_000);
    await cusdt.mint(bob.address, 1_000_000);

    const expiry = Math.floor(Date.now() / 1000) + 10_000;
    await cusdt.connect(alice).setOperator(fundraisingAddress, expiry);
    await cusdt.connect(bob).setOperator(fundraisingAddress, expiry);
  });

  it("stores campaign details", async function () {
    const campaign = await fundraising.getCampaignDetails();
    expect(campaign.name).to.eq("Launch Campaign");
    expect(campaign.targetAmount).to.eq(5_000_000);
    expect(campaign.closed).to.eq(false);
  });

  it("accepts confidential contributions and tracks totals", async function () {
    const encrypted = await fhevm.createEncryptedInput(cusdtAddress, fundraisingAddress).add64(250_000).encrypt();
    await fundraising.connect(alice).contribute(encrypted.handles[0], encrypted.inputProof);

    const contributionCipher = await fundraising.getContributionOf(alice.address);
    const totalCipher = await fundraising.getTotalRaised();

    const decryptedContribution = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      contributionCipher,
      fundraisingAddress,
      alice,
    );
    const decryptedTotal = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      totalCipher,
      fundraisingAddress,
      alice,
    );

    expect(decryptedContribution).to.eq(250_000);
    expect(decryptedTotal).to.eq(250_000);
  });

  it("lets the owner end fundraising and withdraw cUSDT", async function () {
    const aliceInput = await fhevm.createEncryptedInput(cusdtAddress, fundraisingAddress).add64(100_000).encrypt();
    const bobInput = await fhevm.createEncryptedInput(cusdtAddress, fundraisingAddress).add64(200_000).encrypt();

    await fundraising.connect(alice).contribute(aliceInput.handles[0], aliceInput.inputProof);
    await fundraising.connect(bob).contribute(bobInput.handles[0], bobInput.inputProof);

    const tx = await fundraising.connect(deployer).endFundraising();
    await tx.wait();

    const ownerBalanceCipher = await cusdt.confidentialBalanceOf(deployer.address);
    const decryptedOwnerBalance = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      ownerBalanceCipher,
      cusdtAddress,
      deployer,
    );

    expect(decryptedOwnerBalance).to.eq(300_000);
    await expect(
      fundraising.connect(alice).contribute(aliceInput.handles[0], aliceInput.inputProof),
    ).to.be.revertedWith("Fundraising closed");
  });
});
