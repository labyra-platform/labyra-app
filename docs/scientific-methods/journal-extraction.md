# Journal Metadata Extraction

<!-- R179-2-docs-2026-05-18 -->
<!-- @r179-2-applied -->

**Status**: Active
**Phase**: R179-2
**Last updated**: 2026-05-18

---

## 14. Method Overview

Resolve journal name, short form, and ISSN from paper DOI via Crossref
(primary) + OpenAlex (fallback). Runs as worker pipeline Step 1e after
Step 1d domain classification. No AI involved.

### 14.1 API Strategy

Crossref `GET /works/{doi}`:
- `message.container-title[0]` → full journal name
- `message.short-container-title[0]` → abbreviation
- `message.ISSN` → up to 2 ISSN strings (print + electronic)

OpenAlex fallback `GET /works/doi/{doi}`:
- `primary_location.source.display_name` → full name
- `primary_location.source.abbreviated_title` → short
- `primary_location.source.issn_l` + `issn` → ISSN list

### 14.2 Persistence

Paper doc fields (added R179-2):
```
journal: string             — full journal name
journalShort: string        — abbreviated form (Crossref short-container-title)
journalIssn: string[]       — 0-2 ISSN strings
journalSourceId: 'crossref' | 'openalex' | ''
journalResolvedAt: number   — epoch ms
```

No separate audit log: lookup is deterministic, no model/prompt versioning
needed (unlike R178-3 classify).

### 14.3 Polite API usage

Set `CROSSREF_POLITE_MAILTO` env var → included in User-Agent header. Polite
users get higher rate limit share from Crossref public pool.

### 14.4 Threat model

| Threat | Mitigation |
|---|---|
| Crossref/OpenAlex downtime | Worker skips Step 1e, paper indexes without journal; backfill later |
| DOI typo / invalid | Returns rejected=true, journal fields empty |
| API response schema change | Defensive `Array.isArray` checks, return empty on parse fail |
| Rate limit (Crossref public pool) | Polite mailto header + 200ms delay in backfill script |

### 14.5 Backfill

`scripts/backfill-paper-journals.mjs --tenant <id>`:
- Query all papers where `doi` set AND `journal` empty AND `status === 'indexed'`
- For each: lookup → update Firestore
- 200ms rate-limit delay between calls
- Supports `--dry-run` and `--all-tenants`

### 14.6 References

- Crossref API: https://api.crossref.org/swagger-ui/index.html
- OpenAlex API: https://docs.openalex.org/
- Worker impl: `labyra-spectra-worker/src/papers/journal_resolve.py`
- App schema: `labyra-app/src/types/papers.ts`
- ADR-027

### 14.7 Verification

E2E:
1. Upload paper with DOI (e.g., 10.1039/c4ta04525b)
2. Wait pipeline → check Firestore `papers/{id}.journal = "Journal of Materials Chemistry A"`
3. Filter UI: open /dashboard/papers → see "J. Mater. Chem. A" chip
4. Click chip → journal info card appears with count + year range + ISSN
