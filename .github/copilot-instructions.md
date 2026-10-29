# Project Guidelines

## Project

- NURSING+ is a Korean nursing-education performance dashboard and student career hub.
- Keep the UI in root `index.html`, with inline CSS and JavaScript. The existing demo remains standalone. User-approved Excel/Gemini analysis uses the optional Node.js backend (`server.js`, `employment-analysis.js`); no frontend build or extensions are required.
- Read `README.md` for implemented workflows, local-storage behavior, validation steps, and integration limitations.
- Use the existing root. Do not create additional folders or introduce integrations without a confirmed requirement.

## Implementation

- Preserve the Korean UI and Navy `#1A365D`, Teal `#00A896`, Gold `#F4A261` visual language.
- Keep admin and student surfaces consistent when updating enrollment, completion, competency, or program data.
- Render user-entered text safely. Validate persisted data and show explicit storage errors instead of claiming successful persistence.
- Version the local-storage schema and preserve existing data when changing it.
- Never present mock payments, simulated authentication, fixed analytics, rule-based guides, or printed demo records as production integrations.
- Keep official certificate, verified QR, public sharing, and WING+s functionality explicitly unavailable until real services are connected.
- Do not collect sensitive information in demo forms. Approved Excel analysis must keep raw student data on the loopback backend, never in storage/logs or external AI requests. Keep Gemini keys in server environment variables only; send only server-validated, reviewed, small-cell-protected aggregates with explicit consent.
- Preserve responsive layouts, keyboard navigation, chart descriptions, numeric alternatives, and print-only reports.

## Validation and Documentation

- Validate changes in a browser using the focused workflows in `README.md`; run `npm test` for backend changes. Use synthetic workbooks and mocked AI only unless the user separately arranges approved real-data/API validation. No frontend compilation or VS Code task is necessary.
- Check enrollment through approval, persistence after reload, journal-to-STAR mapping, cohort filtering, mobile overflow, and report content when those surfaces change.
- Never reset unrelated browser data. Remove only test records created for the current verification.
- Update `README.md` for changed behavior or limitations.
- Keep communications concise. Do not launch an external development/debug service without user confirmation.

## Setup Status

- [x] Requirements confirmed: single-file admin and student demonstration.
- [x] Application created and customized in the current root.
- [x] Extensions skipped: none needed.
- [x] Browser workflow validation completed; no compilation needed.
- [x] VS Code build/run task skipped: static HTML needs none.
- [x] Browser preview used for validation; separate debug launch not requested.
- [x] README and workspace instructions updated without HTML comments.
