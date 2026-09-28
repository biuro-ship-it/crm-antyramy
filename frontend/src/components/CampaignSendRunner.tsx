import React, { useEffect, useRef, useState } from 'react';
import { CampaignCounts, sendCampaignBatch } from '../services/api';

interface CampaignSendRunnerProps {
  campaignId: string;
  initialCounts: CampaignCounts | null;
  initialPending: number;
  onDone: () => void;
}

// Wysyłka partiami: woła /send-batch w pętli, aż nie zostanie nikt do wysłania.
// Uruchamiany wyłącznie po kliknięciu „Wyślij” / „Wznów wysyłkę”. Zamknięcie
// okna przerywa pętlę — kampania zostaje „w wysyłce” i można ją wznowić.
const CampaignSendRunner: React.FC<CampaignSendRunnerProps> = ({ campaignId, initialCounts, initialPending, onDone }) => {
  const [counts, setCounts] = useState<CampaignCounts | null>(initialCounts);
  const [pending, setPending] = useState(initialPending);
  const [running, setRunning] = useState(true);
  const [error, setError] = useState('');
  const [failures, setFailures] = useState<string[]>([]);
  // Numer bieżącej pętli — starsza pętla (np. podwójny efekt w StrictMode,
  // odmontowanie) kończy się przy pierwszym sprawdzeniu.
  const runId = useRef(0);

  const run = async () => {
    const myRun = ++runId.current;
    setRunning(true);
    setError('');
    try {
      for (;;) {
        if (runId.current !== myRun) return;
        const res = await sendCampaignBatch(campaignId);
        if (runId.current !== myRun) return;
        setCounts(res.counts);
        setPending(res.pending);
        const failed = res.batch.filter(b => !b.ok).map(b => b.error || 'błąd');
        if (failed.length) setFailures(f => [...f, ...failed]);
        if (res.status === 'sent' || res.pending === 0) {
          setRunning(false);
          onDone();
          return;
        }
      }
    } catch (e) {
      if (runId.current !== myRun) return;
      setError((e as Error).message);
      setRunning(false);
    }
  };

  useEffect(() => {
    // Opóźnienie startu: w StrictMode pierwszy efekt jest od razu sprzątany,
    // więc wysyłka rusza tylko raz (z drugiego, właściwego montowania).
    const t = setTimeout(run, 50);
    return () => { clearTimeout(t); runId.current++; };
  }, [campaignId]);

  const total = counts?.total ?? initialPending;
  const done = (counts?.sent ?? 0) + (counts?.failed ?? 0);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="bg-surface-soft border border-hairline rounded-xl p-5 space-y-3">
      <div className="flex justify-between items-baseline">
        <p className="text-sm font-semibold text-ink">
          {running ? 'Wysyłam…' : pending === 0 ? 'Wysyłka zakończona' : 'Wysyłka wstrzymana'}
        </p>
        <p className="text-sm text-ink">
          <strong>{counts?.sent ?? 0}</strong> wysłano · {counts?.failed ?? 0} błędów · {pending} w kolejce
        </p>
      </div>
      <div className="h-3 bg-canvas rounded-full overflow-hidden border border-hairline">
        <div className="h-full bg-primary transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
      {running && (
        <p className="text-xs text-ink font-light">Nie zamykaj tego okna do końca wysyłki. Gdyby się zamknęło — kampanię można wznowić z listy.</p>
      )}
      {error && (
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-lg px-3 py-2 text-sm text-red-700 dark:text-red-300 flex justify-between items-center gap-3">
          <span>{error}</span>
          <button type="button" onClick={run} className="btn-secondary text-xs shrink-0">Spróbuj ponownie</button>
        </div>
      )}
      {failures.length > 0 && (
        <details className="text-xs text-red-700 dark:text-red-300">
          <summary className="cursor-pointer">Błędy wysyłki ({failures.length})</summary>
          <ul className="mt-1 space-y-0.5">{failures.map((f, i) => <li key={i}>{f}</li>)}</ul>
        </details>
      )}
    </div>
  );
};

export default CampaignSendRunner;
