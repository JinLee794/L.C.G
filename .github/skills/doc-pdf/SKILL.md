---
name: doc-pdf
description: "Read, extract, create, merge, split, rotate, watermark, encrypt, OCR, or fill forms in PDF files. Triggers: any mention of \".pdf\", \"PDF\", or requests to extract text/tables from PDFs, combine/merge PDFs, split pages, create new PDFs, fill PDF forms, add watermarks, encrypt/decrypt, extract images, or OCR scanned documents. Do NOT use for Word documents (use doc-word skill), spreadsheets (use doc-spreadsheet skill), or PowerPoint files."
argument-hint: 'Provide the path to the PDF file and describe what operation to perform'
---

# PDF Processing Guide

## Node.js Environment

All scripts in this skill are Node.js (ESM). Install dependencies once from the workspace root:

```bash
npm install pdf-lib pdfjs-dist canvas
```

- `pdf-lib` — read/write/fill PDFs, embed text annotations
- `pdfjs-dist` — extract text, structure, and render pages
- `canvas` — server-side Canvas for image rendering and validation overlays

> **Note:** `canvas` requires native build tools (`python3`, `make`, `g++` / Xcode CLT).
> On macOS: `xcode-select --install`. On Ubuntu: `sudo apt-get install build-essential libcairo2-dev libjpeg-dev libpango1.0-dev libgif-dev`.

**Temp file cleanup — MANDATORY:**
- All temp scripts MUST use `.tmp_` prefix (e.g., `.tmp_merge_pdfs.mjs`)
- After the task completes, delete ALL `.tmp_*` files autonomously — never leave them behind, never ask the user
---

## Overview

This guide covers PDF processing using Python libraries and command-line tools. For advanced features and JavaScript libraries, see [reference.md](reference.md). For PDF form filling, see [forms.md](forms.md).

**Output directory**: Resolve the output path using the three-tier logic in `shared-patterns.instructions.md` § Artifact Output Directory (skill OIL path → `LCG-Artifacts/` via OIL → `.copilot/docs/` fallback). Create the directory before writing if needed.

> **Note:** `scripts/` paths are relative to this skill folder (`.github/skills/pdf/`).

## Quick Reference

| Task | Best Tool | Key Code |
|------|-----------|----------|
| Read/extract text | pdfplumber | `page.extract_text()` |
| Extract tables | pdfplumber | `page.extract_tables()` |
| Merge PDFs | pypdf | `writer.add_page(page)` |
| Split PDFs | pypdf | One page per file |
| Create PDFs | reportlab | Canvas or Platypus |
| Rotate pages | pypdf | `page.rotate(90)` |
| Add watermark | pypdf | `page.merge_page(watermark)` |
| Encrypt/decrypt | pypdf | `writer.encrypt()` |
| OCR scanned PDFs | pytesseract | Convert to image first |
| Fill PDF forms | See [forms.md](forms.md) | Fillable or annotation-based |
| Command-line merge | qpdf | `qpdf --empty --pages ...` |

---

## Reading & Extracting

### Quick Start
```python
from pypdf import PdfReader

reader = PdfReader("document.pdf")
print(f"Pages: {len(reader.pages)}")

text = ""
for page in reader.pages:
    text += page.extract_text()
```

### Text with Layout (pdfplumber)
```python
import pdfplumber

with pdfplumber.open("document.pdf") as pdf:
    for page in pdf.pages:
        text = page.extract_text()
        print(text)
```

### Extract Tables
```python
import pdfplumber

with pdfplumber.open("document.pdf") as pdf:
    for i, page in enumerate(pdf.pages):
        tables = page.extract_tables()
        for j, table in enumerate(tables):
            print(f"Table {j+1} on page {i+1}:")
            for row in table:
                print(row)
```

### Tables to Excel
```python
import pdfplumber
import pandas as pd

with pdfplumber.open("document.pdf") as pdf:
    all_tables = []
    for page in pdf.pages:
        tables = page.extract_tables()
        for table in tables:
            if table:
                df = pd.DataFrame(table[1:], columns=table[0])
                all_tables.append(df)

if all_tables:
    combined_df = pd.concat(all_tables, ignore_index=True)
    combined_df.to_excel("extracted_tables.xlsx", index=False)
```

### Extract Metadata
```python
reader = PdfReader("document.pdf")
meta = reader.metadata
print(f"Title: {meta.title}, Author: {meta.author}, Pages: {len(reader.pages)}")
```

---

## Merging & Splitting

