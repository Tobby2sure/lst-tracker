import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';

const geist = Geist({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'LST Earnings — Track your liquid staking rewards',
  description: 'See exactly how much ETH your ETHx and rsETH tokens have earned. Real-time exchange rates, earnings calculator, and historical charts.',
  openGraph: {
    title: 'LST Earnings Tracker',
    description: 'Track your ETHx and rsETH staking rewards in real time',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={geist.className}>{children}</body>
    </html>
  );
}
