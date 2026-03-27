/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * GTF | Pre-Notification Franchise Payment Drafts
 *
 * Replicates saved search customsearch_gtf_prenotif_child_custom_8 with one
 * enhancement: adds "First Line Item" column via two-step item lookup.
 *
 * Renders inside the NS chrome using serverWidget (nav bar preserved).
 * Filters are applied server-side — only 100 rows fetched per page load.
 * Export downloads all filtered rows as CSV.
 *
 * Script ID:    customscript_gtf_sl_prenotif_drafts
 * Deploy ID:    customdeploy_gtf_sl_prenotif_drafts
 */

define(['N/query', 'N/log', 'N/ui/serverWidget'], (query, log, serverWidget) => {

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    const PAGE_SIZE = 100;

    const COLUMNS = [
        'Internal ID',
        'Add Payment Number',
        'Payment Preference',
        'Customer Internal ID',
        'Subsidiary External ID',
        'Bank Account to Draft',
        'Date',
        'Add Memo',
        'AR Account External ID',
        'Payment Note(Memo)',
        'Bank Account External ID',
        'GTF Bank Internal ID',
        'Currency',
        'Payment Amount',
        'Apply to Invoice ID',
        'For Electronic Payment',
        'First Line Item',
        'Undeposited Funds'
    ];

    // Base FROM — shared by all queries
    const BASE_FROM = `
        FROM transaction t
        JOIN transactionline tl ON tl.transaction = t.id
                                AND tl.mainline   = 'T'
                                AND tl.taxline    = 'F'
        JOIN customer   c   ON c.id   = t.entity
        JOIN subsidiary sub ON sub.id = tl.subsidiary
        JOIN account    a   ON a.id   = tl.expenseaccount
    `;

    // Base WHERE — always applied
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

    // Full SELECT — used for data pages and export.
    // "First Line Item" is NULL here; fetchFirstLineItems() fills it in JS.
    const DATA_SELECT = `
        SELECT
            t.id                                                                AS "Internal ID",
            sub.externalid || '-' || LPAD(TO_CHAR(t.id), 10, '0')             AS "Add Payment Number",
            BUILTIN.DF(c.custentity_gtf_payment_preference)                    AS "Payment Preference",
            c.id                                                                AS "Customer Internal ID",
            sub.externalid                                                      AS "Subsidiary External ID",
            sub.custrecord_gtf_bank_account_number                              AS "Bank Account to Draft",
            TO_CHAR(t.trandate, 'MM/DD/YYYY')                                  AS "Date",
            t.memo                                                              AS "Add Memo",
            a.externalid                                                        AS "AR Account External ID",
            CASE sub.custrecord_gtf_bank_account_number
                WHEN '1001'   THEN 'AdFund and LAG related charges'
                WHEN '100101' THEN 'POS support and vendor charges'
                WHEN '100203' THEN 'Royalties and brand related charges'
                WHEN '100204' THEN 'Royalties and brand related charges'
                WHEN '100205' THEN 'Royalties and brand related charges'
                WHEN '100206' THEN 'Royalties and brand related charges'
                WHEN '100207' THEN 'Royalties and brand related charges'
                WHEN '100208' THEN 'Royalties and brand related charges'
                WHEN '100209' THEN 'Royalties and brand related charges'
                WHEN '1002'   THEN 'AdFund and AdFund related charges'
                WHEN '1003'   THEN 'AdFund and AdFund related charges'
                WHEN '1004'   THEN 'AdFund and AdFund related charges'
                WHEN '1005'   THEN 'AdFund and AdFund related charges'
                WHEN '1006'   THEN 'AdFund and AdFund related charges'
                WHEN '1007'   THEN 'AdFund and AdFund related charges'
                WHEN '1008'   THEN 'AdFund and AdFund related charges'
                ELSE ''
            END                                                                 AS "Payment Note(Memo)",
            sub.custrecord_gtf_bank_account_number                              AS "Bank Account External ID",
            sub.custrecord4                                                      AS "GTF Bank Internal ID",
            BUILTIN.DF(t.currency)                                              AS "Currency",
            REPLACE(TO_CHAR(t.foreigntotal), ',', '')                          AS "Payment Amount",
            t.id                                                                AS "Apply to Invoice ID",
            'TRUE'                                                              AS "For Electronic Payment",
            NULL                                                                AS "First Line Item",
            'FALSE'                                                             AS "Undeposited Funds"
    `;

    // -------------------------------------------------------------------------
    // Entry point
    // -------------------------------------------------------------------------

    const onRequest = (ctx) => {
        try {
            const params     = ctx.request.parameters;
            const exportMode = params.export === '1';

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
            } else {
                renderPage(ctx, filters, filterWhere, page);
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
    // Page renderer — uses serverWidget so NS nav bar is preserved
    // -------------------------------------------------------------------------

    const renderPage = (ctx, filters, filterWhere, page) => {
        const dropdowns  = runDropdownQuery(filterWhere);
        const total      = runCountQuery(filterWhere);
        const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        const safePage   = Math.min(page, totalPages);
        const rows       = runPageQuery(filterWhere, safePage);
        const baseUrl    = ctx.request.url.split('?')[0];

        const form = serverWidget.createForm({
            title: 'GTF | Pre-Notification Franchise Payment Drafts'
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
    // Queries
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
        const sql   = `SELECT t.id ${LIGHT_FROM} ${BASE_WHERE} ${filterWhere} ORDER BY t.id`;
        const paged = query.runSuiteQLPaged({ query: sql, pageSize: 1000 });
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
     * Fetches the display name of the first non-main, non-tax line item for
     * each transaction in txnIds.
     *
     * IMPORTANT: transactionline.id is a per-transaction line sequence number
     * (1, 2, 3…), NOT a globally unique surrogate key. The JOIN back to
     * transactionline must include BOTH transaction AND id to avoid matching
     * line 1 from unrelated transactions across the whole table.
     *
     * Returns a map of { transactionId (string) -> displayname }.
     */
    const fetchFirstLineItems = (txnIds) => {
        if (!txnIds || txnIds.length === 0) return {};
        const idList = txnIds.join(',');
        const sql = `
            SELECT tl_min.transaction,
                   NVL(i.displayname, i.itemid) AS displayname
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
            JOIN item i ON i.id = tl_first.item
        `;
        const rs  = query.runSuiteQL({ query: sql });
        const map = {};
        (rs.results || []).forEach(row => {
            map[String(row.values[0])] = row.values[1] || '';
        });
        return map;
    };

    /**
     * Overwrites the NULL placeholder at column index 16 ("First Line Item")
     * with the item display name looked up by fetchFirstLineItems.
     */
    const mergeFirstLineItems = (rows) => {
        const txnIds = rows.map(r => r[0]).filter(Boolean);
        const map    = fetchFirstLineItems(txnIds);
        return rows.map(r => {
            const copy = r.slice();
            copy[16] = map[String(r[0])] || '';
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
            return baseUrl + (qs ? '?' + qs : '');
        };

        const exportUrl = buildUrl({ export: '1', page: '' });

        const selOpts = (values, selected) =>
            values.map(v => `<option value="${escHtml(v)}"${v === selected ? ' selected' : ''}>${escHtml(v)}</option>`).join('');

        const thCells = COLUMNS.map(c => `<th>${escHtml(c)}</th>`).join('');

        const trRows = rows.map(row => {
            const id       = row[0] == null ? '' : String(row[0]);
            const drillUrl = id ? `/app/accounting/transactions/custinvc.nl?id=${encodeURIComponent(id)}` : '';
            const tds = row.map((v, i) => {
                const val = escHtml(v == null ? '' : String(v));
                if (i === 0 && drillUrl) return `<td><a href="${drillUrl}" target="_blank">${val}</a></td>`;
                return `<td>${val}</td>`;
            }).join('');
            return `<tr>${tds}</tr>`;
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
                    if (p === page) {
                        html += `<span class="pg-btn pg-active">${p}</span>`;
                    } else {
                        html += `<a class="pg-btn" href="${buildUrl({ page: p })}">${p}</a>`;
                    }
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
  .pnd-fg input  { font-size: 12px; padding: 4px 6px; border: 1px solid #bbb; border-radius: 3px; min-width: 130px; background:#fff; }
  .pnd-btn { padding: 5px 12px; font-size: 12px; border-radius: 3px; cursor: pointer; text-decoration: none; display: inline-block; }
  .pnd-apply { background: #1f5ea8; color: #fff; border: 1px solid #1f5ea8; }
  .pnd-apply:hover { background: #174d8c; }
  .pnd-reset { background: #fff; color: #333; border: 1px solid #999; }
  .pnd-reset:hover { background: #eee; }
  .pnd-toolbar {
    display: flex; align-items: center; gap: 10px;
    margin-bottom: 8px; flex-wrap: wrap;
  }
  .pnd-export { background: #217346; color: #fff; border: 1px solid #217346; }
  .pnd-export:hover { background: #185c38; }
  .pnd-count { color: #555; font-size: 12px; }
  .pnd-pagination { display: flex; align-items: center; gap: 4px; margin-left: auto; }
  .pg-btn, .pg-ellipsis {
    display: inline-block; padding: 3px 8px; font-size: 11px;
    border: 1px solid #bbb; border-radius: 3px;
    background: #fff; color: #333; text-decoration: none;
    line-height: 1.4;
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
    window.location.href = baseUrl + (params.length ? '?' + params.join('&') : '');
  };

  var storeInput = document.getElementById('f-store');
  if (storeInput) {
    storeInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') applyFilters();
    });
  }
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
