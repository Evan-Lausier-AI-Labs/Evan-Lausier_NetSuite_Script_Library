/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * GTF | Pre-Notification Franchise Payment Drafts
 *
 * Replicates saved search customsearch_gtf_prenotif_child_custom_8 with
 * enhancements: first line item lookup, per-row checkboxes, and direct
 * Customer Payment creation from selected rows.
 *
 * Script ID:    customscript_gtf_sl_prenotif_drafts
 * Deploy ID:    customdeploy_store_level_payment_draft
 *
 * Fix (2026-03-31a): baseUrl stripped of script/deploy params — re-appended.
 * Fix (2026-03-31b): Invoice Memo rename; Payment Note(Memo) = first line
 *   itemid; removed redundant First Line Item column; batched lookup.
 * Fix (2026-03-31c): Payment Note(Memo) uses itemid not displayname.
 * Feat (2026-03-31d): Per-row checkboxes, Mark/Unmark All, Create Payment
 *   Drafts button — creates Customer Payment records via N/record using the
 *   same field mapping as import map "HS | Payment Drafting - Parent".
 *   Max 200 records per batch (governance safety cap).
 * Chore (2026-03-31e): Page titles renamed to "Store Level Payment Drafts".
 */

define(['N/query', 'N/log', 'N/ui/serverWidget', 'N/record'],
       (query,    log,     serverWidget,          record) => {

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    const PAGE_SIZE  = 100;
    const BATCH_SIZE = 500;   // max IDs per SuiteQL IN clause / runSuiteQL call
    const MAX_CREATE = 200;   // governance safety cap for payment creation batch

    const COLUMNS = [
        'Internal ID',              // 0
        'Add Payment Number',       // 1
        'Payment Preference',       // 2
        'Customer Internal ID',     // 3
        'Subsidiary External ID',   // 4
        'Bank Account to Draft',    // 5
        'Date',                     // 6
        'Invoice Memo',             // 7
        'AR Account External ID',   // 8
        'Payment Note(Memo)',       // 9  ← item.itemid from first line
        'Bank Account External ID', // 10
        'GTF Bank Internal ID',     // 11
        'Currency',                 // 12
        'Payment Amount',           // 13
        'Apply to Invoice ID',      // 14
        'For Electronic Payment',   // 15
        'Undeposited Funds'         // 16
    ];

    const BASE_FROM = `
        FROM transaction t
        JOIN transactionline tl ON tl.transaction = t.id
                                AND tl.mainline   = 'T'
                                AND tl.taxline    = 'F'
        JOIN customer   c   ON c.id   = t.entity
        JOIN subsidiary sub ON sub.id = tl.subsidiary
        JOIN account    a   ON a.id   = tl.expenseaccount
    `;

    const BASE_WHERE = `
        WHERE t.type     = 'CustInvc'
          AND t.posting  = 'T'
          AND t.status NOT IN ('B','V','R','C')
          AND c.custentity_2663_direct_debit      = 'T'
          AND c.custentity_2663_customer_refund   = 'T'
          AND c.category                         <> 8
          AND t.custbody_gtf_trxonhold            = 'F'
          AND c.custentity_gtf_payment_preference = 2
    `;

    // Payment Note(Memo) is NULL here; fetchFirstLineItems() fills it in JS.
    const DATA_SELECT = `
        SELECT
            t.id                                                                AS "Internal ID",
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
            const scriptId   = params.script  || '';
            const deployId   = params.deploy  || '';

            const filters = {
                brand : sanitize(params.f_brand || ''),
                store : sanitize(params.f_store || ''),
                franc : sanitize(params.f_franc || ''),
                week  : sanitize(params.f_week  || ''),
                from  : sanitize(params.f_from  || ''),
                to    : sanitize(params.f_to    || '')
            };

            const filterWhere = buildFilterWhere(filters);
            const page        = Math.max(1, parseInt(params.page || '1', 10));

            if (exportMode) {
                streamCsv(ctx, filterWhere);
            } else if (createMode) {
                createPayments(ctx, params.ids || '', scriptId, deployId);
            } else {
                renderPage(ctx, filters, filterWhere, page, scriptId, deployId);
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

    const renderPage = (ctx, filters, filterWhere, page, scriptId, deployId) => {
        const dropdowns  = runDropdownQuery(filterWhere);
        const total      = runCountQuery(filterWhere);
        const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        const safePage   = Math.min(page, totalPages);
        const rows       = runPageQuery(filterWhere, safePage);

        const rawBase = ctx.request.url.split('?')[0];
        const baseUrl = rawBase
            + '?script=' + encodeURIComponent(scriptId)
            + '&deploy=' + encodeURIComponent(deployId);

        const form = serverWidget.createForm({
            title: 'Store Level Payment Drafts'
        });
        const htmlField = form.addField({
            id   : 'custpage_results',
            type : serverWidget.FieldType.INLINEHTML,
            label: ' '
        });
        htmlField.defaultValue = buildHtml(
            rows, filters, dropdowns, safePage, totalPages, total, baseUrl
        );
        ctx.response.writePage(form);
    };

    // -------------------------------------------------------------------------
    // Queries — display / export
    // -------------------------------------------------------------------------

    const buildFilterWhere = (f) => {
        const clauses = [];
        if (f.brand) clauses.push(`BUILTIN.DF(c.custentity_gtf_brand) = '${f.brand}'`);
        if (f.store) clauses.push(`UPPER(c.externalid) LIKE UPPER('%${f.store}%')`);
        if (f.franc) clauses.push(`BUILTIN.DF(c.parent) = '${f.franc}'`);
        if (f.week)  clauses.push(`TO_CHAR(t.custbody_gtf_weekenddate, 'MM/DD/YYYY') = '${f.week}'`);
        if (f.from)  clauses.push(`t.trandate >= TO_DATE('${f.from}', 'YYYY-MM-DD')`);
        if (f.to)    clauses.push(`t.trandate <= TO_DATE('${f.to}', 'YYYY-MM-DD')`);
        return clauses.length ? ' AND ' + clauses.join(' AND ') : '';
    };

    const LIGHT_FROM = `
        FROM transaction t
        JOIN transactionline tl ON tl.transaction = t.id
                                AND tl.mainline   = 'T'
                                AND tl.taxline    = 'F'
        JOIN customer   c   ON c.id   = t.entity
        JOIN subsidiary sub ON sub.id = tl.subsidiary
    `;

    const runCountQuery = (filterWhere) => {
        const sql    = `SELECT t.id ${LIGHT_FROM} ${BASE_WHERE} ${filterWhere} ORDER BY t.id`;
        const paged  = query.runSuiteQLPaged({ query: sql, pageSize: 1000 });
        const ranges = paged.pageRanges;
        if (!ranges || ranges.length === 0) return 0;
        const lastPage  = paged.fetch({ index: ranges.length - 1 });
        const lastCount = (lastPage.data.results || []).length;
        return (ranges.length - 1) * 1000 + lastCount;
    };

    const runDropdownQuery = (filterWhere) => {
        const sql = `
            SELECT DISTINCT
                BUILTIN.DF(c.custentity_gtf_brand)                         AS brand,
                BUILTIN.DF(c.parent)                                        AS master_franc,
                NVL(TO_CHAR(t.custbody_gtf_weekenddate, 'MM/DD/YYYY'), '') AS week_ending
            ${LIGHT_FROM} ${BASE_WHERE} ${filterWhere}
            ORDER BY 1, 2, 3
        `;
        const paged  = query.runSuiteQLPaged({ query: sql, pageSize: 1000 });
        const brands = new Set();
        const francs = new Set();
        const weeks  = new Set();
        paged.pageRanges.forEach(range => {
            const pg = paged.fetch({ index: range.index });
            (pg.data.results || []).forEach(row => {
                if (row.values[0]) brands.add(String(row.values[0]));
                if (row.values[1]) francs.add(String(row.values[1]));
                if (row.values[2]) weeks.add(String(row.values[2]));
            });
        });
        return {
            brands: Array.from(brands).sort(),
            francs: Array.from(francs).sort(),
            weeks : Array.from(weeks).filter(v => v).sort()
        };
    };

    /**
     * Returns item.itemid for the first non-main, non-tax line of each
     * transaction, falling back to tl.memo for lines without an item.
     * Batched in chunks of BATCH_SIZE to avoid the 5,000-row runSuiteQL cap.
     * transactionline.id is a per-transaction sequence number — the JOIN back
     * must include BOTH transaction AND id.
     */
    const fetchFirstLineItems = (txnIds) => {
        if (!txnIds || txnIds.length === 0) return {};
        const map = {};
        for (let i = 0; i < txnIds.length; i += BATCH_SIZE) {
            const idList = txnIds.slice(i, i + BATCH_SIZE).join(',');
            const sql = `
                SELECT tl_min.transaction,
                       NVL(i.itemid, tl_first.memo) AS item_val
                FROM (
                    SELECT transaction, MIN(id) AS min_id
                    FROM transactionline
                    WHERE mainline = 'F'
                      AND taxline  = 'F'
                      AND transaction IN (${idList})
                    GROUP BY transaction
                ) tl_min
                JOIN transactionline tl_first ON tl_first.transaction = tl_min.transaction
                                              AND tl_first.id         = tl_min.min_id
                LEFT JOIN item i ON i.id = tl_first.item
            `;
            const rs = query.runSuiteQL({ query: sql });
            (rs.results || []).forEach(row => {
                map[String(row.values[0])] = row.values[1] || '';
            });
        }
        return map;
    };

    const mergeFirstLineItems = (rows) => {
        const txnIds = rows.map(r => r[0]).filter(Boolean);
        const map    = fetchFirstLineItems(txnIds);
        return rows.map(r => {
            const copy = r.slice();
            copy[9] = map[String(r[0])] || '';
            return copy;
        });
    };

    const runPageQuery = (filterWhere, page) => {
        const sql        = `${DATA_SELECT} ${BASE_FROM} ${BASE_WHERE} ${filterWhere} ORDER BY sub.externalid, t.trandate, t.id`;
        const pagedQuery = query.runSuiteQLPaged({ query: sql, pageSize: PAGE_SIZE });
        const pageIndex  = Math.min(page - 1, pagedQuery.pageRanges.length - 1);
        if (pageIndex < 0) return [];
        const pg   = pagedQuery.fetch({ index: pageIndex });
        const rows = (pg.data.results || []).map(r => r.values);
        return mergeFirstLineItems(rows);
    };

    const runAllRows = (filterWhere) => {
        const sql        = `${DATA_SELECT} ${BASE_FROM} ${BASE_WHERE} ${filterWhere} ORDER BY sub.externalid, t.trandate, t.id`;
        const pagedQuery = query.runSuiteQLPaged({ query: sql, pageSize: 1000 });
        const results    = [];
        pagedQuery.pageRanges.forEach(range => {
            const pg = pagedQuery.fetch({ index: range.index });
            (pg.data.results || []).forEach(r => results.push(r.values));
        });
        return mergeFirstLineItems(results);
    };

    // -------------------------------------------------------------------------
    // Payment creation — query
    // -------------------------------------------------------------------------

    /**
     * Fetches all fields needed to create Customer Payment records for the
     * given invoice IDs. Resolves external IDs to internal IDs inline:
     *   - bank_acct.id via LEFT JOIN on bank_acct.externalid = sub.custrecord_gtf_bank_account_number
     *   - ar_acct.id directly from tl.expenseaccount
     *   - currency, customer, subsidiary all returned as internal IDs
     *
     * Matches the field mapping of import map "HS | Payment Drafting - Parent".
     */
    const fetchCreateData = (txnIds) => {
        if (!txnIds || txnIds.length === 0) return [];
        const results = [];
        for (let i = 0; i < txnIds.length; i += BATCH_SIZE) {
            const idList = txnIds.slice(i, i + BATCH_SIZE).join(',');
            const sql = `
                SELECT
                    t.id                                                         AS txn_id,
                    c.id                                                         AS customer_id,
                    sub.id                                                       AS subsidiary_id,
                    bank_acct.id                                                 AS bank_account_id,
                    a.id                                                         AS ar_account_id,
                    t.currency                                                   AS currency_id,
                    sub.externalid || '-' || LPAD(TO_CHAR(t.id), 10, '0')       AS payment_number,
                    t.memo                                                       AS memo,
                    t.foreigntotal                                               AS payment_amount,
                    TO_CHAR(t.trandate, 'YYYY-MM-DD')                           AS tran_date
                FROM transaction t
                JOIN transactionline tl ON tl.transaction = t.id
                                        AND tl.mainline   = 'T'
                                        AND tl.taxline    = 'F'
                JOIN customer   c         ON c.id         = t.entity
                JOIN subsidiary sub       ON sub.id       = tl.subsidiary
                JOIN account    a         ON a.id         = tl.expenseaccount
                LEFT JOIN account bank_acct ON bank_acct.externalid = sub.custrecord_gtf_bank_account_number
                WHERE t.id IN (${idList})
            `;
            const rs = query.runSuiteQL({ query: sql });
            (rs.results || []).forEach(row => {
                results.push({
                    txnId         : row.values[0],
                    customerId    : row.values[1],
                    subsidiaryId  : row.values[2],
                    bankAccountId : row.values[3],
                    arAccountId   : row.values[4],
                    currencyId    : row.values[5],
                    paymentNumber : row.values[6],
                    memo          : row.values[7],
                    paymentAmount : row.values[8],
                    tranDate      : row.values[9]
                });
            });
        }
        return results;
    };

    // -------------------------------------------------------------------------
    // Payment creation — record creation and results renderer
    // -------------------------------------------------------------------------

    const createPayments = (ctx, idsParam, scriptId, deployId) => {
        const rawBase = ctx.request.url.split('?')[0];
        const backUrl = rawBase
            + '?script=' + encodeURIComponent(scriptId)
            + '&deploy=' + encodeURIComponent(deployId);

        const ids = (idsParam || '')
            .split(',')
            .map(s => parseInt(s.trim(), 10))
            .filter(n => n > 0);

        if (!ids.length) {
            return renderCreateResults(ctx, [], backUrl, 'No invoice IDs provided.');
        }
        if (ids.length > MAX_CREATE) {
            return renderCreateResults(ctx, [], backUrl,
                `Selection of ${ids.length} exceeds the maximum batch size of ${MAX_CREATE}. ` +
                `Please refine your filters or select fewer records.`);
        }

        const rows    = fetchCreateData(ids);
        const results = [];

        rows.forEach(row => {
            try {
                if (!row.bankAccountId) {
                    throw new Error('Bank account could not be resolved — verify subsidiary bank account number');
                }
                if (!row.arAccountId) {
                    throw new Error('AR account could not be resolved');
                }

                const rec = record.create({
                    type      : record.Type.CUSTOMER_PAYMENT,
                    isDynamic : true
                });

                // Header fields — order matters in dynamic mode:
                // set customer first so the apply sublist auto-populates
                rec.setValue({ fieldId: 'customer',                    value: parseInt(row.customerId) });
                rec.setValue({ fieldId: 'subsidiary',                   value: parseInt(row.subsidiaryId) });
                rec.setValue({ fieldId: 'account',                      value: parseInt(row.bankAccountId) });
                rec.setValue({ fieldId: 'aracct',                       value: parseInt(row.arAccountId) });
                rec.setValue({ fieldId: 'currency',                     value: parseInt(row.currencyId) });
                rec.setValue({ fieldId: 'trandate',                     value: new Date(row.tranDate + 'T00:00:00') });
                rec.setValue({ fieldId: 'memo',                         value: row.memo || '' });
                rec.setValue({ fieldId: 'externalid',                   value: row.paymentNumber });
                rec.setValue({ fieldId: 'tranid',                       value: row.paymentNumber });
                rec.setValue({ fieldId: 'payment',                      value: parseFloat(row.paymentAmount) });
                rec.setValue({ fieldId: 'custbody_9997_is_for_ep_dd',   value: true });
                rec.setValue({ fieldId: 'undepfunds',                   value: false });

                // Apply sublist — find the target invoice and mark it applied
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

                if (!applied) {
                    throw new Error(
                        `Invoice ${row.txnId} was not found in the apply sublist for customer ${row.customerId}. ` +
                        `It may already be applied, on hold, or not open.`
                    );
                }

                const newId = rec.save();
                results.push({ invoiceId: row.txnId, paymentNumber: row.paymentNumber, success: true,  newId });

            } catch (e) {
                log.error({ title: 'createPayments ERROR', details: `Invoice ${row.txnId}: ${e.message || e}` });
                results.push({ invoiceId: row.txnId, paymentNumber: row.paymentNumber, success: false, error: e.message || String(e) });
            }
        });

        renderCreateResults(ctx, results, backUrl, null);
    };

    const renderCreateResults = (ctx, results, backUrl, errorMsg) => {
        const succeeded = results.filter(r =>  r.success).length;
        const failed    = results.filter(r => !r.success).length;

        const bannerColor  = errorMsg || failed > 0 ? '#fff3cd' : '#d4edda';
        const bannerBorder = errorMsg || failed > 0 ? '#ffc107' : '#28a745';

        let body = `<div style="font-family:Arial,sans-serif;font-size:12px">`;

        if (errorMsg) {
            body += `<div style="background:${bannerColor};border:1px solid ${bannerBorder};border-radius:4px;padding:12px 16px;margin-bottom:14px;color:#856404">
                <strong>Cannot process:</strong> ${escHtml(errorMsg)}
            </div>`;
        } else {
            body += `<div style="background:${bannerColor};border:1px solid ${bannerBorder};border-radius:4px;padding:12px 16px;margin-bottom:14px">
                <strong>${succeeded} payment record${succeeded !== 1 ? 's' : ''} created</strong>
                ${failed > 0 ? ` &nbsp;&#124;&nbsp; <span style="color:#721c24">${failed} failed</span>` : ''}
            </div>`;
        }

        if (results.length > 0) {
            const trs = results.map(r => `
                <tr>
                    <td style="padding:4px 8px;border-bottom:1px solid #e8e8e8">${escHtml(String(r.invoiceId))}</td>
                    <td style="padding:4px 8px;border-bottom:1px solid #e8e8e8">${escHtml(r.paymentNumber || '')}</td>
                    <td style="padding:4px 8px;border-bottom:1px solid #e8e8e8">
                        ${r.success
                            ? `<span style="color:#28a745">&#10003; Created</span>
                               &nbsp;
                               <a href="/app/accounting/transactions/custpymt.nl?id=${r.newId}"
                                  target="_blank" style="color:#1f5ea8">CUSTPYMT ${r.newId}</a>`
                            : `<span style="color:#dc3545">&#10007; Failed</span>
                               &nbsp;
                               <span style="color:#721c24">${escHtml(r.error || '')}</span>`
                        }
                    </td>
                </tr>`).join('');

            body += `
                <table style="border-collapse:collapse;width:100%;margin-bottom:16px">
                    <thead>
                        <tr>
                            <th style="background:#1f5ea8;color:#fff;padding:6px 8px;text-align:left;font-size:11px;white-space:nowrap">Invoice ID</th>
                            <th style="background:#1f5ea8;color:#fff;padding:6px 8px;text-align:left;font-size:11px;white-space:nowrap">Payment Number</th>
                            <th style="background:#1f5ea8;color:#fff;padding:6px 8px;text-align:left;font-size:11px;white-space:nowrap">Result</th>
                        </tr>
                    </thead>
                    <tbody>${trs}</tbody>
                </table>`;
        }

        body += `<a href="${escHtml(backUrl)}"
                    style="background:#1f5ea8;color:#fff;padding:6px 14px;border-radius:3px;
                           text-decoration:none;font-size:12px;display:inline-block">
                    &#8592; Back to List
                </a>`;
        body += `</div>`;

        const form = serverWidget.createForm({ title: 'Store Level Payment Drafts — Creation Results' });
        const htmlField = form.addField({
            id   : 'custpage_results',
            type : serverWidget.FieldType.INLINEHTML,
            label: ' '
        });
        htmlField.defaultValue = body;
        ctx.response.writePage(form);
    };

    // -------------------------------------------------------------------------
    // HTML builder
    // -------------------------------------------------------------------------

    const buildHtml = (rows, filters, dropdowns, page, totalPages, total, baseUrl) => {

        const buildUrl = (overrides) => {
            const p = Object.assign({
                f_brand: filters.brand,
                f_store: filters.store,
                f_franc: filters.franc,
                f_week : filters.week,
                f_from : filters.from,
                f_to   : filters.to,
                page   : page
            }, overrides);
            const qs = Object.entries(p)
                .filter(([, v]) => v !== '' && v !== null && v !== undefined)
                .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
                .join('&');
            return baseUrl + (qs ? '&' + qs : '');
        };

        const exportUrl = buildUrl({ export: '1', page: '' });

        const selOpts = (values, selected) =>
            values.map(v => `<option value="${escHtml(v)}"${v === selected ? ' selected' : ''}>${escHtml(v)}</option>`).join('');

        // Checkbox column prepended before data columns
        const thCells = `<th style="width:32px;text-align:center">
                            <input type="checkbox" id="pnd-check-all" title="Select / deselect all on this page">
                         </th>`
                       + COLUMNS.map(c => `<th>${escHtml(c)}</th>`).join('');

        const trRows = rows.map(row => {
            const id       = row[0] == null ? '' : String(row[0]);
            const drillUrl = id ? `/app/accounting/transactions/custinvc.nl?id=${encodeURIComponent(id)}` : '';
            const cbCell   = `<td style="text-align:center"><input type="checkbox" class="pnd-row-cb" data-id="${escHtml(id)}"></td>`;
            const tds = row.map((v, i) => {
                const val = escHtml(v == null ? '' : String(v));
                if (i === 0 && drillUrl) return `<td><a href="${drillUrl}" target="_blank">${val}</a></td>`;
                return `<td>${val}</td>`;
            }).join('');
            return `<tr>${cbCell}${tds}</tr>`;
        }).join('\n');

        const start    = (page - 1) * PAGE_SIZE + 1;
        const end      = Math.min(page * PAGE_SIZE, total);
        const prevUrl  = page > 1         ? buildUrl({ page: page - 1 }) : '';
        const nextUrl  = page < totalPages ? buildUrl({ page: page + 1 }) : '';

        const pageButtons = (() => {
            if (totalPages <= 1) return '';
            let html = '';
            const range = 2;
            for (let p = 1; p <= totalPages; p++) {
                if (p === 1 || p === totalPages || (p >= page - range && p <= page + range)) {
                    html += p === page
                        ? `<span class="pg-btn pg-active">${p}</span>`
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
  .pnd-fg select,
  .pnd-fg input[type=text],
  .pnd-fg input[type=date] { font-size: 12px; padding: 4px 6px; border: 1px solid #bbb; border-radius: 3px; min-width: 130px; background:#fff; }
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
</style>

<div id="pnd-wrap">

  <div class="pnd-filters">
    <div class="pnd-fg">
      <label>Brand</label>
      <select id="f-brand">
        <option value="">- All -</option>
        ${selOpts(dropdowns.brands, filters.brand)}
      </select>
    </div>
    <div class="pnd-fg">
      <label>Store Number</label>
      <input id="f-store" type="text" placeholder="e.g. ME002528" value="${escHtml(filters.store)}">
    </div>
    <div class="pnd-fg">
      <label>Master Franchisee</label>
      <select id="f-franc">
        <option value="">- All -</option>
        ${selOpts(dropdowns.francs, filters.franc)}
      </select>
    </div>
    <div class="pnd-fg">
      <label>Week Ending Date</label>
      <select id="f-week">
        <option value="">All</option>
        ${selOpts(dropdowns.weeks, filters.week)}
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
    <button class="pnd-btn pnd-apply" onclick="applyFilters()">&#128269; Apply</button>
    <a class="pnd-btn pnd-reset" href="${escHtml(baseUrl)}">&#x21BA; Reset</a>
  </div>

  <div class="pnd-toolbar">
    <a class="pnd-btn pnd-export" href="${escHtml(exportUrl)}">&#11015; Export to CSV</a>
    <button id="pnd-create-btn" class="pnd-btn pnd-create" onclick="createSelectedPayments()" disabled>
      &#9654; Create Payment Drafts (0)
    </button>
    <button class="pnd-btn pnd-mark" onclick="toggleAll(true)">&#9745; Mark All</button>
    <button class="pnd-btn pnd-mark" onclick="toggleAll(false)">&#9744; Unmark All</button>
    <span class="pnd-count">${countLabel}</span>
    <div class="pnd-pagination">
      ${prevUrl ? `<a class="pg-btn pg-nav" href="${escHtml(prevUrl)}">&lsaquo; Prev</a>` : `<span class="pg-btn pg-nav" style="opacity:.4;cursor:default">&lsaquo; Prev</span>`}
      ${pageButtons}
      ${nextUrl ? `<a class="pg-btn pg-nav" href="${escHtml(nextUrl)}">Next &rsaquo;</a>` : `<span class="pg-btn pg-nav" style="opacity:.4;cursor:default">Next &rsaquo;</span>`}
    </div>
  </div>

  <div class="pnd-table-wrap">
    ${total > 0 ? `
    <table id="pnd-table">
      <thead><tr>${thCells}</tr></thead>
      <tbody>${trRows}</tbody>
    </table>` : `<div class="pnd-no-results">No records match the current filters.</div>`}
  </div>

</div>

<script>
(function() {
  var baseUrl = ${JSON.stringify(baseUrl)};

  // ── Filter apply ──────────────────────────────────────────────────────────
  window.applyFilters = function() {
    var params = [];
    var brand = document.getElementById('f-brand').value;
    var store = document.getElementById('f-store').value.trim();
    var franc = document.getElementById('f-franc').value;
    var week  = document.getElementById('f-week').value;
    var from  = document.getElementById('f-from').value;
    var to    = document.getElementById('f-to').value;
    if (brand) params.push('f_brand=' + encodeURIComponent(brand));
    if (store) params.push('f_store=' + encodeURIComponent(store));
    if (franc) params.push('f_franc=' + encodeURIComponent(franc));
    if (week)  params.push('f_week='  + encodeURIComponent(week));
    if (from)  params.push('f_from='  + encodeURIComponent(from));
    if (to)    params.push('f_to='    + encodeURIComponent(to));
    params.push('page=1');
    window.location.href = baseUrl + (params.length ? '&' + params.join('&') : '');
  };
  var storeInput = document.getElementById('f-store');
  if (storeInput) storeInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') applyFilters();
  });

  // ── Checkbox management ───────────────────────────────────────────────────
  function getCheckboxes()  { return Array.from(document.querySelectorAll('.pnd-row-cb')); }
  function getChecked()     { return getCheckboxes().filter(function(cb) { return cb.checked; }); }

  function updateCreateBtn() {
    var btn     = document.getElementById('pnd-create-btn');
    var count   = getChecked().length;
    btn.textContent = '\u25B6 Create Payment Drafts (' + count + ')';
    btn.disabled    = count === 0;
  }

  function updateHeaderCheckbox() {
    var all     = getCheckboxes();
    var checked = getChecked();
    var hdr     = document.getElementById('pnd-check-all');
    if (!hdr) return;
    hdr.indeterminate = checked.length > 0 && checked.length < all.length;
    hdr.checked       = all.length > 0 && checked.length === all.length;
  }

  function onRowCheckChange(cb) {
    var row = cb.closest('tr');
    if (row) row.classList.toggle('pnd-selected', cb.checked);
    updateHeaderCheckbox();
    updateCreateBtn();
  }

  // Wire up row checkboxes
  getCheckboxes().forEach(function(cb) {
    cb.addEventListener('change', function() { onRowCheckChange(cb); });
  });

  // Header checkbox — select / deselect all on current page
  var hdrCb = document.getElementById('pnd-check-all');
  if (hdrCb) {
    hdrCb.addEventListener('change', function() {
      getCheckboxes().forEach(function(cb) {
        cb.checked = hdrCb.checked;
        var row = cb.closest('tr');
        if (row) row.classList.toggle('pnd-selected', cb.checked);
      });
      updateCreateBtn();
    });
  }

  // Mark All / Unmark All buttons
  window.toggleAll = function(checked) {
    getCheckboxes().forEach(function(cb) {
      cb.checked = checked;
      var row = cb.closest('tr');
      if (row) row.classList.toggle('pnd-selected', checked);
    });
    updateHeaderCheckbox();
    updateCreateBtn();
  };

  // ── Create payment drafts ─────────────────────────────────────────────────
  window.createSelectedPayments = function() {
    var checked = getChecked().map(function(cb) { return cb.dataset.id; });
    if (!checked.length) {
      alert('No records selected.');
      return;
    }
    if (checked.length > ${MAX_CREATE}) {
      alert('Maximum ${MAX_CREATE} records per batch. Currently selected: ' + checked.length + '. Please refine your selection.');
      return;
    }
    if (!confirm('Create ' + checked.length + ' Customer Payment record' + (checked.length !== 1 ? 's' : '') + '?\\nThis cannot be undone.')) {
      return;
    }
    var form  = document.createElement('form');
    form.method = 'POST';
    form.action = baseUrl + '&action=create';
    var input = document.createElement('input');
    input.type  = 'hidden';
    input.name  = 'ids';
    input.value = checked.join(',');
    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
  };

  // Init
  updateCreateBtn();
})();
</script>`;
    };

    // -------------------------------------------------------------------------
    // CSV export
    // -------------------------------------------------------------------------

    const streamCsv = (ctx, filterWhere) => {
        const rows     = runAllRows(filterWhere);
        const ts       = formatTimestamp(new Date());
        const filename = `GTF_PreNotif_PaymentDrafts_${ts}.csv`;
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
        const lines  = rows.map(row => row.slice(0, COLUMNS.length).map(csvCell).join(','));
        return [header, ...lines].join('\r\n');
    };

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    const sanitize = (val) => String(val || '').replace(/[';]/g, '').trim();

    const escHtml = (str) => String(str == null ? '' : str)
        .replace(/&/g,  '&amp;')
        .replace(/</g,  '&lt;')
        .replace(/>/g,  '&gt;')
        .replace(/"/g,  '&quot;')
        .replace(/'/g,  '&#39;');

    const formatTimestamp = (d) => {
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}` +
               `_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    };

    return { onRequest };
});
