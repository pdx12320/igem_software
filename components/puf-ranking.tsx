'use client';
import {useEffect, useRef, useState} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {
  mergeRankCandidates, normalizeRankCandidates, parseCandidateFasta, validateRankCandidates, validateRankResult,
  type RankCandidate, type RankResult,
} from '@/lib/puf-ranking';

export type PufRankingProps = {
  protein: string | null; disabled: boolean; serviceReady?: boolean;
  candidates: RankCandidate[]; onCandidates: (value: RankCandidate[]) => void;
  result: RankResult | null; onResult: (value: RankResult | null) => void;
};

export default function PufRanking({protein, disabled, candidates, onCandidates, result, onResult}: PufRankingProps) {
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [operation, setOperation] = useState<{key: string; token: number} | null>(null);
  const generation = useRef(0);
  const queueKey = JSON.stringify(candidates);
  const contextKey = JSON.stringify([queueKey, disabled]);
  const previousQueue = useRef(queueKey);
  const busy = operation?.key === contextKey;

  useEffect(() => {
    if (previousQueue.current !== queueKey) {
      previousQueue.current = queueKey;
      // Project restoration can replace the queue and its validated result together.
      if (result) {
        try { validateRankResult(result, candidates, result.source); return; } catch { /* Clear unmatched evidence below. */ }
      }
      onResult(null);
    }
  }, [queueKey, onResult, candidates, result]);

  useEffect(() => () => {
    generation.current += 1;
  }, [contextKey]);

  function cancel() {
    generation.current += 1;
    setOperation(null);
  }

  function replaceQueue(value: RankCandidate[]) {
    cancel();
    onResult(null);
    onCandidates(validateRankCandidates(value));
  }

  function enqueueCurrent() {
    try {
      if (disabled || !protein) throw Error('Apply the current design first.');
      let index = 1;
      while (candidates.some(candidate => candidate.id === 'candidate-' + index)) index += 1;
      const id = 'candidate-' + index;
      const merged = mergeRankCandidates(candidates, normalizeRankCandidates([{id, label: name.trim() || id, protein}]));
      if (merged.length === candidates.length) { setMessage('Protein already added.'); return; }
      replaceQueue(merged);
      setName('');
      setMessage('Candidate saved.');
    } catch (error) { setMessage((error as Error).message); }
  }

  async function importFile(file: File | undefined) {
    if (!file || disabled || busy) return;
    cancel();
    const token = generation.current;
    const snapshot = validateRankCandidates(candidates);
    setOperation({key: contextKey, token});
    setMessage('');
    try {
      if (file.size > 200_000) throw Error('Import limit: 200 KB.');
      const text = await file.text();
      if (token !== generation.current) return;
      const merged = mergeRankCandidates(snapshot, parseCandidateFasta(text));
      const added = merged.length - snapshot.length;
      if (added) replaceQueue(merged);
      setMessage(added + ' added. Duplicates skipped.');
    } catch (error) {
      if (token === generation.current) setMessage((error as Error).message);
    } finally {
      if (token === generation.current) setOperation(null);
    }
  }

  return <section className="puf-ranking" aria-labelledby="puf-ranking-title">
    <div className="panel-heading"><h3 id="puf-ranking-title">PUF candidates</h3></div>
    <div className="lab-toolbar">
      <label>Name<Input value={name} maxLength={200} disabled={disabled || busy} onChange={event => setName(event.target.value)} placeholder="Candidate name"/></label>
      <Button type="button" disabled={disabled || busy || !protein || candidates.length >= 50} onClick={enqueueCurrent}>Save candidate</Button>
      <label>Protein FASTA<Input type="file" accept=".fa,.faa,.fasta,.txt" disabled={disabled || busy} onChange={event => { void importFile(event.target.files?.[0]); event.target.value = ''; }}/></label>
    </div>
    {disabled && <p className="notice">Apply RNA changes first.</p>}
    {busy && <p role="status">Processing…</p>}
    {message && <p className="notice" role="status">{message}</p>}
    <Table><TableHeader><TableRow><TableHead>Candidate</TableHead><TableHead>Length</TableHead><TableHead><span className="sr-only">Queue actions</span></TableHead></TableRow></TableHeader>
      <TableBody>{candidates.map(candidate => <TableRow key={candidate.id}><TableCell><b>{candidate.label}</b></TableCell><TableCell>{candidate.protein.length} aa</TableCell><TableCell><Button type="button" variant="ghost" size="sm" disabled={disabled} aria-label={'Remove ' + candidate.label + ' from candidate queue'} onClick={() => { replaceQueue(candidates.filter(item => item.id !== candidate.id)); setMessage('Removed.'); }}>Remove</Button></TableCell></TableRow>)}</TableBody>
    </Table>
  </section>;
}
