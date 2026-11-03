"""A stand-in for `cryptography`, packaged as a wheel by `scripts/fetch-parser-assets.mjs`.

pdfminer.six imports `cryptography` at module level (`pdfminer/pdfdocument.py`) but only uses it for AES-encrypted
PDFs. The real package is a large compiled wheel, so the browser gets this instead: it provides the names pdfminer
imports, and any AES use raises pdfminer's `PDFEncryptionError`, which the parser reports as `encrypted`.
"""
