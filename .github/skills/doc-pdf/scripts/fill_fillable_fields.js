#!/usr/bin/env node
// Fill fillable PDF form fields from a JSON file.
// Usage: node fill_fillable_fields.js <input.pdf> <field_values.json> <output.pdf>

import { readFileSync, writeFileSync } from "fs";
import { PDFDocument } from "pdf-lib";
import {
  PDFCheckBox,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
} from "pdf-lib";

function validationError(fieldObj, fieldValue, form) {
  const field = form.getField(fieldObj.field_id);
  if (field instanceof PDFCheckBox) {
    if (fieldValue !== "/Yes" && fieldValue !== "/Off" && fieldValue !== true && fieldValue !== false) {
      return `ERROR: Invalid value "${fieldValue}" for checkbox field "${fieldObj.field_id}". Use "/Yes" (or true) to check, "/Off" (or false) to uncheck.`;
    }
  } else if (field instanceof PDFRadioGroup) {
    const options = field.getOptions();
    if (!options.includes(fieldValue)) {
      return `ERROR: Invalid value "${fieldValue}" for radio group field "${fieldObj.field_id}". Valid values are: ${JSON.stringify(options)}`;
    }
  } else if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
    const options = field.getOptions();
    if (!options.includes(fieldValue)) {
      return `ERROR: Invalid value "${fieldValue}" for choice field "${fieldObj.field_id}". Valid values are: ${JSON.stringify(options)}`;
    }
  }
  return null;
}

async function fillPdfFields(inputPath, fieldsJsonPath, outputPath) {
  const fieldsData = JSON.parse(readFileSync(fieldsJsonPath, "utf-8"));
  const pdfBytes = readFileSync(inputPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const form = pdfDoc.getForm();

  // Build a lookup of existing fields
  const existingFields = {};
  for (const f of form.getFields()) {
    const widgets = f.acroField.getWidgets();
    const widget = widgets[0];
    let page = 1;
    if (widget) {
      const pages = pdfDoc.getPages();
      for (let i = 0; i < pages.length; i++) {
        const annots = pages[i].node.get("Annots" /* PDFName */);
        if (!annots) continue;
        const arr = pdfDoc.context.lookup(annots);
        if (!arr || typeof arr.size !== "function") continue;
        for (let j = 0; j < arr.size(); j++) {
          if (pdfDoc.context.lookup(arr.get(j)) === widget.dict) {
            page = i + 1;
            break;
          }
        }
      }
    }
    existingFields[f.getName()] = { page };
  }

  // Validate all fields first
  let hasError = false;
  for (const entry of fieldsData) {
    const existing = existingFields[entry.field_id];
    if (!existing) {
      console.log(`ERROR: \`${entry.field_id}\` is not a valid field ID`);
      hasError = true;
    } else if (entry.page !== existing.page) {
      console.log(`ERROR: Incorrect page number for \`${entry.field_id}\` (got ${entry.page}, expected ${existing.page})`);
      hasError = true;
    } else if ("value" in entry) {
      const err = validationError(entry, entry.value, form);
      if (err) {
        console.log(err);
        hasError = true;
      }
    }
  }
  if (hasError) process.exit(1);

  // Apply values
  for (const entry of fieldsData) {
    if (!("value" in entry)) continue;
    const field = form.getField(entry.field_id);

    if (field instanceof PDFCheckBox) {
      if (entry.value === "/Yes" || entry.value === true) {
        field.check();
      } else {
        field.uncheck();
      }
    } else if (field instanceof PDFRadioGroup) {
      field.select(entry.value);
    } else if (field instanceof PDFDropdown) {
      field.select(entry.value);
    } else if (field instanceof PDFOptionList) {
      field.select(entry.value);
    } else if (field instanceof PDFTextField) {
      field.setText(String(entry.value));
    }
  }

  form.updateFieldAppearances();

  const outBytes = await pdfDoc.save();
  writeFileSync(outputPath, outBytes);
  console.log(`Filled PDF saved to ${outputPath}`);
}

if (process.argv.length !== 5) {
  console.log("Usage: node fill_fillable_fields.js <input.pdf> <field_values.json> <output.pdf>");
  process.exit(1);
}

await fillPdfFields(process.argv[2], process.argv[3], process.argv[4]);
