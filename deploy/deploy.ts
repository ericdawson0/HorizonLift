import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedCUSDT = await deploy("ConfidentialUSDT", {
    from: deployer,
    log: true,
  });

  const now = Math.floor(Date.now() / 1000);
  const defaultEndTime = now + 7 * 24 * 60 * 60;

  const deployedFundraising = await deploy("ConfidentialFundraising", {
    from: deployer,
    args: [deployedCUSDT.address, "Horizon Lift", 1_000_000_000, defaultEndTime],
    log: true,
  });

  console.log(`ConfidentialUSDT contract: `, deployedCUSDT.address);
  console.log(`ConfidentialFundraising contract: `, deployedFundraising.address);
};
export default func;
func.id = "deploy_confidentialFundraising"; // id required to prevent reexecution
func.tags = ["ConfidentialFundraising"];
