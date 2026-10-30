# OCR Runtime Requirements (SolarIQ+ Electricity Bill OCR)

The bill OCR feature (Step 3) requires OS-level binaries in addition to the
Python packages in `requirements.txt`.

## System packages (must be installed on the server / image)
```
apt-get install -y tesseract-ocr poppler-utils
```
- `tesseract-ocr` — the OCR engine used via `pytesseract` (the pip package is only a wrapper).
- `poppler-utils` — provides `pdftotext` (embedded PDF text layer) and `pdftoppm` (used by `pdf2image` to rasterize scanned PDFs).

## Python packages (already added to requirements.txt)
- pytesseract
- opencv-python-headless
- pdf2image
- pillow

## Notes
- If the Tesseract binary is missing, `POST /api/bills/{file_id}/extract` returns HTTP 503 with a clear message instead of crashing.
- OCR is CPU-bound and runs inline in the request for this first implementation. If bill volume grows, move extraction to a background worker/job queue (documented as a future step — no Celery/Redis introduced now).
