#!/usr/bin/env node
// Extract fillable form field info from a PDF.
// Usage: node extract_form_field_info.js <input.pdf> <output.json>

import { readFileSync, writeFileSync } from "fs";
import { PDFDocument } from "pdf-lib";
import {
  PDFCheckBox,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
} from "pdf-lib";

function getFieldInfo(form, pdfDoc) {
  const fields = form.getFields();
  const results = [];

  for (const field of fields) {
    const name = field.getName();
    const widgets = field.acroField.getWidgets();

    if (field instanceof PDFRadioGroup) {
      // Radio groups: collect all option widgets
      const options = field.getOptions();
      const radioOptions = [];
      for (let w = 0; w < widgets.length; w++) {
        const widget = widgets[w];
        const rect = widget.getRectangle();
        // Find which page this widget is on
        const pageIndex = findWidgetPage(pdfDoc, widget);
        radioOptions.push({
          value: options[w] ?? `/${w}`,
          rect: rect ? [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height] : null,
        });
      }
      const firstWidget = widgets[0];
      const pageIndex = findWidgetPage(pdfDoc, firstWidget);
      results.push({
        field_id: name,
        type: "radio_group",
        page: pageIndex + 1,
        radio_options: radioOptions,
      });
    } else if (field instanceof PDFCheckBox) {
      const widget = widgets[0];
      const pageIndex = findWidgetPage(pdfDoc, widget);
      const rect = widget.getRectangle();
      results.push({
        field_id: name,
        type: "checkbox",
        page: pageIndex + 1,
        rect: rect ? [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height] : null,
        checked_value: "/Yes",
        unchecked_value: "/Off",
      });
    } else if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
      const widget = widgets[0];
      const pageIndex = findWidgetPage(pdfDoc, widget);
      const rect = widget.getRectangle();
      const options = field.getOptions();
      results.push({
        field_id: name,
        type: "choice",
        page: pageIndex + 1,
        rect: rect ? [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height] : null,
        choice_options: options.map((o) => ({ value: o, text: o })),
      });
    } else if (field instanceof PDFTextField) {
      const widget = widgets[0];
      const pageIndex = findWidgetPage(pdfDoc, widget);
      const rect = widget.getRectangle();
      results.push({
        field_id: name,
        type: "text",
        page: pageIndex + 1,
        rect: rect ? [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height] : null,
      });
    } else {
      const widget = widgets[0];
      const pageIndex = widget ? findWidgetPage(pdfDoc, widget) : 0;
      const rect = widget?.getRectangle();
      results.push({
        field_id: name,
        type: "unknown",
        page: pageIndex + 1,
        rect: rect ? [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height] : null,
      });
    }
  }

  // Sort by page then vertical position (descending Y = top of page first)
  results.sort((a, b) => {
    const pa = a.page;
    const pb = b.page;
    if (pa !== pb) return pa - pb;
    const ra = a.rect ?? a.radio_options?.[0]?.rect ?? [0, 0, 0, 0];
    const rb = b.rect ?? b.radio_options?.[0]?.rect ?? [0, 0, 0, 0];
    // Higher Y = higher on page in PDF coords → sort descending
    return -ra[1] + rb[1] || ra[0] - rb[0];
  });

  return results;
}

function findWidgetPage(pdfDoc, widget) {
  const pages = pdfDoc.getPages();
  const widgetRef = widget.dict;
  for (let i = 0; i < pages.length; i++) {
    const annots = pages[i].node.lookupMaybe(
      pages[i].node.get("Annots")?.constructor?.name === "PDFArray"
        ? undefined
        : undefined
    );
    // Walk annotations on each page to find the widget
    const annotsArray = pages[i].node.get("Annots" /* PDFName */);
    if (!annotsArray) continue;
    // annotsArray is a PDFArray of refs
    const context = pdfDoc.context;
    const arr = context.lookup(annotsArray);
    if (!arr || typeof arr.size !== "function") continue;
    for (let j = 0; j < arr.size(); j++) {
      const ref = arr.get(j);
      const resolved = context.lookup(ref);
      if (resolved === widgetRef) return i;
    }
  }
  return 0;
}

if (process.argv.length !== 4) {
  console.log("Usage: node extract_form_field_info.js <input.pdf> <output.json>");
  process.exit(1);
}

const pdfBytes = readFileSync(process.argv[2]);
const pdfDoc = await PDFDocument.load(pdfBytes);
const form = pdfDoc.getForm();
const fieldInfo = getFieldInfo(form, pdfDoc);

writeFileSync(process.argv[3], JSON.stringify(fieldInfo, null, 2));
console.log(`Wrote ${fieldInfo.length} fields to ${process.argv[3]}`);
