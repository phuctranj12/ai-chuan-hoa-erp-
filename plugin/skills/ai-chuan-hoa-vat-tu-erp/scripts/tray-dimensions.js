import patterns from './tray-size-patterns.js';

const key = value => String(value ?? '').normalize('NFC').toLocaleLowerCase('vi').replace(/\s+/g, ' ').trim();
const rules = new Map(Object.entries(patterns).map(([name, pattern]) => [key(name), pattern]));
const number = '\\d+(?:[.,]\\d+)?';
const canonical = value => String(Number(value.replace(',', '.')));

export function trayDimension(text, group, material) {
  const pattern = rules.get(key(`${group}|${material}`));
  if (!pattern) return null;
  const fail = {value:'', trusted:false, enforced:true};
  const source = String(text ?? '');
  const axes = {W:[], H:[], Z:[]};
  // Only labelled axes: T/L and unlabelled dimensions cannot become W/H.
  const expression = new RegExp(`(?:^|[^a-z0-9]|[x×])([WHZ])\\s*[:=]?\\s*(${number}(?:\\s*\\/\\s*(?:W\\s*[:=]?\\s*)?${number})*)(?:\\s*(mm|cm|m)\\b)?`, 'gi');
  for (const match of source.matchAll(expression)) {
    if (match[3] && match[3].toLowerCase() !== 'mm') return fail;
    const axis = match[1].toUpperCase();
    const values = [...match[2].matchAll(new RegExp(number,'g'))].map(m => canonical(m[0]));
    if (values.some(v => Number(v) <= 0)) return fail;
    axes[axis].push(...values);
  }
  const neededW = pattern.includes('1/2/3') ? 3 : pattern.includes('1/2') ? 2 : pattern.includes('W') ? 1 : 0;
  if (neededW && axes.W.length !== neededW) return fail;
  for (const axis of ['H','Z']) {
    if (pattern.includes(axis) && (!axes[axis].length || new Set(axes[axis]).size !== 1)) return fail;
  }
  const parts = [];
  if (neededW) parts.push(`W${axes.W.join('/')}`);
  if (pattern.includes('H')) parts.push(`H${axes.H[0]}`);
  if (pattern.includes('Z')) parts.push(`Z${axes.Z[0]}`);
  return {value:parts.join('x'), trusted:true, enforced:true};
}
