import type { SurveyQuestion } from './model';

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const character = input[i];
    if (character === '"') {
      if (quoted && input[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(cell); cell = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && input[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(value => value.trim())) rows.push(row);
      row = [];
    } else cell += character;
  }
  if (quoted) throw new Error('The CSV has an unfinished quoted value. Export it again from Google Forms or Sheets.');
  row.push(cell);
  if (row.some(value => value.trim())) rows.push(row);
  if (rows.length < 2 || rows[0].length < 2) throw new Error('This CSV needs a header row and at least one response.');
  return rows;
}

export function questionColumns(headers: string[]): number[] {
  return headers.map((_, index) => index).filter(index => {
    const name = headers[index].trim();
    return name && !/^(timestamp|email(?: address)?|name|first name|last name|phone(?: number)?)$/i.test(name);
  });
}

export function aggregateQuestion(rows: string[][], columnIndex: number, multiSelect: boolean, chart: SurveyQuestion['chart']): SurveyQuestion {
  const sourceName = rows[0]?.[columnIndex]?.trim();
  if (!sourceName) throw new Error('The selected question is missing from the CSV.');
  const counts = new Map<string, number>();
  let answered = 0;
  for (const row of rows.slice(1)) {
    const response = row[columnIndex]?.trim();
    if (!response) continue;
    answered++;
    const values = multiSelect ? [...new Set(response.split(',').map(value => value.trim()).filter(Boolean))] : [response];
    for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  }
  return { sourceName, columnIndex, chart, multiSelect, answered, options: [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)) };
}

export function responseCount(rows: string[][]): number {
  return rows.slice(1).filter(row => row.some(value => value.trim())).length;
}
