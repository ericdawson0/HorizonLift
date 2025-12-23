import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'Horizon Lift',
  projectId: '2f08f6a3d55f1d7a8e6b8c58a1d0ff45',
  chains: [sepolia],
  ssr: false,
});
