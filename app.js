'use strict';

const MM_TO_POINTS = 72 / 25.4;
const PDF_LIB_SOURCES = [
  './vendor/pdf-lib.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js',
  'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js',
  'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js'
];

const $ = (id) => document.getElementById(id);
const form = $('bookletForm');
const fileInput = $('pdfFile');
const dropZone = $('dropZone');
const filePanel = $('filePanel');
const fileName = $('fileName');
const fileMeta = $('fileMeta');
const removeFile = $('removeFile');
const addTitle = $('addTitle');
const titleFields = $('titleFields');
const titleText = $('titleText');
const subtitleText = $('subtitleText');
const addLined = $('addLined');
const lineFields = $('lineFields');
const lineSpacing = $('lineSpacing');
const pageMargin = $('pageMargin');
const addMarginLine = $('addMarginLine');
const padFour = $('padFour');
const sourcePages = $('sourcePages');
const outputPages = $('outputPages');
const outputName = $('outputName');
const createButton = $('createButton');
const buttonText = $('buttonText');
const progressWrap = $('progressWrap');
const progressBar = $('progressBar');
const progressText = $('progressText');
const statusBox = $('statusBox');

let selectedFile = null;
let selectedBytes = null;
let selectedPageCount = 0;
let libraryPromise = null;
let working = false;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      reject(new Error(`Could not load ${src}`));
    };
    document.head.appendChild(script);
  });
}

