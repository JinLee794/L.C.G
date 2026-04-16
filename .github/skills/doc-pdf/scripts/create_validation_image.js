#!/usr/bin/env node
// Draw bounding-box rectangles on a page image for visual validation.
// Usage: node create_validation_image.js <page_number> <fields.json> <input_image> <output_image>

import { readFileSync, writeFileSync } from "fs";
import { createCanvas, loadImage } from "canvas";

async function createValidationImage(pageNumber, fieldsJsonPath, inputPath, outputPath) {
  const data = JSON.parse(readFileSync(fieldsJsonPath, "utf-8"));
  const img = await loadImage(inputPath);

  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  let numBoxes = 0;
  for (const field of data.form_fields) {
    if (field.page_number !== pageNumber) continue;

    const entry = field.entry_bounding_box;
    const label = field.label_bounding_box;

    // Draw entry box in red
    ctx.strokeStyle = "red";
    ctx.lineWidth = 2;
    ctx.strokeRect(entry[0], entry[1], entry[2] - entry[0], entry[3] - entry[1]);

    // Draw label box in blue
    ctx.strokeStyle = "blue";
    ctx.lineWidth = 2;
    ctx.strokeRect(label[0], label[1], label[2] - label[0], label[3] - label[1]);

    numBoxes += 2;
  }

  writeFileSync(outputPath, canvas.toBuffer("image/png"));
  console.log(`Created validation image at ${outputPath} with ${numBoxes} bounding boxes`);
}

if (process.argv.length !== 6) {
  console.log("Usage: node create_validation_image.js <page_number> <fields.json> <input_image> <output_image>");
  process.exit(1);
}

await createValidationImage(
  parseInt(process.argv[2], 10),
  process.argv[3],
  process.argv[4],
  process.argv[5]
);
