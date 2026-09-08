// lib/exports.js
// Word / PDF / plain-text export of an estimate.

import { Document, Packer, Paragraph, HeadingLevel, Table, TableRow, TableCell,
         WidthType, AlignmentType, TextRun } from 'docx';
import PDFDocument from 'pdfkit';
import { supabase } from './supabase.js';
import { t } from './i18n.js';

// -------------------- helpers --------------------

async function loadEstimate(estimateId) {
  const { data: calc } = await supabase
    .from('estimate_calculations').select('*').eq('id', estimateId).maybeSingle();
  if (!calc) throw new Error(`Estimate ${estimateId} not found`);
  const { data: items } = await supabase
    .from('estimate_calculation_items').select('*').eq('calculation_id', estimateId)
    .order('position', { ascending: true });
  return { calc, items: items || [] };
}

function fmtMoney(n, currency) {
  if (n == null || isNaN(Number(n))) return '—';
  return `${Number(n).toFixed(2)} ${currency}`;
}

function fmtQty(qty, unit) {
  return `${Number(qty).toLocaleString('en-US')} ${unit}`;
}

// Naive Cyrillic → Latin transliteration for PDF (Helvetica has no Cyrillic).
const TRANSLIT = {
  а:'a', б:'b', в:'v', г:'g', д:'d', е:'e', ё:'yo', ж:'zh', з:'z', и:'i',
  й:'y', к:'k', л:'l', м:'m', н:'n', о:'o', п:'p', р:'r', с:'s', т:'t',
  у:'u', ф:'f', х:'kh', ц:'ts', ч:'ch', ш:'sh', щ:'shch', ъ:'', ы:'y', ь:'',
  э:'e', ю:'yu', я:'ya',
  // Serbian latin already latin; Cyrillic Serbian specific:
  ђ:'dj', ј:'j', љ:'lj', њ:'nj', ћ:'c', џ:'dz',
  // Ukrainian
  ї:'yi', і:'i', є:'ye', ґ:'g'
};
function transliterate(str) {
  return String(str || '').split('').map(ch => {
    const lower = ch.toLowerCase();
    if (TRANSLIT[lower] !== undefined) {
      const rep = TRANSLIT[lower];
      return ch === lower ? rep : rep.charAt(0).toUpperCase() + rep.slice(1);
    }
    // Drop any remaining non-Latin-1 characters that Helvetica can't render.
    const code = ch.charCodeAt(0);
    return code > 0x2ff ? '' : ch;
  }).join('');
}

// -------------------- WORD (.docx) --------------------

export async function generateWord(estimateId, langCode = 'en') {
  const { calc, items } = await loadEstimate(estimateId);
  const c = calc.currency;

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      t(langCode, 'export.col_num'),
      t(langCode, 'export.col_work'),
      t(langCode, 'export.col_qty'),
      t(langCode, 'export.col_labor_unit'),
      t(langCode, 'export.col_labor_total'),
      t(langCode, 'export.col_mat_total')
    ].map(txt => new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: txt, bold: true })] })]
    }))
  });

  const bodyRows = items.map((it, idx) => new TableRow({
    children: [
      String(idx + 1),
      it.work_name || '',
      fmtQty(it.quantity, it.unit),
      fmtMoney(it.labor_price, c),
      fmtMoney(it.labor_total, c),
      fmtMoney(it.materials_total, c)
    ].map(txt => new TableCell({ children: [new Paragraph(String(txt))] }))
  }));

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...bodyRows]
  });

  const doc = new Document({
    creator: 'smeta1239_bot',
    title: `Estimate #${calc.id}`,
    sections: [{
      children: [
        new Paragraph({
          text: t(langCode, 'export.title', { id: calc.id }),
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER
        }),
        new Paragraph(t(langCode, 'export.location', {
          country: calc.country || '—',
          city: calc.city || '—'
        })),
        new Paragraph(t(langCode, 'export.date', {
          date: new Date(calc.created_at).toISOString().slice(0, 10)
        })),
        new Paragraph(t(langCode, 'export.mode', { mode: calc.price_mode })),
        new Paragraph(' '),
        table,
        new Paragraph(' '),
        new Paragraph(t(langCode, 'export.total_labor',     { amount: fmtMoney(calc.total_labor, c) })),
        new Paragraph(t(langCode, 'export.total_materials', { amount: fmtMoney(calc.total_materials, c) })),
        new Paragraph(t(langCode, 'export.total_reserve',   { percent: calc.reserve_percent, amount: fmtMoney(calc.total_reserve, c) })),
        new Paragraph({
          children: [new TextRun({
            text: t(langCode, 'export.total_grand', { amount: fmtMoney(calc.total_grand, c) }),
            bold: true, size: 28
          })]
        }),
        new Paragraph(' '),
        new Paragraph({
          children: [new TextRun({
            text: t(langCode, 'export.disclaimer'),
            italics: true, size: 18
          })]
        })
      ]
    }]
  });

  return await Packer.toBuffer(doc);
}

