---
name: doc-word
description: 'Read, create, edit, or manipulate Word documents (.docx files) using Node.js. Extracts text and HTML from existing documents, generates new documents with rich formatting (tables, TOC, headers/footers, images, lists), and fills templates with dynamic data. Triggers: Word doc, word document, .docx, read Word file, create Word document, modify docx, generate report, memo, letter, document template, extract text from Word, write docx, tracked changes, comments, find-and-replace, tables of contents, headings, page numbers, letterheads. DO NOT USE FOR: PDFs (use doc-pdf skill), spreadsheets (use doc-spreadsheet skill), PowerPoint files (use doc-slides skill), general coding tasks.'
argument-hint: 'Provide file path and operation: read, create, or modify'
---

# Processing Word Documents

Read, create, and modify `.docx` files via Node.js scripts executed in the terminal.

**Output directory**: Resolve the output path using the three-tier logic in `shared-patterns.instructions.md` § Artifact Output Directory (skill OIL path → `LCG-Artifacts/` via OIL → `.copilot/docs/` fallback). Create the directory before writing if needed.

## Packages

| Package | Purpose | Install |
|---|---|---|
| `mammoth` | Read .docx → plain text or HTML | `npm install mammoth` |
| `docx` | Create new .docx programmatically | `npm install docx` |
| `docxtemplater` + `pizzip` | Fill templates in existing .docx | `npm install docxtemplater pizzip` |

Install only the packages needed for the requested operation. Use `npx` or a temporary script.

## Flow

### 1. Reading a Word Document

Extract text or HTML from an existing `.docx`:

```javascript
import mammoth from 'mammoth';

// Plain text extraction
const { value: text } = await mammoth.extractRawText({ path: inputPath });

// HTML extraction (preserves basic structure)
const { value: html } = await mammoth.convertToHtml({ path: inputPath });
```

- `extractRawText` strips all formatting — best for content analysis
- `convertToHtml` preserves headings, lists, tables, bold/italic
- Access `result.messages` for conversion warnings

### 2. Creating a Word Document

Build a new `.docx` with the `docx` package:

```javascript
import { Document, Packer, Paragraph, TextRun, HeadingLevel,
         Table, TableRow, TableCell, WidthType, ImageRun,
         AlignmentType, BorderStyle, Header, Footer,
         PageBreak, PageNumber, PageOrientation, LevelFormat,
         ExternalHyperlink, TableOfContents, ShadingType,
         VerticalAlign } from 'docx';
import { writeFileSync, readFileSync } from 'fs';

const doc = new Document({
  sections: [{
    properties: {},  // page size, margins, orientation
    children: [
      new Paragraph({ text: "Title", heading: HeadingLevel.HEADING_1 }),
      new Paragraph({
        children: [
          new TextRun({ text: "Bold", bold: true }),
          new TextRun(" normal "),
          new TextRun({ text: "italic", italics: true }),
        ],
      }),
      // Tables
      new Table({
        rows: [
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph("Cell 1")] }),
              new TableCell({ children: [new Paragraph("Cell 2")] }),
            ],
          }),
        ],
      }),
    ],
  }],
});

const buffer = await Packer.toBuffer(doc);
writeFileSync(outputPath, buffer);
```

Key building blocks: `Paragraph`, `TextRun`, `Table`, `TableRow`, `TableCell`, `ImageRun` (for images from buffer), `Header`, `Footer`, `PageBreak`, `NumberedList`, `BulletList`.

### Page Size

```javascript
// CRITICAL: docx-js defaults to A4, not US Letter
// Always set page size explicitly for consistent results
sections: [{
  properties: {
    page: {
      size: {
        width: 12240,   // 8.5 inches in DXA
        height: 15840   // 11 inches in DXA
      },
      margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } // 1 inch margins
    }
  },
  children: [/* content */]
}]
```

**Common page sizes (DXA units, 1440 DXA = 1 inch):**