async function ensurePdfLib() {
  if (window.PDFLib) return window.PDFLib;
  if (libraryPromise) return libraryPromise;

  libraryPromise = (async () => {
    for (const source of PDF_LIB_SOURCES) {
      try {
        await loadScript(source);
        if (window.PDFLib) return window.PDFLib;
      } catch (_) {
        // Try the next source. This helps on networks that block one CDN.
      }
    }
    throw new Error('The PDF processing library could not be loaded. Your school network may be blocking the required script. Try refreshing or using another network once.');
  })();

  try {
    return await libraryPromise;
  } catch (error) {
    libraryPromise = null;
    throw error;
  }
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : value >= 10 ? 1 : 2)} ${units[unit]}`;
}

function filenameStem(name) {
  return name.replace(/\.pdf$/i, '').replace(/[\s_-]+/g, ' ').trim();
}

function titleCase(value) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function safeFilename(value) {
  const cleaned = value
    .replace(/\.pdf$/i, '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
    .trim()
    .replace(/[. ]+$/g, '');
  return cleaned || 'practice_booklet';
}

function currentPairing() {
  return form.elements.pairing.value;
}

function estimatePages() {
  if (!selectedPageCount) {
    outputPages.textContent = '—';
    return;
  }

  let total = selectedPageCount;
  if (addLined.checked) total += selectedPageCount;
  if (addTitle.checked) {
    total += 1;
    if (currentPairing() === 'duplex') total += 1;
  }
  if (padFour.checked) total += (4 - (total % 4)) % 4;
  outputPages.textContent = String(total);
}

function syncOptionVisibility() {
  titleFields.classList.toggle('is-disabled', !addTitle.checked);
  for (const input of titleFields.querySelectorAll('input')) input.disabled = !addTitle.checked;

  lineFields.classList.toggle('is-disabled', !addLined.checked);
  for (const input of lineFields.querySelectorAll('input')) input.disabled = !addLined.checked;
  estimatePages();
}

function setStatus(message, type = '') {
  if (!message) {
    statusBox.hidden = true;
    statusBox.textContent = '';
    statusBox.className = 'status-box';
    return;
  }
  statusBox.hidden = false;
  statusBox.textContent = message;
  statusBox.className = `status-box ${type}`.trim();
}

function setProgress(percent, message) {
  progressWrap.hidden = false;
  progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  progressText.textContent = message;
}

function setWorking(isWorking) {
  working = isWorking;
  createButton.disabled = isWorking || !selectedFile || !selectedPageCount;
  fileInput.disabled = isWorking;
  removeFile.disabled = isWorking;
  for (const element of form.querySelectorAll('input:not(#pdfFile), button:not(#createButton):not(#removeFile)')) {
    element.disabled = isWorking || (titleFields.contains(element) && !addTitle.checked) || (lineFields.contains(element) && !addLined.checked);
  }
  buttonText.textContent = isWorking ? 'Creating PDF…' : selectedFile ? 'Create and download PDF' : 'Choose a PDF first';
}

async function readSelectedFile(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
    setStatus('Please choose a PDF file.', 'error');
    return;
  }

  selectedFile = file;
  selectedBytes = null;
  selectedPageCount = 0;
  fileName.textContent = file.name;
  fileMeta.textContent = `${formatBytes(file.size)} · Reading PDF…`;
  dropZone.hidden = true;
  filePanel.hidden = false;
  sourcePages.textContent = '…';
  outputPages.textContent = '…';
  setStatus('');
  createButton.disabled = true;
  buttonText.textContent = 'Reading PDF…';

  const stem = filenameStem(file.name);
  const suggestedTitle = titleCase(stem);
  if (titleText.value === 'Practice Questions' || !titleText.value.trim()) titleText.value = suggestedTitle || 'Practice Questions';
  outputName.value = `${safeFilename(stem.replace(/\s+/g, '_'))}_practice_booklet`;

  try {
    const { PDFDocument } = await ensurePdfLib();
    selectedBytes = new Uint8Array(await file.arrayBuffer());
    const sourceDoc = await PDFDocument.load(selectedBytes);
    selectedPageCount = sourceDoc.getPageCount();
    if (!selectedPageCount) throw new Error('The selected PDF contains no pages.');

    sourcePages.textContent = String(selectedPageCount);
    fileMeta.textContent = `${formatBytes(file.size)} · ${selectedPageCount} page${selectedPageCount === 1 ? '' : 's'}`;
    estimatePages();
    setWorking(false);
  } catch (error) {
    selectedBytes = null;
    selectedPageCount = 0;
    sourcePages.textContent = '—';
    outputPages.textContent = '—';
    createButton.disabled = true;
    buttonText.textContent = 'Choose another PDF';
    const message = String(error?.message || error);
    const friendly = /encrypt/i.test(message)
      ? 'This PDF appears to be password-protected or encrypted, which this browser tool cannot process.'
      : `The PDF could not be opened. ${message}`;
    setStatus(friendly, 'error');
  }
}

function clearFile() {
  selectedFile = null;
  selectedBytes = null;
  selectedPageCount = 0;
  fileInput.value = '';
  dropZone.hidden = false;
  filePanel.hidden = true;
  sourcePages.textContent = '—';
  outputPages.textContent = '—';
  setProgress(0, 'Preparing…');
  progressWrap.hidden = true;
  setStatus('');
  setWorking(false);
}

function displayedPageSize(page) {
  const { width, height } = page.getSize();
  const angle = ((page.getRotation().angle % 360) + 360) % 360;
  return angle === 90 || angle === 270
    ? { width: height, height: width }
    : { width, height };
}

function safePdfText(value) {
  return String(value || '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
}

function wrapText(text, font, size, maxWidth) {
  const words = safePdfText(text).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let line = words[0];

  for (const word of words.slice(1)) {
    const candidate = `${line} ${word}`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  lines.push(line);
  return lines;
}

function addLinedPage(doc, width, height, options) {
  const { rgb } = window.PDFLib;
  const page = doc.addPage([width, height]);
  const spacing = Math.max(4, options.spacingMm) * MM_TO_POINTS;
  const margin = Math.max(5, options.marginMm) * MM_TO_POINTS;
  const topGap = Math.max(8, 18) * MM_TO_POINTS;
  const right = Math.max(margin, width - margin);
  let y = height - topGap;

  while (y >= margin) {
    page.drawLine({
      start: { x: margin, y },
      end: { x: right, y },
      thickness: 0.45,
      color: rgb(0.66, 0.70, 0.75)
    });
    y -= spacing;
  }

  if (options.addMarginLine) {
    const x = Math.min(width - margin - 2, margin + 12 * MM_TO_POINTS);
    if (x > margin) {
      page.drawLine({
        start: { x, y: margin },
        end: { x, y: height - topGap + spacing * 0.35 },
        thickness: 0.65,
        color: rgb(0.82, 0.55, 0.55)
      });
    }
  }
  return page;
}

function addTitlePage(doc, width, height, fonts, title, subtitle) {
  const { rgb } = window.PDFLib;
  const page = doc.addPage([width, height]);
  const centreX = width / 2;
  const maxWidth = width * 0.72;
  let titleSize = Math.min(26, Math.max(18, width / 23));
  let titleLines = wrapText(title || 'Practice Questions', fonts.bold, titleSize, maxWidth);

  while (titleLines.length > 4 && titleSize > 16) {
    titleSize -= 1;
    titleLines = wrapText(title || 'Practice Questions', fonts.bold, titleSize, maxWidth);
  }

  const lineHeight = titleSize * 1.3;
  let y = height * 0.69;
  for (const line of titleLines) {
    const lineWidth = fonts.bold.widthOfTextAtSize(line, titleSize);
    page.drawText(line, {
      x: centreX - lineWidth / 2,
      y,
      size: titleSize,
      font: fonts.bold,
      color: rgb(0.10, 0.10, 0.10)
    });
    y -= lineHeight;
  }

  const safeSubtitle = safePdfText(subtitle).trim();
  if (safeSubtitle) {
    y -= 6;
    const subtitleSize = Math.min(14, Math.max(10, width / 42));
    const subtitleLines = wrapText(safeSubtitle, fonts.regular, subtitleSize, maxWidth);
    for (const line of subtitleLines.slice(0, 3)) {
      const lineWidth = fonts.regular.widthOfTextAtSize(line, subtitleSize);
      page.drawText(line, {
        x: centreX - lineWidth / 2,
        y,
        size: subtitleSize,
        font: fonts.regular,
        color: rgb(0.30, 0.30, 0.30)
      });
      y -= subtitleSize * 1.35;
    }
  }

  const left = width * 0.22;
  const right = width * 0.78;
  const nameY = height * 0.25;
  const labelSize = Math.min(11, Math.max(8, width / 52));
  page.drawLine({ start: { x: left, y: nameY }, end: { x: right, y: nameY }, thickness: 0.65, color: rgb(0.35, 0.35, 0.35) });
  page.drawText('Name', { x: left, y: nameY + 6, size: labelSize, font: fonts.regular, color: rgb(0.25, 0.25, 0.25) });

  const dateY = nameY - Math.min(46, height * 0.07);
  page.drawLine({ start: { x: left, y: dateY }, end: { x: right, y: dateY }, thickness: 0.65, color: rgb(0.35, 0.35, 0.35) });
  page.drawText('Date', { x: left, y: dateY + 6, size: labelSize, font: fonts.regular, color: rgb(0.25, 0.25, 0.25) });
  return page;
}

async function createBooklet() {
  if (!selectedBytes || !selectedPageCount || working) return;
  setWorking(true);
  setStatus('');
  setProgress(4, 'Loading the original PDF…');

  try {
    const { PDFDocument, StandardFonts } = await ensurePdfLib();
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const sourceDoc = await PDFDocument.load(selectedBytes);
    const outputDoc = await PDFDocument.create();
    const regular = await outputDoc.embedFont(StandardFonts.Helvetica);
    const bold = await outputDoc.embedFont(StandardFonts.HelveticaBold);
    const source = sourceDoc.getPages();
    const firstSize = displayedPageSize(source[0]);

    if (addTitle.checked) {
      addTitlePage(outputDoc, firstSize.width, firstSize.height, { regular, bold }, titleText.value.trim(), subtitleText.value.trim());
      if (currentPairing() === 'duplex') outputDoc.addPage([firstSize.width, firstSize.height]);
    }

    const copiedPages = await outputDoc.copyPages(sourceDoc, source.map((_, index) => index));
    let lastSize = firstSize;

    for (let index = 0; index < copiedPages.length; index += 1) {
      outputDoc.addPage(copiedPages[index]);
      lastSize = displayedPageSize(source[index]);
      if (addLined.checked) {
        addLinedPage(outputDoc, lastSize.width, lastSize.height, {
          spacingMm: Number(lineSpacing.value),
          marginMm: Number(pageMargin.value),
          addMarginLine: addMarginLine.checked
        });
      }
      const percent = 14 + Math.round(((index + 1) / copiedPages.length) * 67);
      setProgress(percent, `Adding writing pages… ${index + 1} of ${copiedPages.length}`);
      if (index % 4 === 0) await new Promise((resolve) => requestAnimationFrame(resolve));
    }

    if (padFour.checked) {
      while (outputDoc.getPageCount() % 4 !== 0) outputDoc.addPage([lastSize.width, lastSize.height]);
    }

    outputDoc.setTitle(safePdfText(titleText.value.trim() || filenameStem(selectedFile.name)));
    outputDoc.setProducer('Practice PDF Booklet Maker');
    outputDoc.setCreator('Practice PDF Booklet Maker web app');

    setProgress(88, 'Building the downloadable PDF…');
    const pdfBytes = await outputDoc.save({ useObjectStreams: true });
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const download = document.createElement('a');
    download.href = url;
    download.download = `${safeFilename(outputName.value)}.pdf`;
    document.body.appendChild(download);
    download.click();
    download.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);

    setProgress(100, 'Finished — the download should have started.');
    setStatus(`Created ${outputDoc.getPageCount()} pages. The PDF was processed locally and has been downloaded.`, 'success');
  } catch (error) {
    const message = String(error?.message || error);
    const friendly = /encrypt/i.test(message)
      ? 'This PDF is encrypted or password-protected and cannot be processed by this tool.'
      : `Could not create the booklet: ${message}`;
    setStatus(friendly, 'error');
    progressWrap.hidden = true;
  } finally {
    setWorking(false);
    syncOptionVisibility();
  }
}

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    fileInput.click();
  }
});
fileInput.addEventListener('change', () => readSelectedFile(fileInput.files[0]));
removeFile.addEventListener('click', clearFile);

for (const eventName of ['dragenter', 'dragover']) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add('dragging');
  });
}
for (const eventName of ['dragleave', 'drop']) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove('dragging');
  });
}
dropZone.addEventListener('drop', (event) => readSelectedFile(event.dataTransfer.files[0]));

addTitle.addEventListener('change', syncOptionVisibility);
addLined.addEventListener('change', syncOptionVisibility);
padFour.addEventListener('change', estimatePages);
for (const radio of form.elements.pairing) radio.addEventListener('change', estimatePages);
form.addEventListener('submit', (event) => {
  event.preventDefault();
  createBooklet();
});

syncOptionVisibility();
setWorking(false);
