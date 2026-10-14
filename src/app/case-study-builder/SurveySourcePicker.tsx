import { useState } from 'react';
import { FileUp, RefreshCw } from 'lucide-react';
import { projectId, publicAnonKey } from '../../utils/supabase/info';
import { aggregateQuestion, parseCsv, questionColumns, responseCount } from './survey-data';
import type { CaseStudySection, SurveyQuestion } from './model';

type Choice = { columnIndex: number; chart: SurveyQuestion['chart']; multiSelect: boolean };

export function SurveySourcePicker({ section, onApply }: { section: CaseStudySection; onApply: (patch: Partial<CaseStudySection>) => void }) {
  const [url, setUrl] = useState(section.surveySource?.url || '');
  const [rows, setRows] = useState<string[][] | null>(null);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const available = rows ? questionColumns(rows[0]) : [];

  const loadRows = (text: string) => {
    const parsed = parseCsv(text);
    const columns = questionColumns(parsed[0]);
    if (!columns.length) throw new Error('No survey question columns were found. Choose a Google Forms response CSV.');
    setRows(parsed);
    setChoices(columns.slice(0, 2).map((columnIndex, index) => ({ columnIndex, chart: index ? 'arcs' : 'bars', multiSelect: false })));
    setNotice(`${responseCount(parsed)} responses loaded. Choose the questions you want to show.`);
    setError('');
  };

  const fetchSheet = async (sourceUrl: string) => {
    const endpoint = import.meta.env.DEV ? '/__studio/survey' : `https://${projectId}.supabase.co/functions/v1/studio-survey-csv`;
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(import.meta.env.DEV ? { 'x-studio-source': '1' } : { Authorization: `Bearer ${publicAnonKey}`, apikey: publicAnonKey }) }, body: JSON.stringify({ sourceUrl }) });
    const data = await response.json();
    if (!response.ok || typeof data.csv !== 'string') throw new Error(data.error || 'Could not load response Sheet.');
    return data.csv as string;
  };

  const loadSheet = async () => {
    setBusy(true); setError(''); setNotice('');
    try { loadRows(await fetchSheet(url.trim())); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load response Sheet.'); }
    finally { setBusy(false); }
  };

  const loadFile = async (file?: File) => {
    if (!file) return;
    setBusy(true); setError(''); setNotice('');
    try {
      if (file.size > 5_000_000) throw new Error('Choose a CSV smaller than 5 MB.');
      loadRows(await file.text());
      setUrl('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not read the CSV.'); }
    finally { setBusy(false); }
  };

  const apply = (parsed: string[][], selected: Choice[], sourceUrl?: string, preserveTitles = false) => {
    if (!selected.length) throw new Error('Choose at least one question.');
    const questions = selected.map(choice => aggregateQuestion(parsed, choice.columnIndex, choice.multiSelect, choice.chart));
    if (questions.some(question => !question.answered)) throw new Error('A selected question has no answers yet. Choose another question.');
    if (questions.some(question => question.options.length > 12)) throw new Error('A selected question has more than 12 distinct answers. Choose a closed-choice question for a clear chart.');
    onApply({
      surveySource: { url: sourceUrl || undefined, updatedAt: new Date().toISOString(), totalResponses: responseCount(parsed), questions },
      items: questions.map((question, index) => ({ title: preserveTitles ? section.items[index]?.title || question.sourceName : question.sourceName, detail: section.items[index]?.detail || '' })),
    });
    setNotice(`${questions.length} chart${questions.length === 1 ? '' : 's'} updated from ${responseCount(parsed)} responses. Raw response rows were not saved.`);
    setError('');
  };

  const refresh = async () => {
    if (!section.surveySource?.url) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const parsed = parseCsv(await fetchSheet(section.surveySource.url));
      const previous = section.surveySource.questions;
      const selected = previous.map(question => {
        const columnIndex = parsed[0].findIndex(header => header.trim() === question.sourceName);
        if (columnIndex < 0) throw new Error(`The question “${question.sourceName}” is no longer in this Sheet.`);
        return { columnIndex, chart: question.chart, multiSelect: question.multiSelect };
      });
      apply(parsed, selected, section.surveySource.url, true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not refresh results.'); }
    finally { setBusy(false); }
  };

  return <div className="csb-survey-source">
    <div className="csb-inspector-divider" /><p className="csb-panel-kicker">Google Forms results</p>
    <p className="csb-field-note">In Google Forms, open <strong>Responses → Link to Sheets</strong>. For refreshable charts, use a published CSV link from an anonymized Sheet tab, then click Refresh linked results when responses change. Keep raw responses private when they contain names or email addresses.</p>
    <div className="csb-field"><label htmlFor="csb-survey-sheet-url">Google response Sheet link</label><input id="csb-survey-sheet-url" type="url" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" /></div>
    <div className="csb-survey-source-actions"><button className="csb-primary-button" type="button" onClick={loadSheet} disabled={busy || !url.trim()}>Load response Sheet</button><label className="csb-quiet-button csb-survey-file"><FileUp size={14} /> Import CSV<input type="file" accept=".csv,text/csv" onChange={event => { void loadFile(event.target.files?.[0]); event.target.value = ''; }} /></label></div>
    {section.surveySource?.url && <button className="csb-quiet-button csb-survey-refresh" type="button" onClick={refresh} disabled={busy}><RefreshCw size={14} /> Refresh linked results</button>}
    {section.surveySource && <p className="csb-field-note">Last updated {new Date(section.surveySource.updatedAt).toLocaleString()} · {section.surveySource.totalResponses} total responses</p>}
    {rows && <div className="csb-survey-mapping"><p className="csb-panel-kicker">Choose charts</p>{choices.map((choice, index) => <div className="csb-survey-mapping-row" key={index}><div className="csb-survey-mapping-heading"><strong>Question {index + 1}</strong><button type="button" onClick={() => setChoices(previous => previous.filter((_, i) => i !== index))}>Remove</button></div><div className="csb-field"><label htmlFor={`csb-survey-question-${index}`}>Survey question</label><select id={`csb-survey-question-${index}`} value={choice.columnIndex} onChange={event => setChoices(previous => previous.map((item, i) => i === index ? { ...item, columnIndex: Number(event.target.value) } : item))}>{available.map(columnIndex => <option value={columnIndex} key={columnIndex}>{rows[0][columnIndex]}</option>)}</select></div><div className="csb-field"><label htmlFor={`csb-survey-style-${index}`}>Chart</label><select id={`csb-survey-style-${index}`} value={choice.chart} onChange={event => setChoices(previous => previous.map((item, i) => i === index ? { ...item, chart: event.target.value as Choice['chart'] } : item))}><option value="bars">Percentage bars</option><option value="arcs">Arc comparison</option></select></div><label className="csb-survey-checkbox"><input type="checkbox" checked={choice.multiSelect} onChange={event => setChoices(previous => previous.map((item, i) => i === index ? { ...item, multiSelect: event.target.checked } : item))} /> Respondents could choose multiple answers</label></div>)}{choices.length < Math.min(4, available.length) && <button type="button" className="csb-quiet-button" onClick={() => setChoices(previous => [...previous, { columnIndex: available.find(index => !previous.some(choice => choice.columnIndex === index)) ?? available[0], chart: 'bars', multiSelect: false }])}>Add question</button>}<button className="csb-primary-button" type="button" onClick={() => { try { apply(rows, choices, url.trim()); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not build charts.'); } }}>Use these charts</button></div>}
    {error && <p className="csb-inline-status csb-inline-error" role="alert">{error}</p>}{notice && <p className="csb-inline-status" role="status">{notice}</p>}
  </div>;
}
