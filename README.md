# React + Tailwind + TypeScript AI Module Examples

This folder contains drop-in examples for:

1. AI Competency Gap Analysis
2. AI Employment Association Analytics Report

## Files

- `components/AICompetencyGapAnalysis.tsx`
- `components/AIEmploymentAssociationReport.tsx`
- `api/analyze-competency.ts`
- `api/analyze-employment.ts`

## Expected stack

- React 18+
- TypeScript
- Tailwind CSS
- Next.js App Router API routes (or adapt handlers to Express)

## Install for markdown rendering

```bash
npm install react-markdown
```

## API endpoints used by components

- `POST /api/analyze-competency`
- `POST /api/analyze-employment`

## Notes

- If `OPENAI_API_KEY` is not set, both API examples return mock/simulated output.
- `analyze-employment` supports simulated streaming when `stream: true` is sent.
