import { useMemo, useState } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { Contract } from 'ethers';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import {
  FUNDRAISING_ADDRESS,
  FUNDRAISING_ABI,
  CUSDT_ADDRESS,
  CUSDT_ABI,
  CONTRACTS_CONFIGURED,
} from '../config/contracts';
import '../styles/FundraisingApp.css';
import { Header } from './Header';

type CampaignDetails = {
  name: string;
  targetAmount: number;
  endTime: number;
  closed: boolean;
};

type TransactionStage = 'idle' | 'setting-operator' | 'encrypting' | 'sending';

export function FundraisingApp() {
  const { address } = useAccount();
  const signerPromise = useEthersSigner();
  const { instance, isLoading: zamaLoading } = useZamaInstance();

  const [contributionInput, setContributionInput] = useState('');
  const [mintInput, setMintInput] = useState('1000000');
  const [txStage, setTxStage] = useState<TransactionStage>('idle');
  const [decrypting, setDecrypting] = useState(false);
  const [decryptedContribution, setDecryptedContribution] = useState<string>('');
  const [decryptedTotal, setDecryptedTotal] = useState<string>('');
  const [mintStatus, setMintStatus] = useState('');
  const [adminForm, setAdminForm] = useState({
    name: '',
    target: '',
    endTime: '',
  });
  const [adminStatus, setAdminStatus] = useState('');
  const [withdrawStatus, setWithdrawStatus] = useState('');

  const { data: campaignData } = useReadContract({
    address: FUNDRAISING_ADDRESS,
    abi: FUNDRAISING_ABI,
    functionName: 'getCampaignDetails',
    query: {
      enabled: CONTRACTS_CONFIGURED,
    },
  });

  const { data: totalRaised, refetch: refetchTotal } = useReadContract({
    address: FUNDRAISING_ADDRESS,
    abi: FUNDRAISING_ABI,
    functionName: 'getTotalRaised',
    query: {
      enabled: CONTRACTS_CONFIGURED,
    },
  });

  const { data: contributionData, refetch: refetchContribution } = useReadContract({
    address: FUNDRAISING_ADDRESS,
    abi: FUNDRAISING_ABI,
    functionName: 'getContributionOf',
    args: address && CONTRACTS_CONFIGURED ? [address] : undefined,
    query: {
      enabled: !!address && CONTRACTS_CONFIGURED,
    },
  });

  const { data: ownerData } = useReadContract({
    address: FUNDRAISING_ADDRESS,
    abi: FUNDRAISING_ABI,
    functionName: 'owner',
    query: {
      enabled: CONTRACTS_CONFIGURED,
    },
  });

  const { data: isActiveData, refetch: refetchIsActive } = useReadContract({
    address: FUNDRAISING_ADDRESS,
    abi: FUNDRAISING_ABI,
    functionName: 'isActive',
    query: {
      enabled: CONTRACTS_CONFIGURED,
    },
  });

  const campaign: CampaignDetails | null = useMemo(() => {
    if (!campaignData) return null;
    const tuple = campaignData as any;
    const parsedName = tuple.name ?? tuple[0] ?? '';
    const target = Number(tuple.targetAmount ?? tuple[1] ?? 0);
    const end = Number(tuple.endTime ?? tuple[2] ?? 0);
    const closed = Boolean(tuple.closed ?? tuple[3]);
    return {
      name: parsedName,
      targetAmount: target,
      endTime: end,
      closed,
    };
  }, [campaignData]);

  const isOwner = ownerData && address ? (ownerData as string).toLowerCase() === address.toLowerCase() : false;
  const isActive = Boolean(isActiveData);
  const countdownLabel =
    CONTRACTS_CONFIGURED && campaign?.endTime
      ? buildCountdown(Math.max(campaign.endTime * 1000 - Date.now(), 0))
      : 'Awaiting deployment';

  const statusLabel = !CONTRACTS_CONFIGURED ? 'Awaiting deployment' : campaign?.closed ? 'Closed' : isActive ? 'Active' : 'Ended';
  const statusTone = !CONTRACTS_CONFIGURED ? 'warning' : campaign?.closed ? 'muted' : isActive ? 'accent' : 'warning';

  const setOperatorAndEncrypt = async (amount: number) => {
    if (!address || !instance) {
      throw new Error('Missing wallet or encryption service');
    }
    const signer = await signerPromise;
    if (!signer) {
      throw new Error('Signer unavailable');
    }

    const cusdt = new Contract(CUSDT_ADDRESS, CUSDT_ABI, signer);
    const expiry = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
    setTxStage('setting-operator');
    await cusdt.setOperator(FUNDRAISING_ADDRESS, expiry);

    setTxStage('encrypting');
    return instance.createEncryptedInput(CUSDT_ADDRESS, FUNDRAISING_ADDRESS).add64(amount).encrypt();
  };

  const handleContribute = async () => {
    if (!contributionInput) {
      alert('Enter a contribution amount');
      return;
    }
    if (!CONTRACTS_CONFIGURED) {
      alert('Update config/contracts.ts with deployed contract addresses first');
      return;
    }
    if (!address || !instance) {
      alert('Connect wallet and wait for encryption to be ready');
      return;
    }
    const parsed = Number(contributionInput);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      alert('Contribution must be a positive number');
      return;
    }

    try {
      const encrypted = await setOperatorAndEncrypt(parsed);
      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Signer unavailable');
      }
      const fundraising = new Contract(FUNDRAISING_ADDRESS, FUNDRAISING_ABI, signer);
      setTxStage('sending');
      const tx = await fundraising.contribute(encrypted.handles[0], encrypted.inputProof);
      await tx.wait();

      setContributionInput('');
      await Promise.all([refetchTotal(), refetchContribution(), refetchIsActive()]);
    } catch (error) {
      console.error('Contribution failed:', error);
      alert(error instanceof Error ? error.message : 'Contribution failed');
    } finally {
      setTxStage('idle');
    }
  };

  const handleDecrypt = async () => {
    if (!instance || !address) {
      alert('Encryption service not ready');
      return;
    }
    if (!CONTRACTS_CONFIGURED) {
      alert('Update deployed contract addresses to decrypt on-chain data');
      return;
    }
    if (!contributionData && !totalRaised) {
      alert('No encrypted values to decrypt yet');
      return;
    }
    try {
      setDecrypting(true);
      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Signer unavailable');
      }

      const keypair = instance.generateKeypair();
      const handleContractPairs = [];
      if (contributionData) {
        handleContractPairs.push({
          handle: contributionData as string,
          contractAddress: FUNDRAISING_ADDRESS,
        });
      }
      if (totalRaised) {
        handleContractPairs.push({
          handle: totalRaised as string,
          contractAddress: FUNDRAISING_ADDRESS,
        });
      }

      const startTimeStamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = '10';
      const contractAddresses = [FUNDRAISING_ADDRESS];
      const eip712 = instance.createEIP712(keypair.publicKey, contractAddresses, startTimeStamp, durationDays);

      const signature = await signer.signTypedData(
        eip712.domain,
        {
          UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification,
        },
        eip712.message,
      );

      const result = await instance.userDecrypt(
        handleContractPairs,
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        contractAddresses,
        address,
        startTimeStamp,
        durationDays,
      );

      if (contributionData) {
        const clearContribution = result[contributionData as string];
        setDecryptedContribution(clearContribution ? `${clearContribution}` : '');
      }
      if (totalRaised) {
        const clearTotal = result[totalRaised as string];
        setDecryptedTotal(clearTotal ? `${clearTotal}` : '');
      }
    } catch (error) {
      console.error('Decrypt failed:', error);
      alert(error instanceof Error ? error.message : 'Failed to decrypt');
    } finally {
      setDecrypting(false);
    }
  };

  const handleMint = async () => {
    if (!address) {
      alert('Connect your wallet first');
      return;
    }
    if (!CONTRACTS_CONFIGURED) {
      alert('Deploy contracts and set their addresses before minting');
      return;
    }
    const signer = await signerPromise;
    if (!signer) {
      alert('Signer unavailable');
      return;
    }
    const parsed = Number(mintInput);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      alert('Mint amount must be positive');
      return;
    }
    try {
      const cusdt = new Contract(CUSDT_ADDRESS, CUSDT_ABI, signer);
      setMintStatus('Minting confidential USDT...');
      const tx = await cusdt.mint(address, parsed);
      await tx.wait();
      setMintStatus('Minted successfully');
    } catch (error) {
      console.error('Mint failed:', error);
      alert(error instanceof Error ? error.message : 'Mint failed');
    } finally {
      setMintStatus('');
    }
  };

  const handleUpdateCampaign = async () => {
    if (!isOwner) {
      alert('Only the fundraiser can update details');
      return;
    }
    if (!CONTRACTS_CONFIGURED) {
      alert('Update contract addresses in config/contracts.ts first');
      return;
    }
    if (!adminForm.name && !adminForm.target && !adminForm.endTime) {
      alert('Fill at least one field to update');
      return;
    }
    const signer = await signerPromise;
    if (!signer) {
      alert('Signer unavailable');
      return;
    }
    const fundraiser = new Contract(FUNDRAISING_ADDRESS, FUNDRAISING_ABI, signer);

    const target = adminForm.target ? Number(adminForm.target) : campaign?.targetAmount || 0;
    const endTimeInput = adminForm.endTime
      ? Math.floor(new Date(adminForm.endTime).getTime() / 1000)
      : campaign?.endTime || 0;
    const name = adminForm.name || campaign?.name || '';

    if (!endTimeInput || Number.isNaN(endTimeInput)) {
      alert('Provide a valid end date');
      return;
    }

    try {
      setAdminStatus('Updating campaign...');
      const tx = await fundraiser.setCampaignDetails(name, target, endTimeInput);
      await tx.wait();
      setAdminStatus('Campaign updated');
      setAdminForm({ name: '', target: '', endTime: '' });
      await Promise.all([refetchTotal(), refetchContribution(), refetchIsActive()]);
    } catch (error) {
      console.error('Update failed:', error);
      alert(error instanceof Error ? error.message : 'Update failed');
    } finally {
      setAdminStatus('');
    }
  };

  const handleEndFundraising = async () => {
    if (!isOwner) {
      alert('Only the fundraiser can close the raise');
      return;
    }
    if (!CONTRACTS_CONFIGURED) {
      alert('Deploy contracts and update addresses before closing the raise');
      return;
    }
    const signer = await signerPromise;
    if (!signer) {
      alert('Signer unavailable');
      return;
    }
    try {
      setWithdrawStatus('Releasing funds...');
      const fundraiser = new Contract(FUNDRAISING_ADDRESS, FUNDRAISING_ABI, signer);
      const tx = await fundraiser.endFundraising();
      await tx.wait();
      setWithdrawStatus('Funds released to fundraiser');
      await Promise.all([refetchTotal(), refetchContribution(), refetchIsActive()]);
    } catch (error) {
      console.error('End fundraising failed:', error);
      alert(error instanceof Error ? error.message : 'Unable to end fundraising');
    } finally {
      setWithdrawStatus('');
    }
  };

  return (
    <div className="app-shell">
      <Header />
      {!CONTRACTS_CONFIGURED && (
        <div className="note warning">
          Deploy contracts to Sepolia and paste the addresses from deployments/sepolia into src/config/contracts.ts to enable live reads and writes.
        </div>
      )}
      <div className="hero">
        <div>
          <p className="eyebrow">Zama-powered crowdfund</p>
          <h1 className="headline">{campaign?.name || 'Horizon Lift'}</h1>
          <p className="subhead">
            Raise with encrypted cUSDT contributions. Contributors keep their amounts confidential while you track
            totals securely.
          </p>
          <div className="status-row">
            <span className={`pill pill-${statusTone}`}>{statusLabel}</span>
            <span className="pill pill-glow">Ends in {countdownLabel}</span>
          </div>
        </div>
        <div className="hero-card">
          <div className="stat">
            <span className="stat-label">Target</span>
            <span className="stat-value">{campaign ? formatNumber(campaign.targetAmount) : '—'} cUSDT</span>
          </div>
          <div className="stat">
            <span className="stat-label">End date</span>
            <span className="stat-value">
              {campaign?.endTime ? new Date(campaign.endTime * 1000).toLocaleString() : 'Pending'}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Your encrypted stake</span>
            <span className="stat-value faded">{contributionData ? 'Stored on-chain' : 'No contribution yet'}</span>
          </div>
        </div>
      </div>

      <div className="grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Contribute</p>
              <h3 className="panel-title">Send a confidential pledge</h3>
            </div>
            <span className="hint">cUSDT address {shorten(CUSDT_ADDRESS)}</span>
          </div>
          <div className="field-group">
            <label>Amount to contribute (uint64)</label>
            <input
              type="number"
              min="0"
              value={contributionInput}
              onChange={(e) => setContributionInput(e.target.value)}
              placeholder="e.g. 500000"
            />
          </div>
          <div className="action-row">
            <button
              className="primary"
              onClick={handleContribute}
              disabled={txStage !== 'idle' || zamaLoading || !isActive}
            >
              {zamaLoading && 'Preparing encryption...'}
              {txStage === 'setting-operator' && 'Granting operator access...'}
              {txStage === 'encrypting' && 'Encrypting amount...'}
              {txStage === 'sending' && 'Submitting pledge...'}
              {txStage === 'idle' && 'Contribute'}
            </button>
            <button className="ghost" onClick={handleDecrypt} disabled={decrypting || (!contributionData && !totalRaised)}>
              {decrypting ? 'Decrypting...' : 'Decrypt my data'}
            </button>
          </div>
          <div className="pill-row">
            <div className="mini-stat">
              <p className="stat-label">Your decrypted total</p>
              <p className="stat-value">{decryptedContribution || 'Locked (encrypt-only)'}</p>
            </div>
            <div className="mini-stat">
              <p className="stat-label">Campaign decrypted total</p>
              <p className="stat-value">{decryptedTotal || 'Encrypted on-chain'}</p>
            </div>
          </div>
          <div className="note">
            <p>
              We automatically set the fundraising contract as a temporary operator on cUSDT before encrypting your
              amount. All ciphertexts stay private on-chain.
            </p>
          </div>
        </section>

        <section className="panel muted-surface">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Contributor tools</p>
              <h3 className="panel-title">Mint test cUSDT</h3>
            </div>
          </div>
          <div className="field-group">
            <label>Mint amount</label>
            <input
              type="number"
              min="0"
              value={mintInput}
              onChange={(e) => setMintInput(e.target.value)}
              placeholder="1000000"
            />
          </div>
          <button className="secondary" onClick={handleMint} disabled={!address}>
            Mint to my wallet
          </button>
          <p className="helper">Use this on Sepolia to top up your balance before contributing.</p>
          {mintStatus && <p className="status-text">{mintStatus}</p>}
        </section>

        <section className="panel wide">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Fundraiser</p>
              <h3 className="panel-title">Manage this round</h3>
            </div>
            <span className="hint">{isOwner ? 'You are the fundraiser' : 'Read-only view'}</span>
          </div>
          <div className="admin-grid">
            <div className="field-group">
              <label>Campaign name</label>
              <input
                type="text"
                value={adminForm.name}
                onChange={(e) => setAdminForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder={campaign?.name || 'Horizon Lift'}
              />
            </div>
            <div className="field-group">
              <label>Target amount (uint64)</label>
              <input
                type="number"
                min="0"
                value={adminForm.target}
                onChange={(e) => setAdminForm((prev) => ({ ...prev, target: e.target.value }))}
                placeholder={campaign ? `${campaign.targetAmount}` : '1000000000'}
              />
            </div>
            <div className="field-group">
              <label>End date</label>
              <input
                type="datetime-local"
                value={adminForm.endTime}
                onChange={(e) => setAdminForm((prev) => ({ ...prev, endTime: e.target.value }))}
              />
            </div>
          </div>
          <div className="action-row">
            <button className="secondary" onClick={handleUpdateCampaign} disabled={!isOwner}>
              Update campaign
            </button>
            <button className="destructive" onClick={handleEndFundraising} disabled={!isOwner || campaign?.closed}>
              {withdrawStatus || 'End fundraising & withdraw'}
            </button>
          </div>
          {adminStatus && <p className="status-text">{adminStatus}</p>}
          <div className="note">
            <p>
              The fundraiser can adjust the name, target, or closing time while the round is open. Ending the round sends
              all encrypted cUSDT to the fundraiser address.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

function buildCountdown(msRemaining: number) {
  if (msRemaining <= 0) return '0h 0m';
  const totalSeconds = Math.floor(msRemaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatNumber(value: number) {
  if (!Number.isFinite(value)) return '0';
  return value.toLocaleString('en-US');
}

function shorten(value: string) {
  if (!value) return '';
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}
