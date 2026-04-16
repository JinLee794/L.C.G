#!/usr/bin/env node
// Fill a non-fillable PDF by adding FreeText annotations.
// Usage: node fill_pdf_form_with_annotations.js <input.pdf> <fields.json> <output.pdf>

import { readFileSync, writeFileSync } from "fs";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

function transformFromImageCoords(bbox, imageWidth, imageHeight, pdfWidth, pdfHeight) {
  const xScale = pdfWidth / imageWidth;
  const yScale = pdfHeight / imageHeight;

  const left = bbox[0] * xScale;
  const right = bbox[2] * xScale;
  const top = pdfHeight - bbox[1] * yScale;
  const bottom = pdfHeight - bbox[3] * yScale;

  return [left, bottom, right, top];
}

function transformFromPdfCoords(bbox, pdfHeight) {
  const left = bbox[0];
  const right = bbox[2];
  // In source JSON, y increases downward (top-left origin)
  // In PDF, y increases upward — convert
  const pypdfTop = pdfHeight - bbox[1];
  const pypdfBottom = pdfHeight - bbox[3];

  return [left, pypdfBottom, right, pypdfTop];
}

function hexToRgb(hex) {
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  return rgb(r, g, b);
}

async function fillPdfForm(inputPath, fieldsJsonPath, outputPath) {
  const fieldsData = JSON.parse(readFileSync(fieldsJsonPath, "utf-8"));
  const pdfBytes = readFileSync(inputPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);

  // Get page dimensions from the PDF
  const pdfDimensions = {};
  for (let i = 0; i < pdfDoc.getPageCount(); i++) {
    const page = pdfDoc.getPage(i);
    const { width, height } = page.getSize();
    pdfDimensions[i + 1] = [width, height];
  }

  // Embed a standard font for annotations
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  let annotationCount = 0;

  for (const field of fieldsData.form_fields) {
    const pageNum = field.page_number;
    const pageInfo = fieldsData.pages.find((p) => p.page_number === pageNum);
    const [pdfWidth, pdfHeight] = pdfDimensions[pageNum];

    let entryBox;
    if ("pdf_width" in pageInfo) {
      entryBox = transformFromPdfCoords(field.entry_bounding_box, pdfHeight);
    } else {
      entryBox = transformFromImageCoords(
        field.entry_bounding_box,
        pageInfo.image_width,
        pageInfo.image_height,
        pdfWidth,
        pdfHeight
      );
    }

    if (!field.entry_text?.text) continue;

    const text = field.entry_text.text;
    const fontSize = field.entry_text.font_size ?? 14;
    const fontColor = field.entry_text.font_color
      ? hexToRgb(field.entry_text.font_color)
      : rgb(0, 0, 0);

    const page = pdfDoc.getPage(pageNum - 1);

    // entryBox = [left, bottom, right, top] in PDF coordinates
    const x = entryBox[0];
    const y = entryBox[1]; // bottom of box
    const boxHeight = entryBox[3] - entryBox[1];

    // Vertically center the text in the box
    const textY = y + (boxHeight - fontSize) / 2;

    page.drawText(text, {
      x,
      y: textY > y ? textY : y,
      size: fontSize,
      font,
      color: fontColor,
    });

    annotationCount++;
  }

  const outBytes = await pdfDoc.save();
  writeFileSync(outputPath, outBytes);

  console.log(`Successfully filled PDF form and saved to ${outputPath}`);
  console.log(`Added ${annotationCount} text annotations`);
}

if (process.argv.length !== 5) {
  console.log("Usage: node fill_pdf_form_with_annotations.js <input.pdf> <fields.json> <output.pdf>");
  process.exit(1);
}

await fillPdfForm(process.argv[2], process.argv[3], process.argv[4]);
