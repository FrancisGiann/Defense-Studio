import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
process.on('message', async (message: { bytes: string }) => {
  let task: ReturnType<typeof getDocument> | undefined;
  try {
    task = getDocument({
      data: new Uint8Array(Buffer.from(message.bytes, 'base64')),
      useSystemFonts: false,
      disableFontFace: true,
      stopAtErrors: true,
    });
    const pdf = await task.promise;
    if (pdf.numPages > 120) throw new Error('PAGE_LIMIT');
    const pages: { number: number; text: string }[] = [];
    let chars = 0;
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n),
        content = await page.getTextContent();
      const text = content.items
        .map((item) =>
          'str' in item ? item.str + ('hasEOL' in item && item.hasEOL ? '\n' : ' ') : '',
        )
        .join('')
        .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
        .trim();
      chars += text.length;
      if (chars > 600000) throw new Error('TEXT_LIMIT');
      pages.push({ number: n, text });
      page.cleanup();
    }
    await task.destroy();
    process.send?.({ pages });
  } catch (e) {
    await task?.destroy().catch(() => {});
    const name = e instanceof Error ? e.name : '';
    const code = e instanceof Error ? e.message : '';
    process.send?.({
      error:
        name === 'PasswordException'
          ? 'ENCRYPTED'
          : ['PAGE_LIMIT', 'TEXT_LIMIT'].includes(code)
            ? code
            : 'INVALID_PDF',
    });
  } finally {
    process.disconnect?.();
  }
});
