#!/usr/bin/env node
// Check bounding boxes for intersections and size issues.
// Usage: node check_bounding_boxes.js <fields.json>

import { readFileSync } from "fs";

function rectsIntersect(r1, r2) {
  const disjointH = r1[0] >= r2[2] || r1[2] <= r2[0];
  const disjointV = r1[1] >= r2[3] || r1[3] <= r2[1];
  return !(disjointH || disjointV);
}

function getBoundingBoxMessages(fieldsData) {
  const messages = [];
  messages.push(`Read ${fieldsData.form_fields.length} fields`);

  const rectsAndFields = [];
  for (const f of fieldsData.form_fields) {
    rectsAndFields.push({ rect: f.label_bounding_box, rectType: "label", field: f });
    rectsAndFields.push({ rect: f.entry_bounding_box, rectType: "entry", field: f });
  }

  let hasError = false;
  for (let i = 0; i < rectsAndFields.length; i++) {
    const ri = rectsAndFields[i];
    for (let j = i + 1; j < rectsAndFields.length; j++) {
      const rj = rectsAndFields[j];
      if (ri.field.page_number === rj.field.page_number && rectsIntersect(ri.rect, rj.rect)) {
        hasError = true;
        if (ri.field === rj.field) {
          messages.push(
            `FAILURE: intersection between label and entry bounding boxes for \`${ri.field.description}\` (${JSON.stringify(ri.rect)}, ${JSON.stringify(rj.rect)})`
          );
        } else {
          messages.push(
            `FAILURE: intersection between ${ri.rectType} bounding box for \`${ri.field.description}\` (${JSON.stringify(ri.rect)}) and ${rj.rectType} bounding box for \`${rj.field.description}\` (${JSON.stringify(rj.rect)})`
          );
        }
        if (messages.length >= 20) {
          messages.push("Aborting further checks; fix bounding boxes and try again");
          return messages;
        }
      }
    }
    if (ri.rectType === "entry" && ri.field.entry_text) {
      const fontSize = ri.field.entry_text.font_size ?? 14;
      const entryHeight = ri.rect[3] - ri.rect[1];
      if (entryHeight < fontSize) {
        hasError = true;
        messages.push(
          `FAILURE: entry bounding box height (${entryHeight}) for \`${ri.field.description}\` is too short for the text content (font size: ${fontSize}). Increase the box height or decrease the font size.`
        );
        if (messages.length >= 20) {
          messages.push("Aborting further checks; fix bounding boxes and try again");
          return messages;
        }
      }
    }
  }

  if (!hasError) {
    messages.push("SUCCESS: All bounding boxes are valid");
  }
  return messages;
}

if (process.argv.length !== 3) {
  console.log("Usage: node check_bounding_boxes.js <fields.json>");
  process.exit(1);
}

const data = JSON.parse(readFileSync(process.argv[2], "utf-8"));
for (const msg of getBoundingBoxMessages(data)) {
  console.log(msg);
}
