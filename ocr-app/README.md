# Baidu OCR Workbench

Local OCR application for Baidu AI OCR services. It keeps Baidu credentials on the server, supports multiple local API profiles, and provides a searchable catalog of supported OCR endpoints.

## Run locally

1. Create `ocr-app/.env` from `.env.example` and set `BAIDU_OCR_API_KEY` and `BAIDU_OCR_SECRET_KEY`.
2. Run `npm start` in this directory.
3. Open `http://localhost:3000`.

## Security

- `.env` and `.ocr-api-config.json` contain credentials and are ignored by Git.
- The browser receives only a masked API Key hint. Secret Keys remain server-side.

## Verification

Run `npm test` to execute input validation, OCR response formatting, layout reconstruction, endpoint selection, and service-catalog tests.

## Service catalog

The interface includes searchable, allowlisted Baidu OCR services that accept a single image request. Multi-step task APIs and template-dependent services are intentionally not exposed as one-click image recognition.
