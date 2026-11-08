'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function SeriesRedirect() {
  const router = useRouter();
  useEffect(() => router.replace('/develop?medium=tv'), [router]);
  return <div className="p-8 text-sm text-muted">Opening TV development in the production pipeline…</div>;
}
