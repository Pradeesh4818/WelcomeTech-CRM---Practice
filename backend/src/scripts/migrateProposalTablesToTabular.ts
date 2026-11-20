import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
import mongoose from 'mongoose';

export function normalizeColonTableToTabular(html: string, brandColor: string = '#722580'): string {
  if (!html || typeof html !== 'string') return html || '';

  let result = html.replace(/<table\b[^>]*>([\s\S]*?)<\/table>/gi, (match, inner) => {
    if (inner.includes('>NO</th>') || inner.includes('>No</th>')) {
      let upgraded = match.replace(/border-radius:\s*6px;/gi, 'border-radius: 8px;');
      if (!upgraded.includes('border-top-left-radius')) {
        upgraded = upgraded.replace(/<th\b([^>]*)style="([^"]*)"([^>]*)>/i, '<th$1style="border-top-left-radius: 7px; $2"$3>');
      }
      if (!upgraded.includes('border-top-right-radius')) {
        const thMatches = [...upgraded.matchAll(/<th\b[^>]*>/gi)];
        if (thMatches.length >= 2) {
          const lastTh = thMatches[thMatches.length - 1];
          const lastIdx = lastTh.index!;
          const before = upgraded.slice(0, lastIdx);
          const after = upgraded.slice(lastIdx);
          upgraded = before + after.replace(/<th\b([^>]*)style="([^"]*)"([^>]*)>/i, '<th$1style="border-top-right-radius: 7px; $2"$3>');
        }
      }
      return upgraded;
    }

    const trMatches = inner.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi);
    if (!trMatches || trMatches.length === 0) return match;

    const rows: { col1: string; col2: string }[] = [];
    let isColonTable = true;
    for (const tr of trMatches) {
      const cellMatches = tr.match(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi);
      if (!cellMatches || cellMatches.length < 2) {
        if (tr.toLowerCase().includes('<th')) continue;
        isColonTable = false;
        break;
      }
      const cells = cellMatches.map((c: string) => c.replace(/^<(td|th)\b[^>]*>|<\/(td|th)>$/gi, '').trim());
      if (cells.length === 3 && (cells[1] === ':' || cells[1] === '&#58;' || cells[1].replace(/<[^>]+>/g, '').trim() === ':')) {
        rows.push({ col1: cells[0], col2: cells[2] });
      } else if (cells.length === 2 && !tr.toLowerCase().includes('<th')) {
        rows.push({ col1: cells[0], col2: cells[1] });
      } else if (tr.toLowerCase().includes('<th')) {
        continue;
      } else {
        isColonTable = false;
        break;
      }
    }

    if (!isColonTable || rows.length === 0) return match;

    const allCol1 = rows.map(r => r.col1.replace(/<[^>]+>/g, '').toLowerCase()).join(' ');
    let h1 = 'Terms & Conditions';
    let h2 = 'Details';
    if (allCol1.includes('processor') || allCol1.includes('ram') || allCol1.includes('hard disk') || allCol1.includes('operating system') || allCol1.includes('ms office') || allCol1.includes('hardware')) {
      h1 = 'Component';
      h2 = 'Specification / Requirement';
    } else if (allCol1.includes('specification') || allCol1.includes('feature') || allCol1.includes('requirement')) {
      h1 = 'Item / Parameter';
      h2 = 'Details / Description';
    }

    let rowsHtml = '';
    const total = rows.length;
    rows.forEach((r, idx) => {
      let col1Clean = r.col1.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
      let col2Html = r.col2.trim();
      if (!col1Clean) {
        if (col2Html.toLowerCase().includes('cloud')) col1Clean = 'Cloud Service Payment';
        else col1Clean = 'Additional Payment';
      }
      if (col1Clean && col1Clean.length > 1) {
        col1Clean = col1Clean.charAt(0).toUpperCase() + col1Clean.slice(1);
      }
      const isLast = idx === total - 1;
      const bg = idx % 2 === 1 ? ' background: #fafbfc;' : ' background: #ffffff;';
      const borderBottom = isLast ? '' : ' border-bottom: 1px solid #e2e8f0;';
      const radiusCol1 = isLast ? ' border-bottom-left-radius: 7px;' : '';
      const radiusColLast = isLast ? ' border-bottom-right-radius: 7px;' : '';
      rowsHtml += `    <tr style="${bg}${borderBottom}">\n` +
        `      <td style="border: none;${borderBottom}${radiusCol1} padding: 10px 12px; font-weight: 700; color: #1e293b; text-align: center; vertical-align: top; width: 48px; font-size: 10pt;">${idx + 1}</td>\n` +
        `      <td style="border: none;${borderBottom} padding: 10px 14px; font-weight: 700; color: #1e293b; vertical-align: top; width: 34%; font-size: 10pt;">${col1Clean}</td>\n` +
        `      <td style="border: none;${borderBottom}${radiusColLast} padding: 10px 14px; color: #0f172a; vertical-align: top; width: 66%; font-size: 10pt;">${col2Html}</td>\n` +
        `    </tr>\n`;
    });

    return `<table class="quote-grid-table" style="width: 100%; border-collapse: separate; border-spacing: 0; margin: 12px 0; font-size: 10pt; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background: #ffffff;">\n` +
      `  <thead>\n` +
      `    <tr style="background: ${brandColor}; color: #ffffff;">\n` +
      `      <th style="border: none; border-top-left-radius: 7px; background: ${brandColor}; color: #ffffff; padding: 10px 12px; font-weight: 800; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; text-align: center; width: 48px;">NO</th>\n` +
      `      <th style="border: none; background: ${brandColor}; color: #ffffff; padding: 10px 14px; font-weight: 800; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; text-align: left; width: 34%;">${h1}</th>\n` +
      `      <th style="border: none; border-top-right-radius: 7px; background: ${brandColor}; color: #ffffff; padding: 10px 14px; font-weight: 800; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; text-align: left; width: 66%;">${h2}</th>\n` +
      `    </tr>\n` +
      `  </thead>\n` +
      `  <tbody>\n${rowsHtml}  </tbody>\n` +
      `</table>`;
  });

  return result;
}

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not found in env');
    process.exit(1);
  }
  await mongoose.connect(uri);
  const db = mongoose.connection.db!;

  console.log('=== MIGRATING PROPOSAL TEMPLATES TO TABULAR COLUMNS ===');
  const pts = await db.collection('proposaltemplates').find({}).toArray();
  let ptUpdated = 0;
  for (const pt of pts) {
    let modified = false;
    const blocks = (pt.blocks || []).map((b: any) => {
      if (b.content && b.content.includes('<table')) {
        const nextContent = normalizeColonTableToTabular(b.content);
        if (nextContent !== b.content) {
          modified = true;
          return { ...b, content: nextContent };
        }
      }
      return b;
    });

    if (modified) {
      await db.collection('proposaltemplates').updateOne(
        { _id: pt._id },
        { $set: { blocks } }
      );
      ptUpdated++;
      console.log(`✓ Updated template: "${pt.name}" (${pt._id})`);
    }
  }
  console.log(`Total Proposal Templates updated: ${ptUpdated}/${pts.length}`);

  console.log('\n=== MIGRATING PROPOSALS TO TABULAR COLUMNS ===');
  const props = await db.collection('proposals').find({}).toArray();
  let propUpdated = 0;
  for (const p of props) {
    let modified = false;
    const blocks = (p.blocks || []).map((b: any) => {
      if (b.content && b.content.includes('<table')) {
        const nextContent = normalizeColonTableToTabular(b.content);
        if (nextContent !== b.content) {
          modified = true;
          return { ...b, content: nextContent };
        }
      }
      return b;
    });

    if (modified) {
      await db.collection('proposals').updateOne(
        { _id: p._id },
        { $set: { blocks } }
      );
      propUpdated++;
      console.log(`✓ Updated proposal: "${p.proposalNumber || p.title}" (${p._id})`);
    }
  }
  console.log(`Total Proposals updated: ${propUpdated}/${props.length}`);

  process.exit(0);
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
