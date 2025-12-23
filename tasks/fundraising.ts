import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

task("task:fundraising-address", "Print deployed fundraising and cUSDT addresses").setAction(
  async function (_taskArguments: TaskArguments, hre) {
    const { deployments } = hre;

    const cusdt = await deployments.get("ConfidentialUSDT");
    const fundraising = await deployments.get("ConfidentialFundraising");

    console.log(`ConfidentialUSDT: ${cusdt.address}`);
    console.log(`ConfidentialFundraising: ${fundraising.address}`);
  },
);

task("task:decrypt-total", "Decrypt total raised from ConfidentialFundraising")
  .addOptionalParam("address", "Optional fundraising contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;
    await fhevm.initializeCLIApi();

    const fundraisingDeployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("ConfidentialFundraising");
    const fundraising = await ethers.getContractAt("ConfidentialFundraising", fundraisingDeployment.address);

    const totalEncrypted = await fundraising.getTotalRaised();
    console.log(`Encrypted total: ${totalEncrypted}`);

    if (totalEncrypted === ethers.ZeroHash) {
      console.log("Decrypted total: 0");
      return;
    }

    const signers = await ethers.getSigners();
    const clearTotal = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      totalEncrypted,
      fundraisingDeployment.address,
      signers[0],
    );
    console.log(`Decrypted total: ${clearTotal}`);
  });

task("task:contribute", "Send a confidential contribution in cUSDT")
  .addParam("value", "Contribution amount (uint64)")
  .addOptionalParam("address", "Optional fundraising contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;
    await fhevm.initializeCLIApi();

    const contributionValue = parseInt(taskArguments.value);
    if (!Number.isInteger(contributionValue) || contributionValue <= 0) {
      throw new Error("value must be a positive integer");
    }

    const fundraisingDeployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("ConfidentialFundraising");
    const cusdtDeployment = await deployments.get("ConfidentialUSDT");

    const [signer] = await ethers.getSigners();
    const fundraising = await ethers.getContractAt("ConfidentialFundraising", fundraisingDeployment.address);
    const cusdt = await ethers.getContractAt("ConfidentialUSDT", cusdtDeployment.address);

    const expiry = Math.floor(Date.now() / 1000) + 3600;
    const operatorTx = await cusdt.connect(signer).setOperator(fundraisingDeployment.address, expiry);
    await operatorTx.wait();

    const encryptedValue = await fhevm
      .createEncryptedInput(cusdtDeployment.address, fundraisingDeployment.address)
      .add64(contributionValue)
      .encrypt();

    const tx = await fundraising
      .connect(signer)
      .contribute(encryptedValue.handles[0], encryptedValue.inputProof);

    console.log(`Contribution submitted: ${tx.hash}`);
    await tx.wait();

    const updatedContribution = await fundraising.getContributionOf(signer.address);
    const decryptedContribution = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      updatedContribution,
      fundraisingDeployment.address,
      signer,
    );

    console.log(`New contribution total (encrypted): ${updatedContribution}`);
    console.log(`New contribution total (decrypted): ${decryptedContribution}`);
  });
