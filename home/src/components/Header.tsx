import { ConnectButton } from '@rainbow-me/rainbowkit';
import '../styles/Header.css';

export function Header() {
  return (
    <header className="nav">
      <div className="brand">
        <div className="brand-mark">HL</div>
        <div>
          <p className="brand-title">Horizon Lift</p>
          <p className="brand-sub">Confidential fundraising with cUSDT</p>
        </div>
      </div>
      <div className="nav-actions">
        <span className="network-chip">Sepolia</span>
        <ConnectButton />
      </div>
    </header>
  );
}
