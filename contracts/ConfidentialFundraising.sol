// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";

contract ConfidentialFundraising is Ownable, ZamaEthereumConfig {
    struct Campaign {
        string name;
        uint64 targetAmount;
        uint256 endTime;
        bool closed;
    }

    IERC7984 public immutable paymentToken;
    Campaign private _campaign;
    euint64 private _totalRaised;
    mapping(address contributor => euint64) private _contributions;

    event CampaignConfigured(string name, uint64 targetAmount, uint256 endTime);
    event ContributionReceived(address indexed contributor, euint64 encryptedAmount);
    event FundraisingEnded(address indexed recipient, euint64 encryptedAmount);

    constructor(
        address tokenAddress,
        string memory campaignName,
        uint64 targetAmount,
        uint256 endTime
    ) Ownable(msg.sender) {
        require(tokenAddress != address(0), "Token required");
        require(endTime > block.timestamp, "End time must be in the future");

        paymentToken = IERC7984(tokenAddress);
        _campaign = Campaign({name: campaignName, targetAmount: targetAmount, endTime: endTime, closed: false});
    }

    function setCampaignDetails(string calldata campaignName, uint64 targetAmount, uint256 endTime) external onlyOwner {
        require(!_campaign.closed, "Fundraising closed");
        require(endTime > block.timestamp, "End time must be in the future");

        _campaign = Campaign({name: campaignName, targetAmount: targetAmount, endTime: endTime, closed: false});
        emit CampaignConfigured(campaignName, targetAmount, endTime);
    }

    function contribute(
        externalEuint64 encryptedAmount,
        bytes calldata inputProof
    ) external returns (euint64 contributorTotal) {
        require(!_campaign.closed, "Fundraising closed");
        require(block.timestamp < _campaign.endTime, "Fundraising ended");

        euint64 transferred = paymentToken.confidentialTransferFrom(msg.sender, address(this), encryptedAmount, inputProof);

        euint64 currentContribution = _contributions[msg.sender];
        if (!FHE.isInitialized(currentContribution)) {
            currentContribution = FHE.asEuint64(0);
        }

        euint64 updatedContribution = FHE.add(currentContribution, transferred);
        FHE.allowThis(updatedContribution);
        FHE.allow(updatedContribution, owner());
        FHE.allow(updatedContribution, msg.sender);
        _contributions[msg.sender] = updatedContribution;

        euint64 runningTotal = _totalRaised;
        if (!FHE.isInitialized(runningTotal)) {
            runningTotal = FHE.asEuint64(0);
        }

        euint64 updatedTotal = FHE.add(runningTotal, transferred);
        FHE.allowThis(updatedTotal);
        FHE.allow(updatedTotal, msg.sender);
        FHE.allow(updatedTotal, owner());
        _totalRaised = updatedTotal;

        emit ContributionReceived(msg.sender, transferred);
        return updatedContribution;
    }

    function endFundraising() external onlyOwner returns (euint64 releasedAmount) {
        require(!_campaign.closed, "Already closed");
        _campaign.closed = true;

        if (!FHE.isInitialized(_totalRaised)) {
            euint64 zero = FHE.asEuint64(0);
            emit FundraisingEnded(owner(), zero);
            return zero;
        }

        releasedAmount = paymentToken.confidentialTransfer(owner(), _totalRaised);
        emit FundraisingEnded(owner(), releasedAmount);
    }

    function getContributionOf(address contributor) external view returns (euint64) {
        return _contributions[contributor];
    }

    function getTotalRaised() external view returns (euint64) {
        return _totalRaised;
    }

    function getCampaignDetails() external view returns (Campaign memory) {
        return _campaign;
    }

    function paymentTokenAddress() external view returns (address) {
        return address(paymentToken);
    }

    function isActive() external view returns (bool) {
        return !_campaign.closed && block.timestamp < _campaign.endTime;
    }
}
