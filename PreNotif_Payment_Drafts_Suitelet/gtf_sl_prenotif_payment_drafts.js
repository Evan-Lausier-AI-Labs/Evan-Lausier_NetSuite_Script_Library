/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * Store Level Payment Drafts
 *
 * Driven by a hardcoded list of pre-notification saved searches. The selected
 * saved search defines the invoice universe; SuiteQL handles column structure,
 * additional filters, paging, and export.
 *
 * Script ID:    customscript_gtf_sl_prenotif_drafts
 * Deploy ID:    customdeploy_store_level_payment_draft
 *
 * Fix (2026-03-31a): baseUrl stripped of script/deploy params — re-appended.
 * Fix (2026-03-31b): Invoice Memo rename; Payment Note(Memo) = first line
 *   itemid; removed redundant First Line Item column; batched lookup.
 * Fix (2026-03-31c): Payment Note(Memo) uses itemid not displayname.
 * Feat (2026-03-31d): Per-row checkboxes, Mark/Unmark All, Create Payment
 *   Drafts button — creates Customer Payment records via N/record.
 *   Max 200 records per batch (governance safety cap).
 * Chore (2026-03-31e): Page titles renamed to "Store Level Payment Drafts".
 * Fix (2026-04-01a): Brand/franc filters use raw IDs (BUILTIN.DF not allowed
 *   in WHERE). Export respects row selection via &ids= parameter.
 * Feat (2026-04-01b): Saved search dropdown (hardcoded list, Store Level
 *   default). N/search.runPaged collects matching invoice IDs; those IDs drive
 *   all SuiteQL queries so column structure is fully preserved. Additional
 *   filters (brand, store, etc.) are applied on top of saved search IDs.
 * Fix (2026-04-01c): runSavedSearchIds — page.data is a plain array in
 *   Suitelet context. Use (page.data || []).forEach() directly.
 * Chore (2026-04-01d): Page titles renamed to "Payment Drafts".
 * Chore (2026-04-01e): Trim saved searches to Store Level and Parent Level
 *   only. Remove default selection — require explicit choice before loading.
 *   Prevents fallback-to-Store-Level when Parent Level was selected.
 * Fix (2026-04-01f): All <button> elements must have type="button" to prevent
 *   NetSuite's outer form wrapper from treating them as submit buttons, which
 *   was stripping f_search and other custom URL params on Apply.
 * Feat (2026-04-02a): Three EFT detail columns added from
 *   customrecord_2663_entity_bank_details joined on customer ID:
 *   EFT Record Name, EFT Type, EFT Payment File Format.
 *   fetchBankDetails() now fetches both Primary (type 1) and Secondary (type 2)
 *   records per customer. Indices 17-21 in raw data array:
 *     [17] EFT Record Name (primary)
 *     [18] EFT Type display text (primary, used for CSV)
 *     [19] EFT Payment File Format (primary)
 *     [20] Primary EBD internal ID  (extra, not in COLUMNS — for payment creation)
 *     [21] Secondary EBD internal ID (extra, not in COLUMNS — '' if none)
 * Feat (2026-04-02b): EFT Type column moved to display position 5 (before
 *   Bank Account to Draft) using COLUMN_DATA_INDICES reorder map.
 *   EFT Type filter dropdown added — uses IN subquery on bank details record.
 * Feat (2026-04-02c): EFT Type cell in each table row is an inline <select>
 *   dropdown defaulting to Primary. Shows Secondary option only when the
 *   customer has an active Secondary bank detail record. When "Create Payment
 *   Drafts" fires, the selected EBD ID per row is POSTed as ebd_ids (parallel
 *   to ids). Column 0 renamed from "Internal ID" to "Invoice Internal ID".
 */

