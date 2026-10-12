'use client';
import {useEffect, useRef, useState} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {
  mergeRankCandidates, normalizeRankCandidates, parseCandidateFasta, validateRankCandidates, validateRankResult,
  type RankCandidate, type RankResult,
} from '@/lib/puf-ranking';
import {rankLocalCandidates} from '@/lib/puf-ranker-local';

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
  const compatible = candidates.length > 0 && candidates.every(candidate => candidate.protein.length === 492);
  const normalizedCount = candidates.filter(candidate => candidate.normalization).length;

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

  async function importFile(file: File | undefined, kind: 'fasta' | 'result') {
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
      if (kind === 'fasta') {
        const merged = mergeRankCandidates(snapshot, parseCandidateFasta(text));
        const added = merged.length - snapshot.length;
        if (added) replaceQueue(merged);
        setMessage(added + ' added. Duplicates skipped.');
      } else {
        onResult(validateRankResult(JSON.parse(text), snapshot, 'imported'));
        setMessage('Results imported.');
      }
    } catch (error) {
      if (token === generation.current) setMessage((error as Error).message);
    } finally {
      if (token === generation.current) setOperation(null);
    }
  }

  async function rank() {
    if (disabled || busy || !compatible) return;
    cancel();
    const token = generation.current, snapshot = validateRankCandidates(candidates);
    setOperation({key: contextKey, token});
    onResult(null);
    setMessage('');
    try {
      const validated = await rankLocalCandidates(snapshot);
      if (token !== generation.current) return;
      onResult(validated);
      setMessage('Ranking complete.');
    } catch (error) {
      if (token === generation.current) setMessage((error as Error).message);
    } finally {
      if (token === generation.current) setOperation(null);
    }
  }

  let displayed: RankResult | null = null;
  try { if (result) displayed = validateRankResult(result, candidates, result.source); } catch { /* Stale results are hidden until parent invalidation completes. */ }
  const rows = displayed ? displayed.rows.map(row => ({candidate: candidates.find(candidate => candidate.id === row.id)!, row})) : candidates.map(candidate => ({candidate, row: null}));

  return <section className="puf-ranking" aria-labelledby="puf-ranking-title">
    <div className="panel-heading"><h3 id="puf-ranking-title">PUF ranking</h3><span>{candidates.length} / 50</span></div>
    <div className="lab-toolbar">
      <label>Name<Input value={name} maxLength={200} disabled={disabled || busy} onChange={event => setName(event.target.value)} placeholder="Candidate name"/></label>
      <Button type="button" disabled={disabled || busy || !protein || candidates.length >= 50} onClick={enqueueCurrent}>Add design</Button>
      <label>Protein FASTA<Input type="file" accept=".fa,.faa,.fasta,.txt" disabled={disabled || busy} onChange={event => { void importFile(event.target.files?.[0], 'fasta'); event.target.value = ''; }}/></label>
    </div>
    {disabled && <p className="notice">Apply RNA changes first.</p>}
    <p className="lab-note">492-aa variants · Fixed C295/C388/C871 assay score, not a target-RNA editing probability.</p>
    {normalizedCount > 0 && <p className="lab-note">{normalizedCount} normalized: 493 → 492 aa.</p>}
    <div className="lab-toolbar">
      <Button type="button" disabled={disabled || busy || !compatible} onClick={() => { void rank(); }}>Rank candidates</Button>
      {busy && <Button type="button" variant="outline" onClick={() => { cancel(); setMessage('Cancelled.'); }}>Cancel</Button>}
    </div>
    {!compatible && candidates.length > 0 && <p className="lab-note">Remove non-492-aa candidates to rank.</p>}
    {busy && <p role="status">Processing…</p>}
    {message && <p className="notice" role="status">{message}</p>}
    <Table><TableHeader><TableRow><TableHead>Candidate</TableHead><TableHead>Length</TableHead><TableHead>S</TableHead><TableHead>ESM-2</TableHead><TableHead>Rank</TableHead><TableHead><span className="sr-only">Queue actions</span></TableHead></TableRow></TableHeader>
      <TableBody>{rows.map(({candidate, row}) => <TableRow key={candidate.id}><TableCell><b>{candidate.label}</b><br/><small>{candidate.id}</small></TableCell><TableCell>{candidate.protein.length} aa{candidate.normalization && <><br/><small>493 → 492</small></>}</TableCell><TableCell>{row ? row.S_hat.toPrecision(6) : '—'}</TableCell><TableCell>{row ? row.ESM2_score.toPrecision(6) : '—'}</TableCell><TableCell>{row?.rank ?? '—'}</TableCell><TableCell><Button type="button" variant="ghost" size="sm" disabled={disabled} aria-label={'Remove ' + candidate.label + ' from candidate queue'} onClick={() => { replaceQueue(candidates.filter(item => item.id !== candidate.id)); setMessage('Removed. Scores cleared.'); }}>Remove</Button></TableCell></TableRow>)}</TableBody>
    </Table>
    {!candidates.length && <p className="lab-note">Add a design or import FASTA.</p>}
    <details className="workflow-import"><summary>Details</summary>
      <p className="lab-note">Local PUF-ESM model. S = C388_hat − (C295_hat + C871_hat)/2; higher ranks first. ESM-2 is a separate feature. Ties use candidate ID.</p>
      <p className="lab-note">Fixed-coordinate substitutions only; no insertions or deletions. Import: ≤50 proteins, ≤2,000 standard amino acids each, ≤200 KB.</p>
      <p className="lab-note">493-aa inputs ending in G lose terminal G; originals are retained. This preserves archived predictions, not experimental evidence for the deletion.</p>
      {displayed && <p className="lab-note">{displayed.source} · {displayed.modelId}<br/>{displayed.modelVersion}</p>}
      <label>Import result JSON<Input type="file" accept=".json" disabled={disabled || busy || !compatible} onChange={event => { void importFile(event.target.files?.[0], 'result'); event.target.value = ''; }}/></label>
    </details>
  </section>;
}
