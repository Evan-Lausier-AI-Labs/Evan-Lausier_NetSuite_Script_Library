/**
 * GTF | MR | Remove Duplicate Invoice Lines
 *
 * Reads duplicate transaction lines from a saved search and removes them
 * from their parent invoices. Supports DRY RUN mode (default: TRUE).
 *
 * ARCHITECTURE: Mirrors Techfino's proven paged Map/Reduce pattern.
 *   - getInputData: runPaged on the search, returns array of {searchId, pageIndex}
 *   - map:          for each page, fetch that page's results, write {tranId, lineId} pairs
 *   - reduce:       called once per invoice — removes lines in reverse order, saves
 *   - summarize:    logs all results and errors
 *
 * SCRIPT PARAMETERS REQUIRED:
 *   custscript_gtf_saved_search  — Text — the saved search ID (e.g. customsearch_gtf_duplicate_trx_3)
 *   custscript_gtf_dry_run       — Checkbox — Dry Run (default: checked/true)
 *
 * SAFETY NOTES:
 *   - Lines removed highest index first to prevent index shifting
 *   - Dry Run = true logs what WOULD happen — nothing is modified
 *   - Saved search must be non-summarized and return: Internal ID, Line ID
 *   - Remove any Summary-type filters (e.g. COUNT) from the saved search criteria
 *     before running — these cause INVALID_SRCH_SUMMARY_TYP on runPaged()
 *
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 */

