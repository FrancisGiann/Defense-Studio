import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { sourcesFromPages } from '../shared/sample';
import type { Paper } from '../shared/types';
import { AppError } from './errors';
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export async function ingestPdf(bytes: Buffer, filename: string): Promise<Paper> {
  if (bytes.length > MAX_UPLOAD_BYTES)
    throw new AppError(413, 'UPLOAD_SIZE', 'Choose a PDF smaller than 10 MB.');
  if (
    !filename.toLowerCase().endsWith('.pdf') ||
    !bytes.subarray(0, 1024).includes(Buffer.from('%PDF-'))
  )
    throw new AppError(
      400,
      'PDF_ONLY',
      'Choose a valid PDF. DOCX and image files are not supported.',
    );
  const pages = await new Promise<{ number: number; text: string }[]>((resolve, reject) => {
    const child = fork(fileURLToPath(new URL('./pdf-worker.ts', import.meta.url)), [], {
      execArgv: ['--max-old-space-size=192', '--import', 'tsx'],
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    let settled = false;
    const finish = (error?: AppError, pages?: { number: number; text: string }[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill('SIGKILL');
      error ? reject(error) : resolve(pages!);
    };
    const timer = setTimeout(
      () =>
        finish(
          new AppError(
            422,
            'EXTRACTION_TIMEOUT',
            'This PDF took too long to read. Try an optimized, text-based PDF.',
          ),
        ),
      25000,
    );
    child.on('message', (msg: any) => {
      if (msg.pages) finish(undefined, msg.pages);
      else {
        const explanations: Record<string, string> = {
          ENCRYPTED: 'Remove the password before uploading this PDF.',
          PAGE_LIMIT: 'Choose a PDF with 120 pages or fewer.',
          TEXT_LIMIT: 'This PDF contains too much text. Try a shorter chapter.',
          INVALID_PDF: 'This PDF could not be read. Export a fresh text-based PDF.',
        };
        finish(new AppError(422, msg.error, explanations[msg.error] || explanations.INVALID_PDF));
      }
    });
    child.on('error', () =>
      finish(new AppError(422, 'EXTRACTION_FAILED', 'The PDF reader could not start. Try again.')),
    );
    child.on('exit', () => {
      if (!settled)
        finish(
          new AppError(422, 'EXTRACTION_FAILED', 'The PDF reader stopped. Try an optimized PDF.'),
        );
    });
    child.send({ bytes: bytes.toString('base64') });
  });
  if (pages.every((p) => p.text.length < 30))
    throw new AppError(
      422,
      'SCANNED_PDF',
      'No readable text was found. Run OCR on the PDF, then upload the text-based version.',
    );
  const empty = pages.filter((p) => p.text.length < 30).map((p) => p.number);
  const safeName = filename.replace(/[^\p{L}\p{N} ._()-]/gu, '').slice(0, 160) || 'thesis.pdf';
  return {
    id: randomUUID(),
    title: safeName.replace(/\.pdf$/i, '').replace(/[_-]/g, ' '),
    filename: safeName,
    createdAt: new Date().toISOString(),
    pageCount: pages.length,
    sample: false,
    pages,
    sources: sourcesFromPages(pages),
    warnings: [
      'References use physical PDF pages, which may differ from printed page labels.',
      ...(empty.length
        ? [
            `Little or no text on physical pages ${empty.join(', ')}. Images, tables, or scans may not be fully extracted.`,
          ]
        : []),
    ],
  };
}
