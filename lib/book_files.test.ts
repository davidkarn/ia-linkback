import { describe, expect, it } from '@jest/globals';
import { ocrFolderName, pdfFileName } from './book_files.ts';

describe('pdfFileName', () => {
  it('is the last part of the pdf url, still URL-encoded', () => {
    expect(pdfFileName('https://archive.org/download/trinity0000revf/trinity0000revf.pdf')).toBe('trinity0000revf.pdf');
    expect(pdfFileName('https://archive.org/download/x/1.%20Logica%20-%20Hugon.pdf')).toBe('1.%20Logica%20-%20Hugon.pdf');
  });
});

describe('ocrFolderName', () => {
  it('drops ".pdf"', () => {
    expect(ocrFolderName('https://archive.org/download/x/christologyadog00pohlgoog.pdf')).toBe('christologyadog00pohlgoog');
  });

  it('turns other dots into "_", so surya gives each book its own folder', () => {
    expect(ocrFolderName('https://archive.org/download/x/2015.932.Types-Of-Philosophy-1929.pdf'))
      .toBe('2015_932_Types-Of-Philosophy-1929');
  });
});
