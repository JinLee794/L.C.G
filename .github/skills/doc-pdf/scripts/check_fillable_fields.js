#!/usr/bin/env node
// Check if a PDF has fillable form fields.
// Usage: node check_fillable_fields.js <file.pdf>

import { readFileSync } from "fs";
import { PDFDocument } from "pdf-lib";

if (process.argv.length !== 3) {
  console.log("Usage: node check_fillable_fields.js <file.pdf>");
  process.exit(1);
}

const pdfBytes = readFileSync(process.argv[2]);
const pdfDoc = await PDFDocument.load(pdfBytes);
const form = pdfDoc.getForm();
const fields = form.getFields();

if (fields.length > 0) {
  console.log("This PDF has fillable form fields");
} else {
  console.log("This PDF does not have fillable form fields; you will need to visually determine where to enter data");
}
