#!/usr/bin/env node
// Convert PDF pages to PNG images.
// Usage: node convert_pdf_to_images.js <input.pdf> <output_directory>

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { createCanvas } from "canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const MAX_DIM = 1000;

async function convert(pdfPath, outputDir) {
  mkdirSync(outputDir, { recursive: true });

  const data = new Uint8Array(readFileSync(pdfPath));
  const pdf = await getDocument({ data, useSystemFonts: true }).promise;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    // Render at scale ~200 DPI (default viewport is 72 DPI)
    let scale = 200 / 72;
    let viewport = page.getViewport({ scale });

    // Down-scale if larger than MAX_DIM
    if (viewport.width > MAX_DIM || viewport.height > MAX_DIM) {
      const shrink = Math.min(MAX_DIM / viewport.width, MAX_DIM / viewport.height);
      scale *= shrink;
      viewport = page.getViewport({ scale });
    }

    const canvas = createCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
    const ctx = canvas.getContext("2d");

    await page.render({ canvasContext: ctx, viewport }).promise;

    const outPath = `${outputDir}/page_${i}.png`;
    writeFileSync(outPath, canvas.toBuffer("image/png"));
    console.log(`Saved page ${i} as ${outPath} (size: ${canvas.width}x${canvas.height})`);
  }

  console.log(`Converted ${pdf.numPages} pages to PNG images`);
}

if (process.argv.length !== 4) {
  console.log("Usage: node convert_pdf_to_images.js <input.pdf> <output_directory>");
  process.exit(1);
}

await convert(process.argv[2], process.argv[3]);
