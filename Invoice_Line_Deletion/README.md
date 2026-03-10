# Invoice_Line_Deletion

A SuiteScript 2.1 Map/Reduce utility for bulk removal of duplicate or unwanted lines from NetSuite invoices.

## Overview

This script reads a saved search that returns specific invoice lines to be removed, then loads each invoice, removes those lines in reverse order (to prevent index shifting), and saves. Supports a **Dry Run mode** (default: on) that logs what would be removed without making any changes.

## Script Details

| Field | Value |
|-------|-------|
| **File** | `gtf_mr_remove_duplicate_lines.js` |
| **Type** | Map/Reduce |
| **API Version** | 2.1 |
| **Script ID** | `customscript_gtf_transaction_line_deletion` (or your assigned ID) |

## Script Parameters

| Parameter ID | Type | Description |
|---|---|---|
| `custscript_gtf_saved_search` | Free-Form Text | Script ID of the saved search to use (e.g. `customsearch_gtf_duplicate_trx_3`) |
| `custscript_gtf_dry_run` | Checkbox | When checked, logs results without modifying any records. **Default: checked.** |

## Saved Search Requirements

The saved search must:
- Be **non-summarized** (no Summary Type on any column)
- Have **no Summary-type filters** in the Summary criteria tab (e.g. `COUNT of Line ID > 1`) — these cause `INVALID_SRCH_SUMMARY_TYP` on `runPaged()`
- Return at minimum: **Internal ID** and **Line ID** columns
- Be scoped to the target invoices (use `Internal ID is any of` for testing before full runs)

## Architecture

Mirrors Techfino's proven paged Map/Reduce pattern to avoid a known NetSuite defect where returning a search object directly from `getInputData` yields 0 rows:

1. **getInputData** — loads the search, calls `runPaged()`, returns one `{searchId, pageIndex}` entry per page
2. **map** — re-loads the search per page, fetches results via `getRange()`, writes `key=tranId / value=lineId` pairs
3. **reduce** — called once per invoice; removes lines in descending index order to prevent shifting, then saves
4. **summarize** — logs per-invoice results and error counts

## Safety Notes

- **Dry Run is on by default** — always verify the execution log before disabling
- Lines are removed highest-index-first to prevent index shifting during multi-line removal
- The script logs item ID, quantity, and amount for every line before removing it
- Errors on individual invoices are caught and logged — they do not stop other invoices from processing

## Deployment Steps

1. Upload `gtf_mr_remove_duplicate_lines.js` to SuiteScripts in the File Cabinet
2. Create a new Map/Reduce script record pointing to the file
3. Add both script parameters on the Parameters tab
4. Create a deployment; set `custscript_gtf_saved_search` to your search ID and leave `custscript_gtf_dry_run` checked
5. Execute and review the Execution Log — confirm `Records found: N` and review `[DRY RUN] Reduce` entries
6. Uncheck Dry Run and re-execute to commit changes