// -------------------- PDF (.pdf) --------------------

export async function generatePdf(estimateId, langCode = 'en') {
  const { calc, items } = await loadEstimate(estimateId);
  const c = calc.currency;

  return await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks = [];
    doc.on('data', (d) => chunks.push(d));
    doc.on('end',  () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.font('Helvetica-Bold').fontSize(18).text(
      transliterate(t(langCode, 'export.title', { id: calc.id })),
      { align: 'center' }
    );
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(11);
    doc.text(transliterate(t(langCode, 'export.location', { country: calc.country || '-', city: calc.city || '-' })));
    doc.text(transliterate(t(langCode, 'export.date',     { date: new Date(calc.created_at).toISOString().slice(0, 10) })));
    doc.text(transliterate(t(langCode, 'export.mode',     { mode: calc.price_mode })));
    doc.moveDown();

    // Simple table
    doc.font('Helvetica-Bold').fontSize(10);
    const cols = [30, 240, 70, 70, 80]; // widths
    const startX = 40;
    let y = doc.y;
    const headers = ['#', 'Work', 'Qty', 'Labor', 'Total'];
    let x = startX;
    for (let i = 0; i < headers.length; i++) {
      doc.text(headers[i], x, y, { width: cols[i], align: i < 2 ? 'left' : 'right' });
      x += cols[i];
    }
    y = doc.y + 4;
    doc.moveTo(startX, y).lineTo(startX + cols.reduce((a, b) => a + b, 0), y).stroke();
    doc.font('Helvetica').fontSize(10);
    y += 4;

    for (let idx = 0; idx < items.length; idx++) {
      const it = items[idx];
      if (y > 780) { doc.addPage(); y = 50; }
      x = startX;
      const cells = [
        String(idx + 1),
        transliterate(it.work_name || ''),
        `${Number(it.quantity)} ${it.unit}`,
        it.labor_price != null ? `${Number(it.labor_price).toFixed(2)} ${c}` : '-',
        it.labor_total != null ? `${Number(it.labor_total).toFixed(2)} ${c}` : '-'
      ];
      const rowHeight = 16;
      for (let i = 0; i < cells.length; i++) {
        doc.text(cells[i], x, y, { width: cols[i], align: i < 2 ? 'left' : 'right' });
        x += cols[i];
      }
      y += rowHeight;
    }

    doc.moveDown(2);
    doc.font('Helvetica').fontSize(11);
    doc.text(transliterate(t(langCode, 'export.total_labor',     { amount: `${Number(calc.total_labor).toFixed(2)} ${c}` })));
    doc.text(transliterate(t(langCode, 'export.total_materials', { amount: `${Number(calc.total_materials).toFixed(2)} ${c}` })));
    doc.text(transliterate(t(langCode, 'export.total_reserve',   { percent: calc.reserve_percent, amount: `${Number(calc.total_reserve).toFixed(2)} ${c}` })));
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(14);
    doc.text(transliterate(t(langCode, 'export.total_grand',     { amount: `${Number(calc.total_grand).toFixed(2)} ${c}` })));
    doc.moveDown();
    doc.font('Helvetica-Oblique').fontSize(9);
    doc.text(transliterate(t(langCode, 'export.disclaimer')));

    doc.end();
  });
}

// -------------------- Plain text --------------------

export async function formatEstimateText(estimateId, langCode = 'en') {
  const { calc, items } = await loadEstimate(estimateId);
  const c = calc.currency;
  const lines = [];
  lines.push(t(langCode, 'export.title', { id: calc.id }));
  lines.push(t(langCode, 'export.location', { country: calc.country || '—', city: calc.city || '—' }));
  lines.push(t(langCode, 'export.date',     { date: new Date(calc.created_at).toISOString().slice(0, 10) }));
  lines.push(t(langCode, 'export.mode',     { mode: calc.price_mode }));
  lines.push('');
  items.forEach((it, idx) => {
    lines.push(`${idx + 1}. ${it.work_name} — ${fmtQty(it.quantity, it.unit)} × ${fmtMoney(it.labor_price, c)} = ${fmtMoney(it.labor_total, c)}`);
  });
  lines.push('');
  lines.push(t(langCode, 'export.total_labor',     { amount: fmtMoney(calc.total_labor, c) }));
  lines.push(t(langCode, 'export.total_materials', { amount: fmtMoney(calc.total_materials, c) }));
  lines.push(t(langCode, 'export.total_reserve',   { percent: calc.reserve_percent, amount: fmtMoney(calc.total_reserve, c) }));
  lines.push(t(langCode, 'export.total_grand',     { amount: fmtMoney(calc.total_grand, c) }));
  lines.push('');
  lines.push(t(langCode, 'export.disclaimer'));
  return lines.join('\n');
}