define(['N/search', 'N/record', 'N/log', 'N/runtime'], (search, record, log, runtime) => {

    const MAX_PAGE_SIZE = 1000;
    const SEARCH_PARAM   = 'custscript_gtf_saved_search';
    const DRY_RUN_PARAM  = 'custscript_gtf_dry_run';

    // Helper: safely extract a string value from a search result column.
    // SuiteScript may return { value: "x", text: "x" } or a plain string.
    const getColValue = (values, fieldId) => {
        const raw = values[fieldId];
        if (raw === null || raw === undefined) return null;
        if (typeof raw === 'object' && 'value' in raw) return String(raw.value);
        return String(raw);
    };

    // ---------------------------------------------------------------------------
    // STAGE 1 — getInputData
    // Mirrors Techfino: runPaged on the search, return one entry per page.
    // Avoids the NetSuite defect where returning a search object yields 0 rows.
    // NOTE: Search ID is now a script parameter (custscript_gtf_saved_search)
    //       so the same script can be reused for any saved search.
    // ---------------------------------------------------------------------------
    const getInputData = () => {
        try {
            const currentScript = runtime.getCurrentScript();
            const savedSearchId = currentScript.getParameter({ name: SEARCH_PARAM });
            const paramVal      = currentScript.getParameter({ name: DRY_RUN_PARAM });
            const isDryRun      = (paramVal === null || paramVal === undefined) ? true : paramVal;

            log.audit({
                title: `GTF Remove Duplicate Lines — Starting (DRY RUN: ${isDryRun})`,
                details: `Search: ${savedSearchId}`
            });

            if (!savedSearchId) {
                log.error({
                    title: 'getInputData — Missing search ID',
                    details: `Set script parameter ${SEARCH_PARAM} on the deployment.`
                });
                return [];
            }

            const searchObj = search.load({ id: savedSearchId });

            // Replicate Techfino's defect474626Fix:
            // NetSuite bakes COUNT/GROUP summary types into both columns AND filters at the
            // metadata level. This causes INVALID_SRCH_SUMMARY_TYP on runPaged()/run().
            // Fix 1: strip summary types from columns
            searchObj.columns = searchObj.columns.map(col =>
                search.createColumn({ name: col.name, join: col.join || null, label: col.label || null })
            );

            // Fix 2: strip summary types from filter expression.
            // NetSuite stores summarized filters as [["COUNT", "fieldname"], operator, value].
            // We detect this pattern and flatten it to ["fieldname", operator, value].
            const stripFilterSummary = (expr) => {
                if (!Array.isArray(expr)) return expr;
                return expr.map(item => {
                    if (typeof item === 'string') return item; // AND / OR operators
                    if (Array.isArray(item)) {
                        // Summarized filter: first element is ["SUMMARY_TYPE", "fieldname"]
                        if (item.length >= 2 &&
                            Array.isArray(item[0]) &&
                            item[0].length === 2 &&
                            typeof item[0][0] === 'string' &&
                            typeof item[0][1] === 'string') {
                            // Strip summary — keep only the field name
                            return [item[0][1], ...item.slice(1)];
                        }
                        // Recurse into nested filter groups
                        return stripFilterSummary(item);
                    }
                    return item;
                });
            };
            try {
                const rawExpr = searchObj.filterExpression;
                log.audit({ title: 'filterExpression before strip', details: JSON.stringify(rawExpr) });
                searchObj.filterExpression = stripFilterSummary(rawExpr);
                log.audit({ title: 'filterExpression after strip', details: JSON.stringify(searchObj.filterExpression) });
            } catch (filterErr) {
                log.audit({ title: 'filterExpression strip skipped', details: filterErr.message });
            }

            const pagedSearch = searchObj.runPaged({ pageSize: MAX_PAGE_SIZE });

            log.audit({
                title: `Records found: ${pagedSearch.count}`,
                details: `Pages: ${pagedSearch.pageRanges.length}`
            });

            const input = [];
            for (let i = 0; i < pagedSearch.pageRanges.length; i++) {
                input.push({ searchId: savedSearchId, pageIndex: i });
            }
            return input;

        } catch (e) {
            log.error({ title: 'getInputData — Error', details: `${e.name}: ${e.message}` });
            return [];
        }
    };

    // ---------------------------------------------------------------------------
    // STAGE 2 — map
    // Re-loads the search for each page, fetches the row range, and writes
    // one entry per row: key = transaction internal ID, value = line ID (1-based).
    // ---------------------------------------------------------------------------
    const map = (context) => {
        try {
            const mapValue  = JSON.parse(context.value);
            const pageIndex = Number(mapValue.pageIndex);
            const start     = pageIndex * MAX_PAGE_SIZE;
            const end       = start + MAX_PAGE_SIZE;

            const searchObj = search.load({ id: mapValue.searchId });

            // Same defect474626Fix as getInputData — strip summary types from columns + filters
            searchObj.columns = searchObj.columns.map(col =>
                search.createColumn({ name: col.name, join: col.join || null, label: col.label || null })
            );
            const stripFilterSummary = (expr) => {
                if (!Array.isArray(expr)) return expr;
                return expr.map(item => {
                    if (typeof item === 'string') return item;
                    if (Array.isArray(item)) {
                        if (item.length >= 2 &&
                            Array.isArray(item[0]) &&
                            item[0].length === 2 &&
                            typeof item[0][0] === 'string' &&
                            typeof item[0][1] === 'string') {
                            return [item[0][1], ...item.slice(1)];
                        }
                        return stripFilterSummary(item);
                    }
                    return item;
                });
            };
            try {
                searchObj.filterExpression = stripFilterSummary(searchObj.filterExpression);
            } catch (filterErr) {
                log.audit({ title: 'Map — filterExpression strip skipped', details: filterErr.message });
            }

            const results = searchObj.run().getRange({ start, end });

            log.audit({
                title: `Map — page ${pageIndex}`,
                details: `Rows on this page: ${results.length}`
            });

            for (let i = 0; i < results.length; i++) {
                const result = results[i];
                const tranId = result.id;

                // Line ID — use getValue with the column object for reliability
                const lineCol = searchObj.columns.find(c => c.name === 'line');
                let lineId = lineCol ? result.getValue(lineCol) : null;

                // Fallback: try values map
                if (lineId === null || lineId === undefined || lineId === '') {
                    lineId = getColValue(result.values, 'line');
                }

                // Debug: log raw first row of each page so we can verify column mapping
                if (i === 0) {
                    log.debug({
                        title: `Map p${pageIndex} row0 — tranId: ${tranId} | lineId raw: ${lineId}`,
                        details: `Columns: ${JSON.stringify(searchObj.columns.map(c => c.name))}`
                    });
                }

                if (!tranId || lineId === null || lineId === undefined || lineId === '') {
                    log.error({
                        title: 'Map — Skipping row: missing tranId or lineId',
                        details: `tranId: ${tranId} | lineId: ${lineId}`
                    });
                    continue;
                }

                log.audit({
                    title: `Map — Invoice ${tranId} → line ${lineId}`
                });

                context.write({ key: String(tranId), value: String(lineId) });
            }

        } catch (e) {
            log.error({ title: 'Map — Error', details: `${e.name}: ${e.message}` });
            throw e;
        }
    };

    // ---------------------------------------------------------------------------
    // STAGE 3 — reduce
    // Called once per unique invoice. Removes all duplicate lines in descending
    // order (highest index first) to prevent line index shifting mid-removal.
    // ---------------------------------------------------------------------------
    const reduce = (context) => {
        const paramVal = runtime.getCurrentScript().getParameter({ name: DRY_RUN_PARAM });
        const isDryRun = (paramVal === null || paramVal === undefined) ? true : paramVal;
        const tranId   = context.key;

        const lineIds = context.values
            .map(v => parseInt(v, 10))
            .filter(n => !isNaN(n))
            .sort((a, b) => b - a); // descending

        log.audit({
            title: `${isDryRun ? '[DRY RUN] ' : ''}Reduce — Invoice ${tranId}`,
            details: `Line IDs to remove (1-based, desc): ${JSON.stringify(lineIds)}`
        });

        if (isDryRun) {
            context.write({
                key: tranId,
                value: JSON.stringify({
                    status: 'DRY_RUN',
                    invoice: tranId,
                    linesWouldRemove: lineIds,
                    note: 'No changes made. Uncheck Dry Run on deployment to execute.'
                })
            });
            return;
        }

        try {
            const inv = record.load({
                type: record.Type.INVOICE,
                id: parseInt(tranId, 10),
                isDynamic: false
            });

            let lineCount = inv.getLineCount({ sublistId: 'item' });
            log.audit({ title: `Invoice ${tranId} loaded`, details: `Total lines: ${lineCount}` });

            const removed = [];
            const skipped = [];

            for (const lineId of lineIds) {
                const zeroIdx = lineId - 1; // 1-based → 0-based

                if (zeroIdx >= 0 && zeroIdx < lineCount) {
                    const itemId = inv.getSublistValue({ sublistId: 'item', fieldId: 'item',     line: zeroIdx });
                    const qty    = inv.getSublistValue({ sublistId: 'item', fieldId: 'quantity', line: zeroIdx });
                    const amount = inv.getSublistValue({ sublistId: 'item', fieldId: 'amount',   line: zeroIdx });

                    inv.removeLine({ sublistId: 'item', line: zeroIdx });
                    lineCount--;

                    removed.push({ lineId_1based: lineId, itemId, qty, amount });
                    log.audit({
                        title: `Removed — Invoice ${tranId} line ${lineId}`,
                        details: `Item: ${itemId} | Qty: ${qty} | Amount: ${amount}`
                    });
                } else {
                    log.error({
                        title: `Skipped — line ${lineId} out of range on Invoice ${tranId}`,
                        details: `0-based: ${zeroIdx} vs lineCount: ${lineCount}`
                    });
                    skipped.push(lineId);
                }
            }

            const savedId = inv.save({ enableSourcing: false, ignoreMandatoryFields: false });

            context.write({
                key: tranId,
                value: JSON.stringify({ status: 'SUCCESS', invoice: tranId, savedId, linesRemoved: removed, linesSkipped: skipped })
            });

        } catch (e) {
            log.error({ title: `Reduce — Error on Invoice ${tranId}`, details: `${e.name}: ${e.message}` });
            context.write({
                key: tranId,
                value: JSON.stringify({ status: 'ERROR', invoice: tranId, error: e.message, linesAttempted: lineIds })
            });
        }
    };

    // ---------------------------------------------------------------------------
    // STAGE 4 — summarize
    // ---------------------------------------------------------------------------
    const summarize = (summary) => {
        const paramVal = runtime.getCurrentScript().getParameter({ name: DRY_RUN_PARAM });
        const isDryRun = (paramVal === null || paramVal === undefined) ? true : paramVal;

        log.audit({
            title: `${isDryRun ? '[DRY RUN] ' : ''}GTF Remove Duplicate Lines — Complete`,
            details: JSON.stringify({ seconds: summary.seconds, concurrency: summary.concurrency })
        });

        summary.output.iterator().each((key, value) => {
            log.audit({ title: `Result — Invoice ${key}`, details: value });
            return true;
        });

        let mapErrors = 0;
        summary.mapSummary.errors.iterator().each((key, error) => {
            log.error({ title: `Map error — ${key}`, details: error });
            mapErrors++;
            return true;
        });

        let reduceErrors = 0;
        summary.reduceSummary.errors.iterator().each((key, error) => {
            log.error({ title: `Reduce error — ${key}`, details: error });
            reduceErrors++;
            return true;
        });

        log.audit({ title: 'Error counts', details: `Map: ${mapErrors} | Reduce: ${reduceErrors}` });
    };

    return { getInputData, map, reduce, summarize };
});
