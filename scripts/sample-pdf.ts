import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { writeFileSync } from 'node:fs';
import { SAMPLE_PAGES } from '../shared/sample';
const doc = await PDFDocument.create(),
  font = await doc.embedFont(StandardFonts.TimesRoman),
  bold = await doc.embedFont(StandardFonts.TimesRomanBold);
for (const [index, text] of SAMPLE_PAGES.entries()) {
  const page = doc.addPage([595, 842]);
  let y = 765;
  for (const [lineIndex, paragraph] of text.split('\n').entries()) {
    const words = paragraph.split(' ');
    let line = '';
    const size = lineIndex === 0 ? 20 : 12;
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > 460 && line) {
        page.drawText(line, {
          x: 66,
          y,
          size,
          font: lineIndex === 0 ? bold : font,
          color: rgb(0.15, 0.22, 0.18),
        });
        y -= size * 1.75;
        line = word;
      } else line = next;
    }
    if (line) {
      page.drawText(line, {
        x: 66,
        y,
        size,
        font: lineIndex === 0 ? bold : font,
        color: rgb(0.15, 0.22, 0.18),
      });
      y -= size * 1.75;
    }
    y -= 17;
  }
  page.drawText(`SYNTHETIC TEACHING PAPER - physical page ${index + 1}`, {
    x: 66,
    y: 48,
    size: 9,
    font,
    color: rgb(0.35, 0.4, 0.3),
  });
}
writeFileSync('public/sample-thesis.pdf', await doc.save());