### Merge PDFs
```python
from pypdf import PdfWriter, PdfReader

writer = PdfWriter()
for pdf_file in ["doc1.pdf", "doc2.pdf", "doc3.pdf"]:
    reader = PdfReader(pdf_file)
    for page in reader.pages:
        writer.add_page(page)

with open("merged.pdf", "wb") as output:
    writer.write(output)
```

### Split PDF
```python
from pypdf import PdfReader, PdfWriter

reader = PdfReader("input.pdf")
for i, page in enumerate(reader.pages):
    writer = PdfWriter()
    writer.add_page(page)
    with open(f"page_{i+1}.pdf", "wb") as output:
        writer.write(output)
```

---

## Page Manipulation

### Rotate Pages
```python
from pypdf import PdfReader, PdfWriter

reader = PdfReader("input.pdf")
writer = PdfWriter()
page = reader.pages[0]
page.rotate(90)  # 90 degrees clockwise
writer.add_page(page)

with open("rotated.pdf", "wb") as output:
    writer.write(output)
```

### Add Watermark
```python
from pypdf import PdfReader, PdfWriter

watermark = PdfReader("watermark.pdf").pages[0]
reader = PdfReader("document.pdf")
writer = PdfWriter()

for page in reader.pages:
    page.merge_page(watermark)
    writer.add_page(page)

with open("watermarked.pdf", "wb") as output:
    writer.write(output)
```

---

## Creating PDFs (reportlab)

### Basic PDF
```python
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

c = canvas.Canvas("hello.pdf", pagesize=letter)
width, height = letter
c.drawString(100, height - 100, "Hello World!")
c.line(100, height - 140, 400, height - 140)
c.save()
```

### Multi-Page Report
```python
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import getSampleStyleSheet

doc = SimpleDocTemplate("report.pdf", pagesize=letter)
styles = getSampleStyleSheet()
story = []

story.append(Paragraph("Report Title", styles['Title']))
story.append(Spacer(1, 12))
story.append(Paragraph("Body content here. " * 20, styles['Normal']))
story.append(PageBreak())
story.append(Paragraph("Page 2", styles['Heading1']))

doc.build(story)
```

### Subscripts and Superscripts

**IMPORTANT**: Never use Unicode subscript/superscript characters in ReportLab. They render as black boxes. Use XML markup instead:

```python
from reportlab.platypus import Paragraph
from reportlab.lib.styles import getSampleStyleSheet
styles = getSampleStyleSheet()

chemical = Paragraph("H<sub>2</sub>O", styles['Normal'])
squared = Paragraph("x<super>2</super>", styles['Normal'])
```

---

## Security

### Encrypt PDF
```python
from pypdf import PdfReader, PdfWriter

reader = PdfReader("input.pdf")
writer = PdfWriter()
for page in reader.pages:
    writer.add_page(page)

writer.encrypt("userpassword", "ownerpassword")
with open("encrypted.pdf", "wb") as output:
    writer.write(output)
```

---

## OCR (Scanned PDFs)

```python
# Requires: pip install pytesseract pdf2image
# Also requires Tesseract OCR engine installed on system
import pytesseract
from pdf2image import convert_from_path

images = convert_from_path('scanned.pdf')
text = ""
for i, image in enumerate(images):
    text += f"Page {i+1}:\n"
    text += pytesseract.image_to_string(image)
    text += "\n\n"
```

---

## Extract Images

```bash
# Using pdfimages (poppler-utils)
pdfimages -j input.pdf output_prefix
# Extracts as output_prefix-000.jpg, output_prefix-001.jpg, etc.
```

---

## Command-Line Tools

### qpdf
```bash
qpdf --empty --pages file1.pdf file2.pdf -- merged.pdf     # Merge
qpdf input.pdf --pages . 1-5 -- pages1-5.pdf               # Extract pages
qpdf input.pdf output.pdf --rotate=+90:1                    # Rotate page 1
qpdf --password=mypassword --decrypt encrypted.pdf out.pdf  # Decrypt
```

### pdftotext (poppler-utils)
```bash
pdftotext input.pdf output.txt            # Extract text
pdftotext -layout input.pdf output.txt    # Preserve layout
pdftotext -f 1 -l 5 input.pdf output.txt # Pages 1-5 only
```

---

## PDF Form Filling

For form filling workflows, read [forms.md](forms.md) — it covers both fillable (AcroForm) and non-fillable (annotation-based) approaches with helper scripts.

---

## Next Steps

- [reference.md](reference.md) — Advanced pypdfium2, pdf-lib (JS), pdfjs-dist
- [forms.md](forms.md) — Complete form filling workflow with validation
