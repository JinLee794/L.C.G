#!/usr/bin/env node
// Extract form structure (labels, lines, checkboxes) from a non-fillable PDF.
// Usage: node extract_form_structure.js <input.pdf> <output.json>

import { readFileSync, writeFileSync } from "fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

async function extractFormStructure(pdfPath) {
  const data = new Uint8Array(readFileSync(pdfPath));
  const pdf = await getDocument({ data, useSystemFonts: true }).promise;

  const structure = {
    pages: [],
    labels: [],
    lines: [],
    checkboxes: [],
    row_boundaries: [],
  };

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });

    structure.pages.push({
      page_number: pageNum,
      width: Math.round(viewport.width * 10) / 10,
      height: Math.round(viewport.height * 10) / 10,
    });

    // Extract text items (labels)
    const textContent = await page.getTextContent();
    for (const item of textContent.items) {
      if (!item.str || !item.str.trim()) continue;
      const tx = item.transform;
      // transform: [scaleX, skewY, skewX, scaleY, translateX, translateY]
      const x0 = tx[4];
      const y0 = tx[5];
      const w = item.width;
      const h = item.height;
      // Convert from PDF coords (origin bottom-left) to top-left origin
      const top = viewport.height - y0 - h;
      const bottom = viewport.height - y0;
      structure.labels.push({
        page: pageNum,
        text: item.str,
        x0: Math.round(x0 * 10) / 10,
        top: Math.round(top * 10) / 10,
        x1: Math.round((x0 + w) * 10) / 10,
        bottom: Math.round(bottom * 10) / 10,
      });
    }

    // Extract vector graphics (lines and rectangles) from operator list
    const opList = await page.getOperatorList();
    const OPS = (await import("pdfjs-dist/legacy/build/pdf.mjs")).OPS;

    // Track current transform and path state for line/rect detection
    const pathOps = [];
    let currentTransform = [1, 0, 0, 1, 0, 0];
    const transformStack = [];

    for (let i = 0; i < opList.fnArray.length; i++) {
      const fn = opList.fnArray[i];
      const args = opList.argsArray[i];

      if (fn === OPS.save) {
        transformStack.push([...currentTransform]);
      } else if (fn === OPS.restore) {
        currentTransform = transformStack.pop() || [1, 0, 0, 1, 0, 0];
      } else if (fn === OPS.transform) {
        currentTransform = multiplyTransforms(currentTransform, args);
      } else if (fn === OPS.constructPath) {
        // args[0] = sub-ops array, args[1] = coordinates array
        const subOps = args[0];
        const coords = args[1];
        let ci = 0;
        for (const subOp of subOps) {
          if (subOp === OPS.moveTo) {
            pathOps.push({ type: "moveTo", x: coords[ci], y: coords[ci + 1] });
            ci += 2;
          } else if (subOp === OPS.lineTo) {
            pathOps.push({ type: "lineTo", x: coords[ci], y: coords[ci + 1] });
            ci += 2;
          } else if (subOp === OPS.rectangle) {
            const rx = coords[ci], ry = coords[ci + 1];
            const rw = coords[ci + 2], rh = coords[ci + 3];
            pathOps.push({ type: "rect", x: rx, y: ry, w: rw, h: rh });
            ci += 4;
          } else {
            // Skip unknown sub-ops, consume 2 coords as best guess
            ci += 2;
          }
        }
      } else if (fn === OPS.fill || fn === OPS.eoFill || fn === OPS.stroke ||
                 fn === OPS.fillStroke || fn === OPS.eoFillStroke) {
        // Process accumulated path ops
        for (const pop of pathOps) {
          if (pop.type === "rect") {
            const absW = Math.abs(pop.w);
            const absH = Math.abs(pop.h);
            // Detect checkboxes: small roughly-square rectangles
            if (absW >= 5 && absW <= 15 && absH >= 5 && absH <= 15 && Math.abs(absW - absH) < 2) {
              const x0 = Math.min(pop.x, pop.x + pop.w);
              const y0 = Math.min(pop.y, pop.y + pop.h);
              const x1 = Math.max(pop.x, pop.x + pop.w);
              const y1 = Math.max(pop.y, pop.y + pop.h);
              const top = viewport.height - y1;
              const bottom = viewport.height - y0;
              structure.checkboxes.push({
                page: pageNum,
                x0: Math.round(x0 * 10) / 10,
                top: Math.round(top * 10) / 10,
                x1: Math.round(x1 * 10) / 10,
                bottom: Math.round(bottom * 10) / 10,
                center_x: Math.round(((x0 + x1) / 2) * 10) / 10,
                center_y: Math.round(((top + bottom) / 2) * 10) / 10,
              });
            }
            // Detect wide horizontal lines (flat rectangles)
            if (absW > viewport.width * 0.5 && absH < 3) {
              const y = viewport.height - pop.y;
              structure.lines.push({
                page: pageNum,
                y: Math.round(y * 10) / 10,
                x0: Math.round(pop.x * 10) / 10,
                x1: Math.round((pop.x + pop.w) * 10) / 10,
              });
            }
          }
        }

        // Also detect horizontal lines from moveTo→lineTo pairs
        for (let k = 0; k < pathOps.length - 1; k++) {
          if (pathOps[k].type === "moveTo" && pathOps[k + 1].type === "lineTo") {
            const dx = Math.abs(pathOps[k + 1].x - pathOps[k].x);
            const dy = Math.abs(pathOps[k + 1].y - pathOps[k].y);
            if (dx > viewport.width * 0.5 && dy < 1) {
              const y = viewport.height - pathOps[k].y;
              structure.lines.push({
                page: pageNum,
                y: Math.round(y * 10) / 10,
                x0: Math.round(Math.min(pathOps[k].x, pathOps[k + 1].x) * 10) / 10,
                x1: Math.round(Math.max(pathOps[k].x, pathOps[k + 1].x) * 10) / 10,
              });
            }
          }
        }

        pathOps.length = 0;
      }
    }
  }

  // Build row boundaries from horizontal lines
  const linesByPage = {};
  for (const line of structure.lines) {
    (linesByPage[line.page] ??= []).push(line.y);
  }
  for (const [page, yCoords] of Object.entries(linesByPage)) {
    const unique = [...new Set(yCoords)].sort((a, b) => a - b);
    for (let i = 0; i < unique.length - 1; i++) {
      structure.row_boundaries.push({
        page: Number(page),
        row_top: unique[i],
        row_bottom: unique[i + 1],
        row_height: Math.round((unique[i + 1] - unique[i]) * 10) / 10,
      });
    }
  }

  return structure;
}

function multiplyTransforms(t1, t2) {
  return [
    t1[0] * t2[0] + t1[2] * t2[1],
    t1[1] * t2[0] + t1[3] * t2[1],
    t1[0] * t2[2] + t1[2] * t2[3],
    t1[1] * t2[2] + t1[3] * t2[3],
    t1[0] * t2[4] + t1[2] * t2[5] + t1[4],
    t1[1] * t2[4] + t1[3] * t2[5] + t1[5],
  ];
}

if (process.argv.length !== 4) {
  console.log("Usage: node extract_form_structure.js <input.pdf> <output.json>");
  process.exit(1);
}

const pdfPath = process.argv[2];
const outputPath = process.argv[3];

console.log(`Extracting structure from ${pdfPath}...`);
const structure = await extractFormStructure(pdfPath);

writeFileSync(outputPath, JSON.stringify(structure, null, 2));

console.log(`Found:`);
console.log(`  - ${structure.pages.length} pages`);
console.log(`  - ${structure.labels.length} text labels`);
console.log(`  - ${structure.lines.length} horizontal lines`);
console.log(`  - ${structure.checkboxes.length} checkboxes`);
console.log(`  - ${structure.row_boundaries.length} row boundaries`);
console.log(`Saved to ${outputPath}`);