define(['N/query', 'N/log', 'N/ui/serverWidget', 'N/record', 'N/search'],
       (query,    log,     serverWidget,          record,    search) => {

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    const PAGE_SIZE  = 100;
    const BATCH_SIZE = 500;   // max IDs per SuiteQL IN clause
    const MAX_CREATE = 200;   // governance safety cap for payment creation batch

    const SAVED_SEARCHES = [
        { id: 'customsearch_gtf_prenotif_child_custom_8', label: 'Payment Drafts - Store Level' },
        { id: 'customsearch_gtf_prenotif_child_custom_5', label: 'Payment Drafts - Parent Level' }
    ];

    /** EFT Type values — Primary (1) and Secondary (2) only exist in production. */
    const EFT_TYPES = [
        { id: '1', name: 'Primary' },
        { id: '2', name: 'Secondary' }
    ];

    /**
     * Display column order. Raw data array layout after all merges (22 elements):
     *  [0]  Invoice Internal ID     [11] GTF Bank Internal ID
     *  [1]  Add Payment Number      [12] Currency
     *  [2]  Payment Preference      [13] Payment Amount
     *  [3]  Customer Internal ID    [14] Apply to Invoice ID
     *  [4]  Subsidiary External ID  [15] For Electronic Payment
     *  [5]  Bank Account to Draft   [16] Undeposited Funds
     *  [6]  Date                    [17] EFT Record Name      (JS merge — primary)
     *  [7]  Invoice Memo            [18] EFT Type display     (JS merge — primary, for CSV)
     *  [8]  AR Account External ID  [19] EFT Payment File Fmt (JS merge — primary)
     *  [9]  Payment Note(Memo)      [20] Primary EBD ID       (JS merge — extra, not in COLUMNS)
     *  [10] Bank Account External ID [21] Secondary EBD ID    (JS merge — extra, not in COLUMNS)
     *
     * COLUMN_DATA_INDICES maps each display position to its raw data index.
     * Elements [20] and [21] are extra — beyond COLUMNS.length so they don't
     * appear in the table or CSV, but are available in JS for payment creation.
     */
    const COLUMNS = [
        'Invoice Internal ID',      // display 0  → data[0]
        'Add Payment Number',       // display 1  → data[1]
        'Payment Preference',       // display 2  → data[2]
        'Customer Internal ID',     // display 3  → data[3]
        'Subsidiary External ID',   // display 4  → data[4]
        'EFT Type',                 // display 5  → data[18] ← inline <select> dropdown
        'Bank Account to Draft',    // display 6  → data[5]
        'Date',                     // display 7  → data[6]
        'Invoice Memo',             // display 8  → data[7]
        'AR Account External ID',   // display 9  → data[8]
        'Payment Note(Memo)',       // display 10 → data[9]
        'Bank Account External ID', // display 11 → data[10]
        'GTF Bank Internal ID',     // display 12 → data[11]
        'Currency',                 // display 13 → data[12]
        'Payment Amount',           // display 14 → data[13]
        'Apply to Invoice ID',      // display 15 → data[14]
        'For Electronic Payment',   // display 16 → data[15]
        'Undeposited Funds',        // display 17 → data[16]
        'EFT Record Name',          // display 18 → data[17]
        'EFT Payment File Format'   // display 19 → data[19]
    ];

    // First 20 entries map to COLUMNS; last 2 are extra metadata for EBD IDs.
    const COLUMN_DATA_INDICES = [0,1,2,3,4,18,5,6,7,8,9,10,11,12,13,14,15,16,17,19, 20,21];

    const BASE_FROM = `
        FROM transaction t
        JOIN transactionline tl ON tl.transaction = t.id
                                AND tl.mainline   = 'T'
                                AND tl.taxline    = 'F'
        JOIN customer   c   ON c.id   = t.entity
        JOIN subsidiary sub ON sub.id = tl.subsidiary
        JOIN account    a   ON a.id   = tl.expenseaccount
    `;

    const LIGHT_FROM = `
        FROM transaction t
        JOIN transactionline tl ON tl.transaction = t.id
                                AND tl.mainline   = 'T'
                                AND tl.taxline    = 'F'
        JOIN customer   c   ON c.id   = t.entity
        JOIN subsidiary sub ON sub.id = tl.subsidiary
    `;

    const DATA_SELECT = `
        SELECT
            t.id                                                                AS "Invoice Internal ID",
            sub.externalid || '-' || LPAD(TO_CHAR(t.id), 10, '0')             AS "Add Payment Number",
            BUILTIN.DF(c.custentity_gtf_payment_preference)                    AS "Payment Preference",
            c.id                                                                AS "Customer Internal ID",
            sub.externalid                                                      AS "Subsidiary External ID",
            sub.custrecord_gtf_bank_account_number                              AS "Bank Account to Draft",
            TO_CHAR(t.trandate, 'MM/DD/YYYY')                                  AS "Date",
            t.memo                                                              AS "Invoice Memo",
            a.externalid                                                        AS "AR Account External ID",
            NULL                                                                AS "Payment Note(Memo)",
            sub.custrecord_gtf_bank_account_number                              AS "Bank Account External ID",
            sub.custrecord4                                                      AS "GTF Bank Internal ID",
            BUILTIN.DF(t.currency)                                              AS "Currency",
            REPLACE(TO_CHAR(t.foreigntotal), ',', '')                          AS "Payment Amount",
            t.id                                                                AS "Apply to Invoice ID",
            'TRUE'                                                              AS "For Electronic Payment",
            'FALSE'                                                             AS "Undeposited Funds"
    `;

    // -------------------------------------------------------------------------
    // Entry point
    // -------------------------------------------------------------------------

    const onRequest = (ctx) => {
        try {
            const params     = ctx.request.parameters;
            const exportMode = params.export === '1';
            const createMode = params.action === 'create';
            const scriptId   = params.script || '';
            const deployId   = params.deploy || '';

            const rawSearchId = sanitize(params.f_search || '');
            const searchId    = SAVED_SEARCHES.some(s => s.id === rawSearchId) ? rawSearchId : '';

            const filters = {
                search  : searchId,
                brand   : sanitize(params.f_brand    || ''),
                store   : sanitize(params.f_store    || ''),
                franc   : sanitize(params.f_franc    || ''),
                week    : sanitize(params.f_week     || ''),
                from    : sanitize(params.f_from     || ''),
                to      : sanitize(params.f_to       || ''),
                eft_type: sanitize(params.f_eft_type || '')
            };

            const filterWhere = buildFilterWhere(filters);
            const page        = Math.max(1, parseInt(params.page || '1', 10));
            const savedIds    = searchId ? runSavedSearchIds(searchId) : [];
            const filteredIds = getFilteredIds(savedIds, filterWhere);

            if (exportMode) {
                streamCsv(ctx, filteredIds, params.ids || '');
            } else if (createMode) {
                createPayments(ctx, params.ids || '', params.ebd_ids || '', scriptId, deployId);
            } else {
                renderPage(ctx, filters, savedIds, filteredIds, page, scriptId, deployId);
            }

        } catch (e) {
            log.error({ title: 'gtf_sl_prenotif_payment_drafts ERROR', details: JSON.stringify(e) });
            ctx.response.setHeader({ name: 'Content-Type', value: 'text/html' });
            ctx.response.write(
                `<html><body><h2 style="color:red">Error</h2><pre>${e.message || JSON.stringify(e)}</pre></body></html>`
            );
        }
    };

    // -------------------------------------------------------------------------
    // Page renderer
    // -------------------------------------------------------------------------

    const renderPage = (ctx, filters, savedIds, filteredIds, page, scriptId, deployId) => {
        const dropdowns  = runDropdownQuery(savedIds);
        const total      = filteredIds.length;
        const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        const safePage   = Math.min(page, totalPages);
        const rows       = runPageQuery(filteredIds, safePage);

        const rawBase = ctx.request.url.split('?')[0];
        const baseUrl = rawBase
            + '?script=' + encodeURIComponent(scriptId)
            + '&deploy=' + encodeURIComponent(deployId);

        const form = serverWidget.createForm({ title: 'Payment Drafts' });
        const htmlField = form.addField({
            id   : 'custpage_results',
            type : serverWidget.FieldType.INLINEHTML,
            label: ' '
        });
        htmlField.defaultValue = buildHtml(rows, filters, dropdowns, safePage, totalPages, total, baseUrl);
        ctx.response.writePage(form);
    };

    // -------------------------------------------------------------------------
    // Saved search + filter queries
    // -------------------------------------------------------------------------

    const runSavedSearchIds = (searchId) => {
        const srch  = search.load({ id: searchId });
        const paged = srch.runPaged({ pageSize: 1000 });
        const ids   = [];
        paged.pageRanges.forEach(range => {
            const page = paged.fetch({ index: range.index });
            (page.data || []).forEach(result => ids.push(parseInt(result.id, 10)));
        });
        return ids;
    };

    const getFilteredIds = (savedIds, filterWhere) => {
        if (!filterWhere || !savedIds.length) return savedIds.slice();
        const filteredIds = [];
        for (let i = 0; i < savedIds.length; i += BATCH_SIZE) {
            const idList = savedIds.slice(i, i + BATCH_SIZE).join(',');
            const sql    = `SELECT t.id ${LIGHT_FROM} WHERE t.id IN (${idList}) ${filterWhere} ORDER BY t.id`;
            const paged  = query.runSuiteQLPaged({ query: sql, pageSize: 1000 });
            paged.pageRanges.forEach(range => {
                const pg = paged.fetch({ index: range.index });
                (pg.data.results || []).forEach(r => filteredIds.push(parseInt(r.values[0], 10)));
            });
        }
        return filteredIds;
    };

    const buildFilterWhere = (f) => {
        const clauses = [];
        if (f.brand) clauses.push(`c.custentity_gtf_brand = ${parseInt(f.brand, 10)}`);
        if (f.store) clauses.push(`UPPER(c.externalid) LIKE UPPER('%${f.store}%')`);
        if (f.franc) clauses.push(`c.parent = ${parseInt(f.franc, 10)}`);
        if (f.week)  clauses.push(`TO_CHAR(t.custbody_gtf_weekenddate, 'MM/DD/YYYY') = '${f.week}'`);
        if (f.from)  clauses.push(`t.trandate >= TO_DATE('${f.from}', 'YYYY-MM-DD')`);
        if (f.to)    clauses.push(`t.trandate <= TO_DATE('${f.to}', 'YYYY-MM-DD')`);
        if (f.eft_type) clauses.push(
            `c.id IN (
                SELECT ebd2.custrecord_2663_parent_cust_ref
                FROM customrecord_2663_entity_bank_details ebd2
                WHERE ebd2.custrecord_2663_entity_bank_type = ${parseInt(f.eft_type)}
                  AND ebd2.isinactive = 'F'
            )`
        );
        return clauses.length ? ' AND ' + clauses.join(' AND ') : '';
    };

    const runDropdownQuery = (savedIds) => {
        const brandMap = new Map();
        const francMap = new Map();
        const weeks    = new Set();
        for (let i = 0; i < savedIds.length; i += BATCH_SIZE) {
            const idList = savedIds.slice(i, i + BATCH_SIZE).join(',');
            const sql    = `
                SELECT DISTINCT
                    c.custentity_gtf_brand, BUILTIN.DF(c.custentity_gtf_brand),
                    c.parent,               BUILTIN.DF(c.parent),
                    NVL(TO_CHAR(t.custbody_gtf_weekenddate, 'MM/DD/YYYY'), '')
                ${LIGHT_FROM} WHERE t.id IN (${idList}) ORDER BY 2, 4, 5
            `;
            const paged = query.runSuiteQLPaged({ query: sql, pageSize: 1000 });
            paged.pageRanges.forEach(range => {
                const pg = paged.fetch({ index: range.index });
                (pg.data.results || []).forEach(row => {
                    const [brandId, brandName, francId, francName, week] = row.values;
                    if (brandId && brandName) brandMap.set(String(brandId), String(brandName));
                    if (francId && francName) francMap.set(String(francId), String(francName));
                    if (week) weeks.add(String(week));
                });
            });
        }
        const sortPairs = (map) =>
            Array.from(map.entries()).map(([id, name]) => ({ id, name }))
                 .sort((a, b) => a.name.localeCompare(b.name));
        return {
            brands: sortPairs(brandMap),
            francs: sortPairs(francMap),
            weeks : Array.from(weeks).filter(v => v).sort()
        };
    };

    // -------------------------------------------------------------------------
    // Data queries
    // -------------------------------------------------------------------------

    const fetchFirstLineItems = (txnIds) => {
        if (!txnIds || txnIds.length === 0) return {};
        const map = {};
        for (let i = 0; i < txnIds.length; i += BATCH_SIZE) {
            const idList = txnIds.slice(i, i + BATCH_SIZE).join(',');
            const sql = `
                SELECT tl_min.transaction, NVL(i.itemid, tl_first.memo) AS item_val
                FROM (
                    SELECT transaction, MIN(id) AS min_id
                    FROM transactionline
                    WHERE mainline = 'F' AND taxline = 'F' AND transaction IN (${idList})
                    GROUP BY transaction
                ) tl_min
                JOIN transactionline tl_first ON tl_first.transaction = tl_min.transaction
                                              AND tl_first.id         = tl_min.min_id
                LEFT JOIN item i ON i.id = tl_first.item
            `;
            const rs = query.runSuiteQL({ query: sql });
            (rs.results || []).forEach(row => { map[String(row.values[0])] = row.values[1] || ''; });
        }
        return map;
    };

    const mergeFirstLineItems = (rows) => {
        const map = fetchFirstLineItems(rows.map(r => r[0]).filter(Boolean));
        return rows.map(r => { const c = r.slice(); c[9] = map[String(r[0])] || ''; return c; });
    };

    /**
     * Fetches both Primary (type 1) and Secondary (type 2) bank detail records
     * per customer. Returns a map keyed by customer ID containing:
     *   primaryEbdId, primaryName, primaryTypeName, primaryFormat
     *   secondaryEbdId, secondaryName, secondaryFormat
     * First record per type per customer wins (ORDER BY ebd.id).
     */
    const fetchBankDetails = (customerIds) => {
        if (!customerIds || customerIds.length === 0) return {};
        const map       = {};
        const uniqueIds = [...new Set(customerIds.map(String).filter(Boolean))];
        for (let i = 0; i < uniqueIds.length; i += BATCH_SIZE) {
            const idList = uniqueIds.slice(i, i + BATCH_SIZE).join(',');
            const sql = `
                SELECT ebd.custrecord_2663_parent_cust_ref,
                       ebd.id,
                       ebd.custrecord_2663_entity_bank_type,
                       ebd.name,
                       BUILTIN.DF(ebd.custrecord_2663_entity_bank_type),
                       BUILTIN.DF(ebd.custrecord_2663_entity_file_format)
                FROM customrecord_2663_entity_bank_details ebd
                WHERE ebd.custrecord_2663_parent_cust_ref IN (${idList})
                  AND ebd.isinactive = 'F'
                ORDER BY ebd.custrecord_2663_parent_cust_ref, ebd.custrecord_2663_entity_bank_type, ebd.id
            `;
            const rs = query.runSuiteQL({ query: sql });
            (rs.results || []).forEach(row => {
                const custId   = String(row.values[0]);
                const ebdId    = String(row.values[1]);
                const typeId   = String(row.values[2]);  // '1'=Primary, '2'=Secondary
                const name     = row.values[3] || '';
                const typeName = row.values[4] || '';
                const format   = row.values[5] || '';

                if (!map[custId]) {
                    map[custId] = {
                        primaryEbdId: '', primaryName: '', primaryTypeName: 'Primary', primaryFormat: '',
                        secondaryEbdId: '', secondaryName: '', secondaryFormat: ''
                    };
                }
                if (typeId === '1' && !map[custId].primaryEbdId) {
                    map[custId].primaryEbdId    = ebdId;
                    map[custId].primaryName     = name;
                    map[custId].primaryTypeName = typeName;
                    map[custId].primaryFormat   = format;
                } else if (typeId === '2' && !map[custId].secondaryEbdId) {
                    map[custId].secondaryEbdId  = ebdId;
                    map[custId].secondaryName   = name;
                    map[custId].secondaryFormat = format;
                }
            });
        }
        return map;
    };

    /**
     * Merges bank detail data into the raw row array.
     * Sets indices 17-21:
     *   [17] EFT Record Name (primary)
     *   [18] EFT Type display text (primary — used for CSV export of EFT Type column)
     *   [19] EFT Payment File Format (primary)
     *   [20] Primary EBD internal ID  (extra — for payment creation)
     *   [21] Secondary EBD internal ID (extra — '' if customer has no secondary)
     */
    const mergeBankDetails = (rows) => {
        const map = fetchBankDetails(rows.map(r => r[3]).filter(Boolean));
        return rows.map(r => {
            const copy = r.slice();
            const d = map[String(r[3])] || {};
            copy[17] = d.primaryName     || '';
            copy[18] = d.primaryTypeName || 'Primary';
            copy[19] = d.primaryFormat   || '';
            copy[20] = d.primaryEbdId    || '';
            copy[21] = d.secondaryEbdId  || '';
            return copy;
        });
    };

    /**
     * Reorders raw data array to match COLUMNS display order.
     * Produces a 22-element array: first 20 = COLUMNS, last 2 = EBD IDs (extra metadata).
     * CSV export uses only row.slice(0, COLUMNS.length) so extra elements are not exported.
     */
    const reorderRow = (row) => COLUMN_DATA_INDICES.map(i => (row[i] !== undefined ? row[i] : ''));

    const runPageQuery = (filteredIds, page) => {
        const start   = (page - 1) * PAGE_SIZE;
        const pageIds = filteredIds.slice(start, start + PAGE_SIZE);
        if (!pageIds.length) return [];
        const sql = `${DATA_SELECT} ${BASE_FROM} WHERE t.id IN (${pageIds.join(',')}) ORDER BY sub.externalid, t.trandate, t.id`;
        const rs  = query.runSuiteQL({ query: sql });
        return mergeBankDetails(mergeFirstLineItems((rs.results || []).map(r => r.values))).map(reorderRow);
    };

    const runRowsByIds = (ids) => {
        const results = [];
        for (let i = 0; i < ids.length; i += BATCH_SIZE) {
            const sql = `${DATA_SELECT} ${BASE_FROM} WHERE t.id IN (${ids.slice(i, i + BATCH_SIZE).join(',')}) ORDER BY sub.externalid, t.trandate, t.id`;
            const rs  = query.runSuiteQL({ query: sql });
            (rs.results || []).forEach(r => results.push(r.values));
        }
        return mergeBankDetails(mergeFirstLineItems(results)).map(reorderRow);
    };

    // -------------------------------------------------------------------------
    // Payment creation
    // -------------------------------------------------------------------------

    const fetchCreateData = (txnIds) => {
        if (!txnIds || txnIds.length === 0) return [];
        const results = [];
        for (let i = 0; i < txnIds.length; i += BATCH_SIZE) {
            const sql = `
                SELECT t.id, c.id, sub.id, bank_acct.id, a.id, t.currency,
                       sub.externalid || '-' || LPAD(TO_CHAR(t.id), 10, '0'),
                       t.memo, t.foreigntotal, TO_CHAR(t.trandate, 'YYYY-MM-DD')
                FROM transaction t
                JOIN transactionline tl ON tl.transaction = t.id AND tl.mainline = 'T' AND tl.taxline = 'F'
                JOIN customer   c         ON c.id   = t.entity
                JOIN subsidiary sub       ON sub.id = tl.subsidiary
                JOIN account    a         ON a.id   = tl.expenseaccount
                LEFT JOIN account bank_acct ON bank_acct.externalid = sub.custrecord_gtf_bank_account_number
                WHERE t.id IN (${txnIds.slice(i, i + BATCH_SIZE).join(',')})
            `;
            const rs = query.runSuiteQL({ query: sql });
            (rs.results || []).forEach(row => {
                results.push({
                    txnId: row.values[0], customerId: row.values[1], subsidiaryId: row.values[2],
                    bankAccountId: row.values[3], arAccountId: row.values[4], currencyId: row.values[5],
                    paymentNumber: row.values[6], memo: row.values[7],
                    paymentAmount: row.values[8], tranDate: row.values[9]
                });
            });
        }
        return results;
    };

    /**
     * Creates Customer Payment records for the selected invoices.
     *
     * ebdIdsParam: parallel to idsParam — the EBD internal ID to use for each
     * invoice, determined by the per-row EFT Type dropdown selection. Primary
     * EBD ID is sent when the dropdown is Primary; Secondary when Secondary.
     * Logged here for audit trail. Will be used to set the Payment Manager
     * bank detail field on the payment record once that field is confirmed.
     */
    const createPayments = (ctx, idsParam, ebdIdsParam, scriptId, deployId) => {
        const rawBase = ctx.request.url.split('?')[0];
        const backUrl = rawBase + '?script=' + encodeURIComponent(scriptId) + '&deploy=' + encodeURIComponent(deployId);

        const ids    = (idsParam    || '').split(',').map(s => parseInt(s.trim(), 10)).filter(n => n > 0);
        const ebdIds = (ebdIdsParam || '').split(',').map(s => s.trim());

        // Build invoice → selected EBD ID lookup
        const ebdByTxn = {};
        ids.forEach((id, idx) => { ebdByTxn[String(id)] = ebdIds[idx] || ''; });

        if (!ids.length) return renderActionResults(ctx, [], backUrl, 'No invoice IDs provided.', 'Payment Drafts — Creation Results', 'created');
        if (ids.length > MAX_CREATE) return renderActionResults(ctx, [], backUrl,
            `Selection of ${ids.length} exceeds the maximum batch size of ${MAX_CREATE}. Please select fewer records.`,
            'Payment Drafts — Creation Results', 'created');

        const rows    = fetchCreateData(ids);
        const results = [];

        rows.forEach(row => {
            try {
                if (!row.bankAccountId) throw new Error('Bank account could not be resolved — verify subsidiary bank account number');
                if (!row.arAccountId)   throw new Error('AR account could not be resolved');

                const selectedEbdId = ebdByTxn[String(row.txnId)] || '';
                log.debug({ title: 'createPayments', details: `Invoice ${row.txnId} — using EBD ID: ${selectedEbdId}` });

                const rec = record.create({ type: record.Type.CUSTOMER_PAYMENT, isDynamic: true });
                rec.setValue({ fieldId: 'customer',                  value: parseInt(row.customerId) });
                rec.setValue({ fieldId: 'subsidiary',                 value: parseInt(row.subsidiaryId) });
                rec.setValue({ fieldId: 'account',                    value: parseInt(row.bankAccountId) });
                rec.setValue({ fieldId: 'aracct',                     value: parseInt(row.arAccountId) });
                rec.setValue({ fieldId: 'currency',                   value: parseInt(row.currencyId) });
                rec.setValue({ fieldId: 'trandate',                   value: new Date(row.tranDate + 'T00:00:00') });
                rec.setValue({ fieldId: 'memo',                       value: row.memo || '' });
                rec.setValue({ fieldId: 'externalid',                 value: row.paymentNumber });
                rec.setValue({ fieldId: 'tranid',                     value: row.paymentNumber });
                rec.setValue({ fieldId: 'payment',                    value: parseFloat(row.paymentAmount) });
                rec.setValue({ fieldId: 'custbody_9997_is_for_ep_dd', value: true });
                rec.setValue({ fieldId: 'undepfunds',                 value: false });

                const lineCount = rec.getLineCount({ sublistId: 'apply' });
                let applied = false;
                for (let i = 0; i < lineCount; i++) {
                    const docId = rec.getSublistValue({ sublistId: 'apply', fieldId: 'doc', line: i });
                    if (Number(docId) === Number(row.txnId)) {
                        rec.selectLine({ sublistId: 'apply', line: i });
                        rec.setCurrentSublistValue({ sublistId: 'apply', fieldId: 'apply',  value: true });
                        rec.setCurrentSublistValue({ sublistId: 'apply', fieldId: 'amount', value: parseFloat(row.paymentAmount) });
                        rec.commitLine({ sublistId: 'apply' });
                        applied = true;
                        break;
                    }
                }
                if (!applied) throw new Error(`Invoice ${row.txnId} not found in apply sublist — may already be applied, on hold, or not open.`);

                const newId = rec.save();
                results.push({ label: row.txnId, detail: row.paymentNumber, success: true, link: `/app/accounting/transactions/custpymt.nl?id=${newId}`, linkLabel: `CUSTPYMT ${newId}` });
            } catch (e) {
                log.error({ title: 'createPayments ERROR', details: `Invoice ${row.txnId}: ${e.message || e}` });
                results.push({ label: row.txnId, detail: row.paymentNumber, success: false, error: e.message || String(e) });
            }
        });

        renderActionResults(ctx, results, backUrl, null, 'Payment Drafts — Creation Results', 'created');
    };

    // -------------------------------------------------------------------------
    // Results renderer
    // -------------------------------------------------------------------------

    const renderActionResults = (ctx, results, backUrl, errorMsg, pageTitle, verb) => {
        const succeeded = results.filter(r =>  r.success).length;
        const failed    = results.filter(r => !r.success).length;

        const bannerColor  = errorMsg || failed > 0 ? '#fff3cd' : '#d4edda';
        const bannerBorder = errorMsg || failed > 0 ? '#ffc107' : '#28a745';

        let body = `<div style="font-family:Arial,sans-serif;font-size:12px">`;
        if (errorMsg) {
            body += `<div style="background:${bannerColor};border:1px solid ${bannerBorder};border-radius:4px;padding:12px 16px;margin-bottom:14px;color:#856404">
                <strong>Cannot process:</strong> ${escHtml(errorMsg)}</div>`;
        } else {
            body += `<div style="background:${bannerColor};border:1px solid ${bannerBorder};border-radius:4px;padding:12px 16px;margin-bottom:14px">
                <strong>${succeeded} record${succeeded !== 1 ? 's' : ''} ${escHtml(verb)}</strong>
                ${failed > 0 ? ` &nbsp;&#124;&nbsp; <span style="color:#721c24">${failed} failed</span>` : ''}
            </div>`;
        }

        if (results.length > 0) {
            const trs = results.map(r => `
                <tr>
                    <td style="padding:4px 8px;border-bottom:1px solid #e8e8e8">${escHtml(String(r.label))}</td>
                    <td style="padding:4px 8px;border-bottom:1px solid #e8e8e8">${escHtml(r.detail || '')}</td>
                    <td style="padding:4px 8px;border-bottom:1px solid #e8e8e8">
                        ${r.success
                            ? `<span style="color:#28a745">&#10003; ${escHtml(verb.charAt(0).toUpperCase() + verb.slice(1))}</span>`
                              + (r.link ? ` &nbsp;<a href="${escHtml(r.link)}" target="_blank" style="color:#1f5ea8">${escHtml(r.linkLabel || r.link)}</a>` : '')
                            : `<span style="color:#dc3545">&#10007; Failed</span> &nbsp;<span style="color:#721c24">${escHtml(r.error || '')}</span>`
                        }
                    </td>
                </tr>`).join('');
            body += `<table style="border-collapse:collapse;width:100%;margin-bottom:16px">
                <thead><tr>
                    <th style="background:#1f5ea8;color:#fff;padding:6px 8px;text-align:left;font-size:11px;white-space:nowrap">Invoice ID</th>
                    <th style="background:#1f5ea8;color:#fff;padding:6px 8px;text-align:left;font-size:11px;white-space:nowrap">Detail</th>
                    <th style="background:#1f5ea8;color:#fff;padding:6px 8px;text-align:left;font-size:11px;white-space:nowrap">Result</th>
                </tr></thead>
                <tbody>${trs}</tbody>
            </table>`;
        }

        body += `<a href="${escHtml(backUrl)}" style="background:#1f5ea8;color:#fff;padding:6px 14px;border-radius:3px;text-decoration:none;font-size:12px;display:inline-block">&#8592; Back to List</a>`;
        body += `</div>`;

        const form = serverWidget.createForm({ title: pageTitle });
        const htmlField = form.addField({ id: 'custpage_results', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
        htmlField.defaultValue = body;
        ctx.response.writePage(form);
    };

    // -------------------------------------------------------------------------
    // HTML builder
    // -------------------------------------------------------------------------

    const buildHtml = (rows, filters, dropdowns, page, totalPages, total, baseUrl) => {

        const buildUrl = (overrides) => {
            const p = Object.assign({
                f_search: filters.search, f_brand: filters.brand, f_store: filters.store,
                f_franc: filters.franc, f_week: filters.week, f_from: filters.from,
                f_to: filters.to, f_eft_type: filters.eft_type, page
            }, overrides);
            const qs = Object.entries(p)
                .filter(([, v]) => v !== '' && v !== null && v !== undefined)
                .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
            return baseUrl + (qs ? '&' + qs : '');
        };

        const exportUrl = buildUrl({ export: '1', page: '' });

        const selOptsSavedSearches =
            `<option value=""${!filters.search ? ' selected' : ''}>-- Select a Search --</option>` +
            SAVED_SEARCHES.map(s => `<option value="${escHtml(s.id)}"${s.id === filters.search ? ' selected' : ''}>${escHtml(s.label)}</option>`).join('');

        const selOptsPairs = (pairs, selectedId) =>
            pairs.map(p => `<option value="${escHtml(p.id)}"${String(p.id) === String(selectedId) ? ' selected' : ''}>${escHtml(p.name)}</option>`).join('');

        const selOptsWeeks = (values, selected) =>
            values.map(v => `<option value="${escHtml(v)}"${v === selected ? ' selected' : ''}>${escHtml(v)}</option>`).join('');

        const selOptsEftType = EFT_TYPES.map(t =>
            `<option value="${escHtml(t.id)}"${t.id === filters.eft_type ? ' selected' : ''}>${escHtml(t.name)}</option>`).join('');

        const thCells = `<th style="width:32px;text-align:center"><input type="checkbox" id="pnd-check-all"></th>`
                      + COLUMNS.map(c => `<th>${escHtml(c)}</th>`).join('');

        const trRows = rows.map(row => {
            // After reorderRow:
            //   row[0]  = Invoice Internal ID (transaction id)
            //   row[5]  = EFT Type display text (primary — for reference only, dropdown is authoritative)
            //   row[20] = Primary EBD ID
            //   row[21] = Secondary EBD ID ('' if none)
            const id           = row[0] == null ? '' : String(row[0]);
            const primaryEbdId = row[20] != null ? String(row[20]) : '';
            const secEbdId     = row[21] != null ? String(row[21]) : '';
            const drillUrl     = id ? `/app/accounting/transactions/custinvc.nl?id=${encodeURIComponent(id)}` : '';
            const hasSecondary = secEbdId !== '';

            // Checkbox carries both EBD IDs as data-attributes for payment submission
            const cbCell = `<td style="text-align:center">
                <input type="checkbox" class="pnd-row-cb"
                       data-id="${escHtml(id)}"
                       data-primary-ebd="${escHtml(primaryEbdId)}"
                       data-secondary-ebd="${escHtml(secEbdId)}">
            </td>`;

            // Render only the first COLUMNS.length elements as cells
            const tds = row.slice(0, COLUMNS.length).map((v, i) => {
                if (i === 0 && drillUrl) {
                    return `<td><a href="${drillUrl}" target="_blank">${escHtml(v == null ? '' : String(v))}</a></td>`;
                }
                if (i === 5) {
                    // EFT Type — inline dropdown, defaults to Primary
                    return `<td>
                        <select class="pnd-eft-sel" data-id="${escHtml(id)}"
                                style="font-size:11px;border:1px solid #bbb;border-radius:2px;padding:2px 4px;cursor:pointer;background:#fff">
                            <option value="1">Primary</option>
                            ${hasSecondary ? '<option value="2">Secondary</option>' : ''}
                        </select>
                    </td>`;
                }
                return `<td>${escHtml(v == null ? '' : String(v))}</td>`;
            }).join('');

            return `<tr>${cbCell}${tds}</tr>`;
        }).join('\n');

        const start   = (page - 1) * PAGE_SIZE + 1;
        const end     = Math.min(page * PAGE_SIZE, total);
        const prevUrl = page > 1         ? buildUrl({ page: page - 1 }) : '';
        const nextUrl = page < totalPages ? buildUrl({ page: page + 1 }) : '';

        const pageButtons = (() => {
            if (totalPages <= 1) return '';
            let html = ''; const range = 2;
            for (let p = 1; p <= totalPages; p++) {
                if (p === 1 || p === totalPages || (p >= page - range && p <= page + range)) {
                    html += p === page ? `<span class="pg-btn pg-active">${p}</span>`
                                       : `<a class="pg-btn" href="${buildUrl({ page: p })}">${p}</a>`;
                } else if (p === page - range - 1 || p === page + range + 1) {
                    html += `<span class="pg-ellipsis">…</span>`;
                }
            }
            return html;
        })();

        const countLabel = total + ' record' + (total !== 1 ? 's' : '') +
            (total > 0 ? ' &nbsp;|&nbsp; Showing ' + start + '&ndash;' + end : '');

        return `
<style>
  #pnd-wrap * { box-sizing: border-box; }
  #pnd-wrap { font-family: Arial, sans-serif; font-size: 12px; }
  .pnd-filters {
    background: #f0f4fb; border: 1px solid #c8d4e8; border-radius: 4px;
    padding: 10px 14px; margin-bottom: 10px;
    display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end;
  }
  .pnd-fg { display: flex; flex-direction: column; gap: 3px; }
  .pnd-fg label { font-size: 10px; font-weight: bold; color: #444; text-transform: uppercase; letter-spacing: .3px; }
  .pnd-fg select, .pnd-fg input[type=text], .pnd-fg input[type=date] {
    font-size: 12px; padding: 4px 6px; border: 1px solid #bbb;
    border-radius: 3px; min-width: 130px; background:#fff;
  }
  .pnd-fg select.pnd-search-sel { min-width: 280px; border-color: #1f5ea8; }
  .pnd-btn { padding: 5px 12px; font-size: 12px; border-radius: 3px; cursor: pointer; text-decoration: none; display: inline-block; border: 1px solid transparent; }
  .pnd-apply  { background: #1f5ea8; color: #fff; border-color: #1f5ea8; }
  .pnd-apply:hover  { background: #174d8c; }
  .pnd-reset  { background: #fff; color: #333; border-color: #999; }
  .pnd-reset:hover  { background: #eee; }
  .pnd-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
  .pnd-export { background: #217346; color: #fff; border-color: #217346; }
  .pnd-export:hover { background: #185c38; }
  .pnd-create { background: #0d47a1; color: #fff; border-color: #0d47a1; }
  .pnd-create:not([disabled]):hover { background: #0a3580; }
  .pnd-create[disabled] { opacity: .45; cursor: not-allowed; }
  .pnd-mark   { background: #fff; color: #333; border-color: #aaa; }
  .pnd-mark:hover { background: #f0f4fb; }
  .pnd-count  { color: #555; font-size: 12px; }
  .pnd-pagination { display: flex; align-items: center; gap: 4px; margin-left: auto; }
  .pg-btn, .pg-ellipsis {
    display: inline-block; padding: 3px 8px; font-size: 11px;
    border: 1px solid #bbb; border-radius: 3px;
    background: #fff; color: #333; text-decoration: none; line-height: 1.4;
  }
  .pg-btn:hover { background: #e8f0fe; border-color: #1f5ea8; color: #1f5ea8; }
  .pg-active { background: #1f5ea8 !important; color: #fff !important; border-color: #1f5ea8 !important; cursor: default; }
  .pg-ellipsis { border: none; background: none; color: #888; padding: 3px 2px; }
  .pg-nav { font-size: 12px; }
  .pnd-table-wrap { overflow-x: auto; }
  #pnd-table { border-collapse: collapse; width: 100%; min-width: 800px; }
  #pnd-table th {
    background: #1f5ea8; color: #fff; padding: 6px 8px;
    text-align: left; white-space: nowrap; font-size: 11px;
    position: sticky; top: 0; z-index: 1;
  }
  #pnd-table td { padding: 4px 8px; border-bottom: 1px solid #e8e8e8; white-space: nowrap; }
  #pnd-table td a { color: #1f5ea8; text-decoration: none; }
  #pnd-table td a:hover { text-decoration: underline; }
  #pnd-table tr:nth-child(even) td { background: #f5f8ff; }
  #pnd-table tr:hover td { background: #dce8ff !important; }
  #pnd-table tr.pnd-selected td { background: #c8d8f8 !important; }
  #pnd-check-all, .pnd-row-cb { cursor: pointer; width: 14px; height: 14px; }
  .pnd-no-results { padding: 20px; color: #888; text-align: center; }
  .pnd-eft-sel { min-width: 80px; }
</style>

<div id="pnd-wrap">

  <div class="pnd-filters">
    <div class="pnd-fg">
      <label>Saved Search</label>
      <select id="f-search" class="pnd-search-sel">${selOptsSavedSearches}</select>
    </div>
    <div class="pnd-fg">
      <label>EFT Type</label>
      <select id="f-eft-type">
        <option value="">- All -</option>${selOptsEftType}
      </select>
    </div>
    <div class="pnd-fg">
      <label>Brand</label>
      <select id="f-brand">
        <option value="">- All -</option>${selOptsPairs(dropdowns.brands, filters.brand)}
      </select>
    </div>
    <div class="pnd-fg">
      <label>Store Number</label>
      <input id="f-store" type="text" placeholder="e.g. ME002528" value="${escHtml(filters.store)}">
    </div>
    <div class="pnd-fg">
      <label>Master Franchisee</label>
      <select id="f-franc">
        <option value="">- All -</option>${selOptsPairs(dropdowns.francs, filters.franc)}
      </select>
    </div>
    <div class="pnd-fg">
      <label>Week Ending Date</label>
      <select id="f-week">
        <option value="">All</option>${selOptsWeeks(dropdowns.weeks, filters.week)}
      </select>
    </div>
    <div class="pnd-fg">
      <label>From</label>
      <input id="f-from" type="date" value="${escHtml(filters.from)}">
    </div>
    <div class="pnd-fg">
      <label>To</label>
      <input id="f-to" type="date" value="${escHtml(filters.to)}">
    </div>
    <button type="button" class="pnd-btn pnd-apply" onclick="applyFilters()">&#128269; Apply</button>
    <a class="pnd-btn pnd-reset" href="${escHtml(baseUrl)}">&#x21BA; Reset</a>
  </div>

  <div class="pnd-toolbar">
    <a id="pnd-export-link" class="pnd-btn pnd-export" href="${escHtml(exportUrl)}">&#11015; Export to CSV</a>
    <button type="button" id="pnd-create-btn" class="pnd-btn pnd-create" onclick="createSelectedPayments()" disabled>
      &#9654; Create Payment Drafts (0)
    </button>
    <button type="button" class="pnd-btn pnd-mark" onclick="toggleAll(true)">&#9745; Mark All</button>
    <button type="button" class="pnd-btn pnd-mark" onclick="toggleAll(false)">&#9744; Unmark All</button>
    <span class="pnd-count">${countLabel}</span>
    <div class="pnd-pagination">
      ${prevUrl ? `<a class="pg-btn pg-nav" href="${escHtml(prevUrl)}">&lsaquo; Prev</a>` : `<span class="pg-btn pg-nav" style="opacity:.4;cursor:default">&lsaquo; Prev</span>`}
      ${pageButtons}
      ${nextUrl ? `<a class="pg-btn pg-nav" href="${escHtml(nextUrl)}">Next &rsaquo;</a>` : `<span class="pg-btn pg-nav" style="opacity:.4;cursor:default">Next &rsaquo;</span>`}
    </div>
  </div>

  <div class="pnd-table-wrap">
    ${total > 0 ? `<table id="pnd-table">
      <thead><tr>${thCells}</tr></thead>
      <tbody>${trRows}</tbody>
    </table>` : `<div class="pnd-no-results">No records match the current filters.</div>`}
  </div>

</div>

<script>
(function() {
  var baseUrl    = ${JSON.stringify(baseUrl)};
  var exportBase = ${JSON.stringify(exportUrl)};

  window.applyFilters = function() {
    var params  = [];
    var srch    = document.getElementById('f-search').value;
    var eftType = document.getElementById('f-eft-type').value;
    var brand   = document.getElementById('f-brand').value;
    var store   = document.getElementById('f-store').value.trim();
    var franc   = document.getElementById('f-franc').value;
    var week    = document.getElementById('f-week').value;
    var from    = document.getElementById('f-from').value;
    var to      = document.getElementById('f-to').value;
    if (srch)    params.push('f_search='   + encodeURIComponent(srch));
    if (eftType) params.push('f_eft_type=' + encodeURIComponent(eftType));
    if (brand)   params.push('f_brand='    + encodeURIComponent(brand));
    if (store)   params.push('f_store='    + encodeURIComponent(store));
    if (franc)   params.push('f_franc='    + encodeURIComponent(franc));
    if (week)    params.push('f_week='     + encodeURIComponent(week));
    if (from)    params.push('f_from='     + encodeURIComponent(from));
    if (to)      params.push('f_to='       + encodeURIComponent(to));
    params.push('page=1');
    window.location.href = baseUrl + (params.length ? '&' + params.join('&') : '');
  };
  var storeInput = document.getElementById('f-store');
  if (storeInput) storeInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') applyFilters(); });

  function getCheckboxes() { return Array.from(document.querySelectorAll('.pnd-row-cb')); }
  function getChecked()    { return getCheckboxes().filter(function(cb) { return cb.checked; }); }

  function updateToolbar() {
    var checked = getChecked();
    var count   = checked.length;

    var createBtn = document.getElementById('pnd-create-btn');
    createBtn.textContent = '\u25B6 Create Payment Drafts (' + count + ')';
    createBtn.disabled    = count === 0;

    var exportLink = document.getElementById('pnd-export-link');
    if (count > 0) {
      var ids = checked.map(function(cb) { return cb.dataset.id; }).join(',');
      exportLink.href        = exportBase + '&ids=' + encodeURIComponent(ids);
      exportLink.textContent = '\u2B07 Export Selected (' + count + ')';
    } else {
      exportLink.href        = exportBase;
      exportLink.textContent = '\u2B07 Export to CSV';
    }
  }

  function updateHeaderCheckbox() {
    var all = getCheckboxes(), chk = getChecked();
    var hdr = document.getElementById('pnd-check-all');
    if (!hdr) return;
    hdr.indeterminate = chk.length > 0 && chk.length < all.length;
    hdr.checked       = all.length > 0 && chk.length === all.length;
  }

  function onRowCheckChange(cb) {
    var row = cb.closest('tr');
    if (row) row.classList.toggle('pnd-selected', cb.checked);
    updateHeaderCheckbox();
    updateToolbar();
  }

  getCheckboxes().forEach(function(cb) {
    cb.addEventListener('change', function() { onRowCheckChange(cb); });
  });

  var hdrCb = document.getElementById('pnd-check-all');
  if (hdrCb) {
    hdrCb.addEventListener('change', function() {
      getCheckboxes().forEach(function(cb) {
        cb.checked = hdrCb.checked;
        var row = cb.closest('tr');
        if (row) row.classList.toggle('pnd-selected', cb.checked);
      });
      updateToolbar();
    });
  }

  window.toggleAll = function(checked) {
    getCheckboxes().forEach(function(cb) {
      cb.checked = checked;
      var row = cb.closest('tr');
      if (row) row.classList.toggle('pnd-selected', checked);
    });
    updateHeaderCheckbox();
    updateToolbar();
  };

  window.createSelectedPayments = function() {
    var checked = getChecked();
    if (!checked.length) { alert('No records selected.'); return; }
    if (checked.length > ${MAX_CREATE}) {
      alert('Maximum ${MAX_CREATE} records per batch. Currently selected: ' + checked.length + '. Please select fewer records.');
      return;
    }
    if (!confirm('Create ' + checked.length + ' Customer Payment record' + (checked.length !== 1 ? 's' : '') + '?\\nThis cannot be undone.')) return;

    var ids    = [];
    var ebdIds = [];
    checked.forEach(function(cb) {
      ids.push(cb.dataset.id);
      // Find the EFT Type dropdown in the same row to determine which EBD ID to use
      var row    = cb.closest('tr');
      var sel    = row ? row.querySelector('.pnd-eft-sel') : null;
      var selVal = sel ? sel.value : '1';  // default Primary if dropdown not found
      // Use the EBD ID matching the selected type
      var ebdId  = (selVal === '2' && cb.dataset.secondaryEbd)
                      ? cb.dataset.secondaryEbd
                      : cb.dataset.primaryEbd;
      ebdIds.push(ebdId || '');
    });

    var f = document.createElement('form');
    f.method = 'POST'; f.action = baseUrl + '&action=create';
    var inp1 = document.createElement('input');
    inp1.type = 'hidden'; inp1.name = 'ids'; inp1.value = ids.join(',');
    var inp2 = document.createElement('input');
    inp2.type = 'hidden'; inp2.name = 'ebd_ids'; inp2.value = ebdIds.join(',');
    f.appendChild(inp1); f.appendChild(inp2);
    document.body.appendChild(f); f.submit();
  };

  updateToolbar();
})();
</script>`;
    };

    // -------------------------------------------------------------------------
    // CSV export
    // -------------------------------------------------------------------------

    const streamCsv = (ctx, filteredIds, idsParam) => {
        const selectedIds = (idsParam || '').split(',').map(s => parseInt(s.trim(), 10)).filter(n => n > 0);
        const rows        = selectedIds.length > 0 ? runRowsByIds(selectedIds) : runRowsByIds(filteredIds);
        const ts          = formatTimestamp(new Date());
        const filename    = `GTF_PreNotif_PaymentDrafts_${ts}.csv`;
        ctx.response.setHeader({ name: 'Content-Type',        value: 'text/csv; charset=utf-8' });
        ctx.response.setHeader({ name: 'Content-Disposition', value: `attachment; filename="${filename}"` });
        ctx.response.write(buildCsv(rows));
    };

    const csvCell = (val) => {
        if (val === null || val === undefined) return '""';
        return `"${String(val).replace(/"/g, '""')}"`;
    };

    const buildCsv = (rows) => {
        const header = COLUMNS.map(csvCell).join(',');
        // row.slice(0, COLUMNS.length) excludes the extra EBD ID elements at positions 20-21
        const lines  = rows.map(row => row.slice(0, COLUMNS.length).map(csvCell).join(','));
        return [header, ...lines].join('\r\n');
    };

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    const sanitize = (val) => String(val || '').replace(/[';]/g, '').trim();

    const escHtml = (str) => String(str == null ? '' : str)
        .replace(/&/g,  '&amp;').replace(/</g,  '&lt;').replace(/>/g,  '&gt;')
        .replace(/"/g,  '&quot;').replace(/'/g, '&#39;');

    const formatTimestamp = (d) => {
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}` +
               `_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    };

    return { onRequest };
});
