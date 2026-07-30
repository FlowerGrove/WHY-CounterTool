import { readFileSync } from 'fs';
import { inflateRawSync } from 'zlib';

const file = 'j:/WHY-CounterTool/24E11-J1-LI-1002_0 INSTRUMENT IO LIST.xlsx';
const buf = readFileSync(file);

const zip = {};
let offset = 0;
while (offset < buf.length - 30) {
    const sig = buf.readUInt32LE(offset);
    if (sig !== 0x04034b50) break;
    const compMethod = buf.readUInt16LE(offset + 8);
    const compSize = buf.readUInt32LE(offset + 18);
    const fnLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const name = buf.toString('utf8', offset + 30, offset + 30 + fnLen);
    const dataStart = offset + 30 + fnLen + extraLen;
    const data = buf.slice(dataStart, dataStart + compSize);
    try {
        if (compMethod === 0) zip[name] = data;
        else if (compMethod === 8) zip[name] = inflateRawSync(data);
        else zip[name] = data;
    } catch {}
    offset = dataStart + compSize;
}

const sharedStringsXml = zip['xl/sharedStrings.xml']?.toString('utf8') || '';
const sharedStrings = [];
if (sharedStringsXml) {
    const siMatches = sharedStringsXml.match(/<si>(.*?)<\/si>/gs) || [];
    for (const si of siMatches) {
        const text = (si.match(/<t[^>]*>([^<]*)<\/t>/g) || [])
            .map(t => t.replace(/<[^>]+>/g, ''))
            .join('');
        sharedStrings.push(text);
    }
}

function parseSheet(xml) {
    const rows = [];
    const rowMatches = xml.match(/<row[^>]*>(.*?)<\/row>/gs) || [];
    for (const rowStr of rowMatches) {
        const cells = [];
        const cellMatches = rowStr.match(/<c[^>]*>(.*?)<\/c>/gs) || [];
        for (const cellStr of cellMatches) {
            const typeMatch = cellStr.match(/t="([^"]+)"/);
            const valMatch = cellStr.match(/<v>([^<]*)<\/v>/);
            let val = '';
            if (typeMatch && typeMatch[1] === 's' && valMatch) {
                val = sharedStrings[parseInt(valMatch[1], 10)] || '';
            } else if (valMatch) {
                val = valMatch[1];
            }
            cells.push(val);
        }
        rows.push(cells);
    }
    return rows;
}

const typesContent = readFileSync('j:/WHY-CounterTool/0001/assets/instrument-types.js', 'utf8');
const existingAbbrs = new Set();
for (const m of typesContent.matchAll(/abbr:\s*['"]([A-Z0-9]+)['"]/g)) {
    existingAbbrs.add(m[1]);
}

const tagPattern = /\b([A-Z]{1,4})[-_]?\d{1,5}\b/g;
const allAbbr = new Set();

for (const name of Object.keys(zip).sort()) {
    if (!name.startsWith('xl/worksheets/sheet') || name.includes('.rels')) continue;
    const rows = parseSheet(zip[name].toString('utf8'));
    for (const row of rows) {
        for (const val of row) {
            if (!val) continue;
            const s = String(val).toUpperCase();
            const matches = s.matchAll(tagPattern);
            for (const m of matches) allAbbr.add(m[1]);
        }
    }
}

const sorted = [...allAbbr].sort();
const missing = sorted.filter(a => !existingAbbrs.has(a));

console.log('Missing:', missing.join(', '));
console.log('Missing count:', missing.length, '/', sorted.length);
