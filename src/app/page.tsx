import { Suspense } from 'react';
import EarningsDashboard from '@/components/EarningsDashboard';

export default function Home() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#080810] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-sky-500/30 border-t-sky-500 rounded-full animate-spin" />
      </div>
    }>
      <EarningsDashboard />
    </Suspense>
  );
}