| Paper        | Width  | Height | Content Width (1" margins) |
| ------------ | ------ | ------ | -------------------------- |
| US Letter    | 12,240 | 15,840 | 9,360                      |
| A4 (default) | 11,906 | 16,838 | 9,026                      |

**Landscape orientation:** docx-js swaps width/height internally, so pass portrait dimensions and let it handle the swap:

```javascript
size: {
  width: 12240,   // Pass SHORT edge as width
  height: 15840,  // Pass LONG edge as height
  orientation: PageOrientation.LANDSCAPE  // docx-js swaps them in the XML
},
```

### Styles (Override Built-in Headings)

Use Arial as the default font. Keep titles black for readability.

```javascript
const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 24 } } }, // 12pt default
    paragraphStyles: [
      // IMPORTANT: Use exact IDs to override built-in styles
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 240, after: 240 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 180, after: 180 }, outlineLevel: 1 } },
    ]
  },
  sections: [{ children: [/* content */] }]
});
```

### Lists (NEVER use unicode bullets)

```javascript
// ❌ WRONG - never manually insert bullet characters
new Paragraph({ children: [new TextRun("• Item")] })  // BAD

// ✅ CORRECT - use numbering config with LevelFormat.BULLET
const doc = new Document({
  numbering: {
    config: [
      { reference: "bullets",
        levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbers",
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ]
  },
  sections: [{
    children: [
      new Paragraph({ numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Bullet item")] }),
    ]
  }]
});
// ⚠️ Same reference = continues numbering. Different reference = restarts.
```

### Tables

**CRITICAL: Tables need dual widths** — set both `columnWidths` on the table AND `width` on each cell.

```javascript
// CRITICAL: Always use DXA (percentages break in Google Docs)
// CRITICAL: Use ShadingType.CLEAR (not SOLID) to prevent black backgrounds
const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };

new Table({
  width: { size: 9360, type: WidthType.DXA },
  columnWidths: [4680, 4680], // Must sum to table width
  rows: [
    new TableRow({
      children: [
        new TableCell({
          borders,
          width: { size: 4680, type: WidthType.DXA },
          shading: { fill: "D5E8F0", type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [new Paragraph({ children: [new TextRun("Cell")] })]
        })
      ]
    })
  ]
})
```

**Width rules:**
- **Always use `WidthType.DXA`** — never `WidthType.PERCENTAGE`
- Table width must equal the sum of `columnWidths`
- Cell `width` must match corresponding `columnWidth`

### Images

```javascript
// CRITICAL: type parameter is REQUIRED
new Paragraph({
  children: [new ImageRun({
    type: "png", // Required: png, jpg, jpeg, gif, bmp, svg
    data: readFileSync("image.png"),
    transformation: { width: 200, height: 150 },
    altText: { title: "Title", description: "Desc", name: "Name" } // All three required
  })]
})
```

### Page Breaks

```javascript
new Paragraph({ children: [new PageBreak()] })
// Or: new Paragraph({ pageBreakBefore: true, children: [new TextRun("New page")] })
```

### Table of Contents

```javascript
// CRITICAL: Headings must use HeadingLevel ONLY - no custom styles
new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" })
```

### Headers/Footers

```javascript
sections: [{
  properties: {
    page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } }
  },
  headers: {
    default: new Header({ children: [new Paragraph({ children: [new TextRun("Header")] })] })
  },
  footers: {
    default: new Footer({ children: [new Paragraph({
      children: [new TextRun("Page "), new TextRun({ children: [PageNumber.CURRENT] })]
    })] })
  },
  children: [/* content */]
}]
```

### Critical Rules for docx-js

- **Set page size explicitly** — defaults to A4; use US Letter (12240 × 15840 DXA) for US documents
- **Landscape: pass portrait dimensions** — docx-js swaps internally
- **Never use `\n`** — use separate Paragraph elements
- **Never use unicode bullets** — use `LevelFormat.BULLET` numbering
- **PageBreak must be in Paragraph** — standalone creates invalid XML
- **ImageRun requires `type`** — always specify png/jpg/etc
- **Always set table `width` with DXA** — never `WidthType.PERCENTAGE`
- **Tables need dual widths** — `columnWidths` array AND cell `width`, both must match
- **Use `ShadingType.CLEAR`** — never SOLID for table shading
- **TOC requires HeadingLevel only** — no custom styles on heading paragraphs
- **Override built-in styles** — use exact IDs: "Heading1", "Heading2", etc.
- **Include `outlineLevel`** — required for TOC (0 for H1, 1 for H2, etc.)

### 3. Modifying an Existing Document (Template Fill)

Replace `{placeholder}` tags in an existing `.docx`:

```javascript
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { readFileSync, writeFileSync } from 'fs';

const zip = new PizZip(readFileSync(templatePath));
const doc = new Docxtemplater(zip, {
  paragraphLoop: true,
  linebreaks: true,
});

doc.render({
  title: "Quarterly Report",
  date: "2025-03-01",
  items: [                          // loops: {#items}...{/items}
    { name: "Widget A", qty: 50 },
    { name: "Widget B", qty: 30 },
  ],
});

writeFileSync(outputPath, doc.getZip().generate({ type: 'nodebuffer' }));
```

- Simple values: `{tagName}`
- Loops: `{#items}{name} — {qty}{/items}`
- Conditionals: `{#showSection}...{/showSection}`

## Validation

After any operation, verify:
1. Output file exists and size > 0 bytes
2. For reads: extracted text is non-empty
3. Report output file path to user

## Gotchas

- `mammoth` cannot round-trip — it reads only, cannot write back changes
- `docx` creates from scratch only — cannot open and edit existing files
- For editing existing documents, use `docxtemplater` with a pre-tagged template
- All packages require `type: "module"` in package.json or `.mjs` extension for ESM imports
- Large images should be loaded as `Buffer` via `readFileSync` for `ImageRun`
