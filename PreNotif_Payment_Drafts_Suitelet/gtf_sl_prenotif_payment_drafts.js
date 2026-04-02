/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * Store Level Payment Drafts
 *
 * Script ID:    customscript_gtf_sl_prenotif_drafts
 * Deploy ID:    customdeploy_store_level_payment_draft
 *
 * Fix (2026-03-31a): baseUrl fix. Fix (2026-03-31b/c): Invoice Memo / Payment Note.
 * Feat (2026-03-31d): Checkboxes + Create Payment Drafts. Fix (2026-04-01a-f): Various.
 * Feat (2026-04-02a): EFT columns from customrecord_2663_entity_bank_details.
 * Feat (2026-04-02b-c): EFT Type inline dropdown; ebd_ids POSTed with creation.
 * Chore (2026-04-02d-e): Filter bar cleanup.
 * Fix (2026-04-02f): Mark All selects all pages via allFilteredIds.
 * Fix (2026-04-02g): \\n literal newline JS syntax error fixed.
 * Chore (2026-04-02h): Mark All / Unmark All buttons styled blue (pnd-apply).
 * Fix (2026-04-02i): Removed explicit undepfunds=false.
 * Fix (2026-04-02j): Bank account sourced from customer's subsidiary (cs.custrecord4)
 *   rather than the transaction line's subsidiary. In dynamic mode, NS forces the
 *   payment subsidiary to the customer's home subsidiary, so the bank account must
 *   come from that same subsidiary. Both DATA_SELECT (display) and fetchCreateData
 *   (creation) now join JOIN subsidiary cs ON cs.id = c.subsidiary.
 */

define(['N/query', 'N/log', 'N/ui/serverWidget', 'N/record', 'N/search'],
       (query,    log,     serverWidget,          record,    search) => {

    const PAGE_SIZE  = 100;
    const BATCH_SIZE = 500;
    const MAX_CREATE = 200;

    const SAVED_SEARCHES = [
        { id: 'customsearch_gtf_prenotif_child_custom_8', label: 'Payment Drafts - Store Level' },
        { id: 'customsearch_gtf_prenotif_child_custom_5', label: 'Payment Drafts - Parent Level' }
    ];

    const EFT_TYPES = [
        { id: '1', name: 'Primary' },
        { id: '2', name: 'Secondary' }
    ];

    /**
     * Raw data array layout after all merges (22 elements):
     *  [0-16]  SQL columns  [17] EFT Record Name (primary)  [18] EFT Type display
     *  [19] EFT File Format  [20] Primary EBD ID  [21] Secondary EBD ID
     */
    const COLUMNS = [
        'Invoice Internal ID',      // 0  → data[0]
        'Add Payment Number',       // 1  → data[1]
        'Payment Preference',       // 2  → data[2]
        'Customer Internal ID',     // 3  → data[3]
        'Subsidiary External ID',   // 4  → data[4]
        'EFT Type',                 // 5  → data[18] ← inline dropdown
        'Bank Account to Draft',    // 6  → data[5]  ← from customer subsidiary (cs)
        'Date',                     // 7  → data[6]
        'Invoice Memo',             // 8  → data[7]
        'AR Account External ID',   // 9  → data[8]
        'Payment Note(Memo)',       // 10 → data[9]
        'Bank Account External ID', // 11 → data[10] ← from customer subsidiary (cs)
        'GTF Bank Internal ID',     // 12 → data[11] ← from customer subsidiary (cs)
        'Currency',                 // 13 → data[12]
        'Payment Amount',           // 14 → data[13]
        'Apply to Invoice ID',      // 15 → data[14]
        'For Electronic Payment',   // 16 → data[15]
        'Undeposited Funds',        // 17 → data[16]
        'EFT Record Name',          // 18 → data[17]
        'EFT Payment File Format'   // 19 → data[19]
    ];

    const COLUMN_DATA_INDICES = [0,1,2,3,4,18,5,6,7,8,9,10,11,12,13,14,15,16,17,19,20,21];

    // BASE_FROM joins both the transaction's subsidiary (sub, for Subsidiary External ID
    // display) and the customer's subsidiary (cs, for bank account fields and payment creation).
    const BASE_FROM = `
        FROM transaction t
        JOIN transactionline tl ON tl.transaction = t.id AND tl.mainline = 'T' AND tl.taxline = 'F'
        JOIN customer   c   ON c.id   = t.entity
        JOIN subsidiary sub ON sub.id = tl.subsidiary
        JOIN subsidiary cs  ON cs.id  = c.subsidiary
        JOIN account    a   ON a.id   = tl.expenseaccount
    `;

    const LIGHT_FROM = `
        FROM transaction t
        JOIN transactionline tl ON tl.transaction = t.id AND tl.mainline = 'T' AND tl.taxline = 'F'
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
            cs.custrecord_gtf_bank_account_number                               AS "Bank Account to Draft",
            TO_CHAR(t.trandate, 'MM/DD/YYYY')                                  AS "Date",
            t.memo                                                              AS "Invoice Memo",
            a.externalid                                                        AS "AR Account External ID",
            NULL                                                                AS "Payment Note(Memo)",
            cs.custrecord_gtf_bank_account_number                               AS "Bank Account External ID",
            cs.custrecord4                                                       AS "GTF Bank Internal ID",
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
                search    : searchId,
                brand     : sanitize(params.f_brand      || ''),
                subsidiary: sanitize(params.f_subsidiary || ''),
                from      : sanitize(params.f_from       || ''),
                to        : sanitize(params.f_to         || '')
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
            ctx.response.write(`<html><body><h2 style="color:red">Error</h2><pre>${e.message || JSON.stringify(e)}</pre></body></html>`);
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
        const baseUrl = rawBase + '?script=' + encodeURIComponent(scriptId) + '&deploy=' + encodeURIComponent(deployId);

        const form = serverWidget.createForm({ title: 'Payment Drafts' });
        const htmlField = form.addField({ id: 'custpage_results', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
        htmlField.defaultValue = buildHtml(rows, filters, dropdowns, safePage, totalPages, total, baseUrl, filteredIds);
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
            (paged.fetch({ index: range.index }).data || []).forEach(r => ids.push(parseInt(r.id, 10)));
        });
        return ids;
    };

    const getFilteredIds = (savedIds, filterWhere) => {
        if (!filterWhere || !savedIds.length) return savedIds.slice();
        const filteredIds = [];
        for (let i = 0; i < savedIds.length; i += BATCH_SIZE) {
            const sql   = `SELECT t.id ${LIGHT_FROM} WHERE t.id IN (${savedIds.slice(i,i+BATCH_SIZE).join(',')}) ${filterWhere} ORDER BY t.id`;
            const paged = query.runSuiteQLPaged({ query: sql, pageSize: 1000 });
            paged.pageRanges.forEach(range => {
                (paged.fetch({ index: range.index }).data.results || []).forEach(r => filteredIds.push(parseInt(r.values[0], 10)));
            });
        }
        return filteredIds;
    };

    const buildFilterWhere = (f) => {
        const clauses = [];
        if (f.brand)      clauses.push(`c.custentity_gtf_brand = ${parseInt(f.brand, 10)}`);
        if (f.subsidiary) clauses.push(`sub.id = ${parseInt(f.subsidiary, 10)}`);
        if (f.from)       clauses.push(`t.trandate >= TO_DATE('${f.from}', 'YYYY-MM-DD')`);
        if (f.to)         clauses.push(`t.trandate <= TO_DATE('${f.to}', 'YYYY-MM-DD')`);
        return clauses.length ? ' AND ' + clauses.join(' AND ') : '';
    };

    const runDropdownQuery = (savedIds) => {
        const brandMap = new Map(), subMap = new Map();
        for (let i = 0; i < savedIds.length; i += BATCH_SIZE) {
            const sql = `
                SELECT DISTINCT c.custentity_gtf_brand, BUILTIN.DF(c.custentity_gtf_brand),
                    sub.id, sub.name
                ${LIGHT_FROM} WHERE t.id IN (${savedIds.slice(i,i+BATCH_SIZE).join(',')}) ORDER BY 2, 4
            `;
            const paged = query.runSuiteQLPaged({ query: sql, pageSize: 1000 });
            paged.pageRanges.forEach(range => {
                (paged.fetch({ index: range.index }).data.results || []).forEach(row => {
                    const [bId, bName, sId, sName] = row.values;
                    if (bId && bName) brandMap.set(String(bId), String(bName));
                    if (sId && sName) subMap.set(String(sId), String(sName));
                });
            });
        }
        const sortPairs = m => Array.from(m.entries()).map(([id,name])=>({id,name})).sort((a,b)=>a.name.localeCompare(b.name));
        return { brands: sortPairs(brandMap), subsidiaries: sortPairs(subMap) };
    };

    // -------------------------------------------------------------------------
    // Data queries
    // -------------------------------------------------------------------------

    const fetchFirstLineItems = (txnIds) => {
        if (!txnIds || !txnIds.length) return {};
        const map = {};
        for (let i = 0; i < txnIds.length; i += BATCH_SIZE) {
            const sql = `
                SELECT tl_min.transaction, NVL(i.itemid, tl_first.memo) AS item_val
                FROM (SELECT transaction, MIN(id) AS min_id FROM transactionline
                      WHERE mainline='F' AND taxline='F' AND transaction IN (${txnIds.slice(i,i+BATCH_SIZE).join(',')})
                      GROUP BY transaction) tl_min
                JOIN transactionline tl_first ON tl_first.transaction=tl_min.transaction AND tl_first.id=tl_min.min_id
                LEFT JOIN item i ON i.id=tl_first.item
            `;
            (query.runSuiteQL({query:sql}).results||[]).forEach(row=>{map[String(row.values[0])]=row.values[1]||'';});
        }
        return map;
    };

    const mergeFirstLineItems = (rows) => {
        const map = fetchFirstLineItems(rows.map(r=>r[0]).filter(Boolean));
        return rows.map(r=>{const c=r.slice();c[9]=map[String(r[0])]||'';return c;});
    };

    const fetchBankDetails = (customerIds) => {
        if (!customerIds || !customerIds.length) return {};
        const map = {};
        const uniqueIds = [...new Set(customerIds.map(String).filter(Boolean))];
        for (let i = 0; i < uniqueIds.length; i += BATCH_SIZE) {
            const sql = `
                SELECT ebd.custrecord_2663_parent_cust_ref, ebd.id, ebd.custrecord_2663_entity_bank_type,
                       ebd.name, BUILTIN.DF(ebd.custrecord_2663_entity_bank_type),
                       BUILTIN.DF(ebd.custrecord_2663_entity_file_format)
                FROM customrecord_2663_entity_bank_details ebd
                WHERE ebd.custrecord_2663_parent_cust_ref IN (${uniqueIds.slice(i,i+BATCH_SIZE).join(',')})
                  AND ebd.isinactive='F'
                ORDER BY ebd.custrecord_2663_parent_cust_ref, ebd.custrecord_2663_entity_bank_type, ebd.id
            `;
            (query.runSuiteQL({query:sql}).results||[]).forEach(row=>{
                const custId=String(row.values[0]), ebdId=String(row.values[1]), typeId=String(row.values[2]);
                const name=row.values[3]||'', typeName=row.values[4]||'', format=row.values[5]||'';
                if (!map[custId]) map[custId]={primaryEbdId:'',primaryName:'',primaryTypeName:'Primary',primaryFormat:'',secondaryEbdId:'',secondaryName:'',secondaryFormat:''};
                if (typeId==='1'&&!map[custId].primaryEbdId)   {map[custId].primaryEbdId=ebdId;map[custId].primaryName=name;map[custId].primaryTypeName=typeName;map[custId].primaryFormat=format;}
                else if (typeId==='2'&&!map[custId].secondaryEbdId) {map[custId].secondaryEbdId=ebdId;map[custId].secondaryName=name;map[custId].secondaryFormat=format;}
            });
        }
        return map;
    };

    const mergeBankDetails = (rows) => {
        const map = fetchBankDetails(rows.map(r=>r[3]).filter(Boolean));
        return rows.map(r=>{
            const copy=r.slice(), d=map[String(r[3])]||{};
            copy[17]=d.primaryName||''; copy[18]=d.primaryTypeName||'Primary'; copy[19]=d.primaryFormat||'';
            copy[20]=d.primaryEbdId||''; copy[21]=d.secondaryEbdId||'';
            return copy;
        });
    };

    const reorderRow = (row) => COLUMN_DATA_INDICES.map(i=>(row[i]!==undefined?row[i]:''));

    const runPageQuery = (filteredIds, page) => {
        const pageIds = filteredIds.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);
        if (!pageIds.length) return [];
        const rs = query.runSuiteQL({query:`${DATA_SELECT}${BASE_FROM}WHERE t.id IN(${pageIds.join(',')})ORDER BY sub.externalid,t.trandate,t.id`});
        return mergeBankDetails(mergeFirstLineItems((rs.results||[]).map(r=>r.values))).map(reorderRow);
    };

    const runRowsByIds = (ids) => {
        const results=[];
        for (let i=0;i<ids.length;i+=BATCH_SIZE){
            const rs=query.runSuiteQL({query:`${DATA_SELECT}${BASE_FROM}WHERE t.id IN(${ids.slice(i,i+BATCH_SIZE).join(',')})ORDER BY sub.externalid,t.trandate,t.id`});
            (rs.results||[]).forEach(r=>results.push(r.values));
        }
        return mergeBankDetails(mergeFirstLineItems(results)).map(reorderRow);
    };

    // -------------------------------------------------------------------------
    // Payment creation
    // -------------------------------------------------------------------------

    const fetchCreateData = (txnIds) => {
        if (!txnIds||!txnIds.length) return [];
        const results=[];
        for (let i=0;i<txnIds.length;i+=BATCH_SIZE){
            // Subsidiary and bank account come from the CUSTOMER's subsidiary (cs).
            // In dynamic mode, NS forces payment subsidiary to the customer's home
            // subsidiary — so the bank account must come from that same subsidiary.
            const sql=`SELECT t.id,c.id,c.subsidiary,cs.custrecord4,a.id,t.currency,
                       sub.externalid||'-'||LPAD(TO_CHAR(t.id),10,'0'),t.memo,t.foreigntotal,TO_CHAR(t.trandate,'YYYY-MM-DD')
                FROM transaction t
                JOIN transactionline tl ON tl.transaction=t.id AND tl.mainline='T' AND tl.taxline='F'
                JOIN customer c ON c.id=t.entity
                JOIN subsidiary sub ON sub.id=tl.subsidiary
                JOIN subsidiary cs ON cs.id=c.subsidiary
                JOIN account a ON a.id=tl.expenseaccount
                WHERE t.id IN(${txnIds.slice(i,i+BATCH_SIZE).join(',')})`;
            (query.runSuiteQL({query:sql}).results||[]).forEach(row=>{
                results.push({txnId:row.values[0],customerId:row.values[1],subsidiaryId:row.values[2],
                    bankAccountId:row.values[3],arAccountId:row.values[4],currencyId:row.values[5],
                    paymentNumber:row.values[6],memo:row.values[7],paymentAmount:row.values[8],tranDate:row.values[9]});
            });
        }
        return results;
    };

    const createPayments = (ctx, idsParam, ebdIdsParam, scriptId, deployId) => {
        const rawBase = ctx.request.url.split('?')[0];
        const backUrl = rawBase+'?script='+encodeURIComponent(scriptId)+'&deploy='+encodeURIComponent(deployId);
        const ids    = (idsParam||'').split(',').map(s=>parseInt(s.trim(),10)).filter(n=>n>0);
        const ebdIds = (ebdIdsParam||'').split(',').map(s=>s.trim());
        const ebdByTxn = {};
        ids.forEach((id,idx)=>{ebdByTxn[String(id)]=ebdIds[idx]||'';});

        if (!ids.length) return renderActionResults(ctx,[],backUrl,'No invoice IDs provided.','Payment Drafts — Creation Results','created');
        if (ids.length>MAX_CREATE) return renderActionResults(ctx,[],backUrl,`Selection of ${ids.length} exceeds the maximum batch size of ${MAX_CREATE}.`,'Payment Drafts — Creation Results','created');

        const rows=fetchCreateData(ids), results=[];
        rows.forEach(row=>{
            try {
                if (!row.bankAccountId) throw new Error('Bank account could not be resolved — verify GTF Bank Internal ID on customer subsidiary');
                if (!row.arAccountId)   throw new Error('AR account could not be resolved');
                const selectedEbdId=ebdByTxn[String(row.txnId)]||'';
                log.debug({title:'createPayments',details:`Invoice ${row.txnId} — EBD ID: ${selectedEbdId}`});
                const rec=record.create({type:record.Type.CUSTOMER_PAYMENT,isDynamic:true});
                rec.setValue({fieldId:'customer',value:parseInt(row.customerId)});
                rec.setValue({fieldId:'subsidiary',value:parseInt(row.subsidiaryId)});
                rec.setValue({fieldId:'account',value:parseInt(row.bankAccountId)});
                rec.setValue({fieldId:'aracct',value:parseInt(row.arAccountId)});
                rec.setValue({fieldId:'currency',value:parseInt(row.currencyId)});
                rec.setValue({fieldId:'trandate',value:new Date(row.tranDate+'T00:00:00')});
                rec.setValue({fieldId:'memo',value:row.memo||''});
                rec.setValue({fieldId:'externalid',value:row.paymentNumber});
                rec.setValue({fieldId:'tranid',value:row.paymentNumber});
                rec.setValue({fieldId:'payment',value:parseFloat(row.paymentAmount)});
                rec.setValue({fieldId:'custbody_9997_is_for_ep_dd',value:true});
                const lineCount=rec.getLineCount({sublistId:'apply'});
                let applied=false;
                for (let i=0;i<lineCount;i++){
                    if (Number(rec.getSublistValue({sublistId:'apply',fieldId:'doc',line:i}))===Number(row.txnId)){
                        rec.selectLine({sublistId:'apply',line:i});
                        rec.setCurrentSublistValue({sublistId:'apply',fieldId:'apply',value:true});
                        rec.setCurrentSublistValue({sublistId:'apply',fieldId:'amount',value:parseFloat(row.paymentAmount)});
                        rec.commitLine({sublistId:'apply'}); applied=true; break;
                    }
                }
                if (!applied) throw new Error(`Invoice ${row.txnId} not found in apply sublist.`);
                const newId=rec.save();
                results.push({label:row.txnId,detail:row.paymentNumber,success:true,link:`/app/accounting/transactions/custpymt.nl?id=${newId}`,linkLabel:`CUSTPYMT ${newId}`});
            } catch(e){
                log.error({title:'createPayments ERROR',details:`Invoice ${row.txnId}: ${e.message||e}`});
                results.push({label:row.txnId,detail:row.paymentNumber,success:false,error:e.message||String(e)});
            }
        });
        renderActionResults(ctx,results,backUrl,null,'Payment Drafts — Creation Results','created');
    };

    // -------------------------------------------------------------------------
    // Results renderer
    // -------------------------------------------------------------------------

    const renderActionResults = (ctx, results, backUrl, errorMsg, pageTitle, verb) => {
        const succeeded=results.filter(r=>r.success).length, failed=results.filter(r=>!r.success).length;
        const bannerColor=errorMsg||failed>0?'#fff3cd':'#d4edda', bannerBorder=errorMsg||failed>0?'#ffc107':'#28a745';
        let body=`<div style="font-family:Arial,sans-serif;font-size:12px">`;
        if (errorMsg) {
            body+=`<div style="background:${bannerColor};border:1px solid ${bannerBorder};border-radius:4px;padding:12px 16px;margin-bottom:14px;color:#856404"><strong>Cannot process:</strong> ${escHtml(errorMsg)}</div>`;
        } else {
            body+=`<div style="background:${bannerColor};border:1px solid ${bannerBorder};border-radius:4px;padding:12px 16px;margin-bottom:14px"><strong>${succeeded} record${succeeded!==1?'s':''} ${escHtml(verb)}</strong>${failed>0?` &nbsp;&#124;&nbsp; <span style="color:#721c24">${failed} failed</span>`:''}</div>`;
        }
        if (results.length>0){
            const trs=results.map(r=>`<tr>
                <td style="padding:4px 8px;border-bottom:1px solid #e8e8e8">${escHtml(String(r.label))}</td>
                <td style="padding:4px 8px;border-bottom:1px solid #e8e8e8">${escHtml(r.detail||'')}</td>
                <td style="padding:4px 8px;border-bottom:1px solid #e8e8e8">${r.success
                    ?`<span style="color:#28a745">&#10003; ${escHtml(verb.charAt(0).toUpperCase()+verb.slice(1))}</span>`+(r.link?` &nbsp;<a href="${escHtml(r.link)}" target="_blank" style="color:#1f5ea8">${escHtml(r.linkLabel||r.link)}</a>`:'')
                    :`<span style="color:#dc3545">&#10007; Failed</span> &nbsp;<span style="color:#721c24">${escHtml(r.error||'')}</span>`}</td>
            </tr>`).join('');
            body+=`<table style="border-collapse:collapse;width:100%;margin-bottom:16px"><thead><tr>
                <th style="background:#1f5ea8;color:#fff;padding:6px 8px;text-align:left;font-size:11px;white-space:nowrap">Invoice ID</th>
                <th style="background:#1f5ea8;color:#fff;padding:6px 8px;text-align:left;font-size:11px;white-space:nowrap">Detail</th>
                <th style="background:#1f5ea8;color:#fff;padding:6px 8px;text-align:left;font-size:11px;white-space:nowrap">Result</th>
            </tr></thead><tbody>${trs}</tbody></table>`;
        }
        body+=`<a href="${escHtml(backUrl)}" style="background:#1f5ea8;color:#fff;padding:6px 14px;border-radius:3px;text-decoration:none;font-size:12px;display:inline-block">&#8592; Back to List</a></div>`;
        const form=serverWidget.createForm({title:pageTitle});
        form.addField({id:'custpage_results',type:serverWidget.FieldType.INLINEHTML,label:' '}).defaultValue=body;
        ctx.response.writePage(form);
    };

    // -------------------------------------------------------------------------
    // HTML builder
    // -------------------------------------------------------------------------

    const buildHtml = (rows, filters, dropdowns, page, totalPages, total, baseUrl, filteredIds) => {
        const buildUrl = (overrides) => {
            const p = Object.assign({f_search:filters.search,f_brand:filters.brand,f_subsidiary:filters.subsidiary,f_from:filters.from,f_to:filters.to,page},overrides);
            const qs = Object.entries(p).filter(([,v])=>v!==''&&v!==null&&v!==undefined).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&');
            return baseUrl+(qs?'&'+qs:'');
        };
        const exportUrl=buildUrl({export:'1',page:''});
        const selOptsSavedSearches=`<option value=""${!filters.search?' selected':''}>-- Select a Search --</option>`+SAVED_SEARCHES.map(s=>`<option value="${escHtml(s.id)}"${s.id===filters.search?' selected':''}>${escHtml(s.label)}</option>`).join('');
        const selOptsPairs=(pairs,sel)=>pairs.map(p=>`<option value="${escHtml(p.id)}"${String(p.id)===String(sel)?' selected':''}>${escHtml(p.name)}</option>`).join('');
        const thCells=`<th style="width:32px;text-align:center"><input type="checkbox" id="pnd-check-all" title="Select/deselect current page"></th>`+COLUMNS.map(c=>`<th>${escHtml(c)}</th>`).join('');
        const trRows=rows.map(row=>{
            const id=row[0]==null?'':String(row[0]);
            const primaryEbdId=row[20]!=null?String(row[20]):'';
            const secEbdId=row[21]!=null?String(row[21]):'';
            const drillUrl=id?`/app/accounting/transactions/custinvc.nl?id=${encodeURIComponent(id)}`:'';
            const cbCell=`<td style="text-align:center"><input type="checkbox" class="pnd-row-cb" data-id="${escHtml(id)}" data-primary-ebd="${escHtml(primaryEbdId)}" data-secondary-ebd="${escHtml(secEbdId)}"></td>`;
            const tds=row.slice(0,COLUMNS.length).map((v,i)=>{
                if (i===0&&drillUrl) return `<td><a href="${drillUrl}" target="_blank">${escHtml(v==null?'':String(v))}</a></td>`;
                if (i===5) return `<td><select class="pnd-eft-sel" data-id="${escHtml(id)}" style="font-size:11px;border:1px solid #bbb;border-radius:2px;padding:2px 4px;cursor:pointer;background:#fff"><option value="1">Primary</option>${secEbdId?'<option value="2">Secondary</option>':''}</select></td>`;
                return `<td>${escHtml(v==null?'':String(v))}</td>`;
            }).join('');
            return `<tr>${cbCell}${tds}</tr>`;
        }).join('\n');
        const start=(page-1)*PAGE_SIZE+1, end=Math.min(page*PAGE_SIZE,total);
        const prevUrl=page>1?buildUrl({page:page-1}):'', nextUrl=page<totalPages?buildUrl({page:page+1}):'';
        const pageButtons=(()=>{if(totalPages<=1)return'';let h='';const r=2;for(let p=1;p<=totalPages;p++){if(p===1||p===totalPages||(p>=page-r&&p<=page+r)){h+=p===page?`<span class="pg-btn pg-active">${p}</span>`:`<a class="pg-btn" href="${buildUrl({page:p})}">${p}</a>`;}else if(p===page-r-1||p===page+r+1){h+=`<span class="pg-ellipsis">…</span>`;}}return h;})();
        const countLabel=total+' record'+(total!==1?'s':'')+(total>0?' &nbsp;|&nbsp; Showing '+start+'&ndash;'+end:'');

        return `
<style>
  #pnd-wrap * { box-sizing: border-box; }
  #pnd-wrap { font-family: Arial, sans-serif; font-size: 12px; }
  .pnd-filters { background:#f0f4fb;border:1px solid #c8d4e8;border-radius:4px;padding:10px 14px;margin-bottom:10px;display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end; }
  .pnd-fg { display:flex;flex-direction:column;gap:3px; }
  .pnd-fg label { font-size:10px;font-weight:bold;color:#444;text-transform:uppercase;letter-spacing:.3px; }
  .pnd-fg select,.pnd-fg input[type=text],.pnd-fg input[type=date] { font-size:12px;padding:4px 6px;border:1px solid #bbb;border-radius:3px;min-width:130px;background:#fff; }
  .pnd-fg select.pnd-search-sel { min-width:280px;border-color:#1f5ea8; }
  .pnd-btn { padding:5px 12px;font-size:12px;border-radius:3px;cursor:pointer;text-decoration:none;display:inline-block;border:1px solid transparent; }
  .pnd-apply  { background:#1f5ea8;color:#fff;border-color:#1f5ea8; } .pnd-apply:hover { background:#174d8c; }
  .pnd-reset  { background:#fff;color:#333;border-color:#999; } .pnd-reset:hover { background:#eee; }
  .pnd-toolbar { display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap; }
  .pnd-export { background:#217346;color:#fff;border-color:#217346; } .pnd-export:hover { background:#185c38; }
  .pnd-create { background:#0d47a1;color:#fff;border-color:#0d47a1; }
  .pnd-create:not([disabled]):hover { background:#0a3580; } .pnd-create[disabled] { opacity:.45;cursor:not-allowed; }
  .pnd-count { color:#555;font-size:12px; }
  .pnd-pagination { display:flex;align-items:center;gap:4px;margin-left:auto; }
  .pg-btn,.pg-ellipsis { display:inline-block;padding:3px 8px;font-size:11px;border:1px solid #bbb;border-radius:3px;background:#fff;color:#333;text-decoration:none;line-height:1.4; }
  .pg-btn:hover { background:#e8f0fe;border-color:#1f5ea8;color:#1f5ea8; }
  .pg-active { background:#1f5ea8!important;color:#fff!important;border-color:#1f5ea8!important;cursor:default; }
  .pg-ellipsis { border:none;background:none;color:#888;padding:3px 2px; }
  .pg-nav { font-size:12px; }
  .pnd-table-wrap { overflow-x:auto; }
  #pnd-table { border-collapse:collapse;width:100%;min-width:800px; }
  #pnd-table th { background:#1f5ea8;color:#fff;padding:6px 8px;text-align:left;white-space:nowrap;font-size:11px;position:sticky;top:0;z-index:1; }
  #pnd-table td { padding:4px 8px;border-bottom:1px solid #e8e8e8;white-space:nowrap; }
  #pnd-table td a { color:#1f5ea8;text-decoration:none; } #pnd-table td a:hover { text-decoration:underline; }
  #pnd-table tr:nth-child(even) td { background:#f5f8ff; }
  #pnd-table tr:hover td { background:#dce8ff!important; }
  #pnd-table tr.pnd-selected td { background:#c8d8f8!important; }
  #pnd-check-all,.pnd-row-cb { cursor:pointer;width:14px;height:14px; }
  .pnd-no-results { padding:20px;color:#888;text-align:center; }
  .pnd-eft-sel { min-width:80px; }
  #pnd-all-pages-banner {
    display:none; align-items:center; gap:10px;
    background:#e8f0fe; border:1px solid #1f5ea8; border-radius:4px;
    padding:7px 12px; margin-bottom:8px; font-size:12px; color:#1f5ea8;
  }
  #pnd-all-pages-banner button {
    background:none; border:none; color:#1f5ea8; cursor:pointer;
    font-size:11px; text-decoration:underline; padding:0;
  }
</style>

<div id="pnd-wrap">

  <div id="pnd-all-pages-banner">
    <span id="pnd-all-pages-msg"></span>
    <button type="button" onclick="toggleAll(false)">Clear selection</button>
  </div>

  <div class="pnd-filters">
    <div class="pnd-fg">
      <label>Saved Search</label>
      <select id="f-search" class="pnd-search-sel">${selOptsSavedSearches}</select>
    </div>
    <div class="pnd-fg">
      <label>Brand</label>
      <select id="f-brand"><option value="">- All -</option>${selOptsPairs(dropdowns.brands,filters.brand)}</select>
    </div>
    <div class="pnd-fg">
      <label>Subsidiary</label>
      <select id="f-subsidiary"><option value="">- All -</option>${selOptsPairs(dropdowns.subsidiaries,filters.subsidiary)}</select>
    </div>
    <div class="pnd-fg"><label>From</label><input id="f-from" type="date" value="${escHtml(filters.from)}"></div>
    <div class="pnd-fg"><label>To</label><input id="f-to" type="date" value="${escHtml(filters.to)}"></div>
    <button type="button" class="pnd-btn pnd-apply" onclick="applyFilters()">&#128269; Apply</button>
    <a class="pnd-btn pnd-reset" href="${escHtml(baseUrl)}">&#x21BA; Reset</a>
  </div>

  <div class="pnd-toolbar">
    <a id="pnd-export-link" class="pnd-btn pnd-export" href="${escHtml(exportUrl)}">&#11015; Export to CSV</a>
    <button type="button" id="pnd-create-btn" class="pnd-btn pnd-create" onclick="createSelectedPayments()" disabled>
      &#9654; Create Payment Drafts (0)
    </button>
    <button type="button" class="pnd-btn pnd-apply" onclick="toggleAll(true)">&#9745; Mark All</button>
    <button type="button" class="pnd-btn pnd-apply" onclick="toggleAll(false)">&#9744; Unmark All</button>
    <span class="pnd-count">${countLabel}</span>
    <div class="pnd-pagination">
      ${prevUrl?`<a class="pg-btn pg-nav" href="${escHtml(prevUrl)}">&lsaquo; Prev</a>`:`<span class="pg-btn pg-nav" style="opacity:.4;cursor:default">&lsaquo; Prev</span>`}
      ${pageButtons}
      ${nextUrl?`<a class="pg-btn pg-nav" href="${escHtml(nextUrl)}">Next &rsaquo;</a>`:`<span class="pg-btn pg-nav" style="opacity:.4;cursor:default">Next &rsaquo;</span>`}
    </div>
  </div>

  <div class="pnd-table-wrap">
    ${total>0?`<table id="pnd-table"><thead><tr>${thCells}</tr></thead><tbody>${trRows}</tbody></table>`:`<div class="pnd-no-results">No records match the current filters.</div>`}
  </div>
</div>

<script>
(function() {
  var baseUrl        = ${JSON.stringify(baseUrl)};
  var exportBase     = ${JSON.stringify(exportUrl)};
  var allFilteredIds   = ${JSON.stringify(filteredIds)};
  var allPagesSelected = false;

  window.applyFilters = function() {
    var params = [];
    var srch      = document.getElementById('f-search').value;
    var brand     = document.getElementById('f-brand').value;
    var subsidiary= document.getElementById('f-subsidiary').value;
    var from      = document.getElementById('f-from').value;
    var to        = document.getElementById('f-to').value;
    if (srch)       params.push('f_search='     + encodeURIComponent(srch));
    if (brand)      params.push('f_brand='      + encodeURIComponent(brand));
    if (subsidiary) params.push('f_subsidiary=' + encodeURIComponent(subsidiary));
    if (from)       params.push('f_from='       + encodeURIComponent(from));
    if (to)         params.push('f_to='         + encodeURIComponent(to));
    params.push('page=1');
    window.location.href = baseUrl + (params.length ? '&' + params.join('&') : '');
  };

  function getCheckboxes() { return Array.from(document.querySelectorAll('.pnd-row-cb')); }
  function getChecked()    { return getCheckboxes().filter(function(cb){return cb.checked;}); }

  function setAllPagesBanner(visible) {
    var banner = document.getElementById('pnd-all-pages-banner');
    if (!banner) return;
    banner.style.display = visible ? 'flex' : 'none';
    if (visible) {
      var msg = document.getElementById('pnd-all-pages-msg');
      if (msg) msg.textContent = 'All ' + allFilteredIds.length + ' records across all pages are selected.';
    }
  }

  function updateToolbar() {
    var count = allPagesSelected ? allFilteredIds.length : getChecked().length;
    var btn = document.getElementById('pnd-create-btn');
    btn.textContent = '\u25B6 Create Payment Drafts (' + count + ')';
    btn.disabled = count === 0;
    var el = document.getElementById('pnd-export-link');
    if (allPagesSelected) {
      el.href = exportBase;
      el.textContent = '\u2B07 Export All (' + count + ')';
    } else if (count > 0) {
      var ids = getChecked().map(function(cb){return cb.dataset.id;}).join(',');
      el.href = exportBase + '&ids=' + encodeURIComponent(ids);
      el.textContent = '\u2B07 Export Selected (' + count + ')';
    } else {
      el.href = exportBase;
      el.textContent = '\u2B07 Export to CSV';
    }
  }

  function updateHeaderCheckbox() {
    var all=getCheckboxes(), chk=getChecked(), hdr=document.getElementById('pnd-check-all');
    if (!hdr) return;
    hdr.indeterminate = chk.length > 0 && chk.length < all.length;
    hdr.checked = all.length > 0 && chk.length === all.length;
  }

  function onRowCheckChange(cb) {
    if (allPagesSelected) {
      allPagesSelected = false;
      setAllPagesBanner(false);
    }
    var row = cb.closest('tr');
    if (row) row.classList.toggle('pnd-selected', cb.checked);
    updateHeaderCheckbox();
    updateToolbar();
  }

  getCheckboxes().forEach(function(cb){
    cb.addEventListener('change', function(){onRowCheckChange(cb);});
  });

  var hdrCb = document.getElementById('pnd-check-all');
  if (hdrCb) {
    hdrCb.addEventListener('change', function() {
      if (allPagesSelected) {
        allPagesSelected = false;
        setAllPagesBanner(false);
      }
      getCheckboxes().forEach(function(cb) {
        cb.checked = hdrCb.checked;
        var row = cb.closest('tr');
        if (row) row.classList.toggle('pnd-selected', hdrCb.checked);
      });
      updateHeaderCheckbox();
      updateToolbar();
    });
  }

  window.toggleAll = function(checked) {
    allPagesSelected = checked;
    getCheckboxes().forEach(function(cb) {
      cb.checked = checked;
      var row = cb.closest('tr');
      if (row) row.classList.toggle('pnd-selected', checked);
    });
    setAllPagesBanner(checked && allFilteredIds.length > getCheckboxes().length);
    updateHeaderCheckbox();
    updateToolbar();
  };

  window.createSelectedPayments = function() {
    var count = allPagesSelected ? allFilteredIds.length : getChecked().length;
    if (!count) { alert('No records selected.'); return; }
    if (count > ${MAX_CREATE}) {
      alert('Maximum ${MAX_CREATE} records per batch. ' + count + ' are selected.\\nNarrow your filters or select fewer records.');
      return;
    }
    if (!confirm('Create ' + count + ' Customer Payment record' + (count !== 1 ? 's' : '') + '?\\nThis cannot be undone.')) return;

    var f  = document.createElement('form');
    f.method = 'POST'; f.action = baseUrl + '&action=create';
    var i1 = document.createElement('input');
    i1.type = 'hidden'; i1.name = 'ids';
    var i2 = document.createElement('input');
    i2.type = 'hidden'; i2.name = 'ebd_ids';

    if (allPagesSelected) {
      i1.value = allFilteredIds.join(',');
      i2.value = '';
    } else {
      var ids = [], ebdIds = [];
      getChecked().forEach(function(cb) {
        ids.push(cb.dataset.id);
        var row = cb.closest('tr'), sel = row ? row.querySelector('.pnd-eft-sel') : null;
        var selVal = sel ? sel.value : '1';
        ebdIds.push(selVal === '2' && cb.dataset.secondaryEbd ? cb.dataset.secondaryEbd : cb.dataset.primaryEbd || '');
      });
      i1.value = ids.join(',');
      i2.value = ebdIds.join(',');
    }

    f.appendChild(i1); f.appendChild(i2);
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
        const selectedIds=(idsParam||'').split(',').map(s=>parseInt(s.trim(),10)).filter(n=>n>0);
        const rows=selectedIds.length>0?runRowsByIds(selectedIds):runRowsByIds(filteredIds);
        const ts=formatTimestamp(new Date()), filename=`GTF_PreNotif_PaymentDrafts_${ts}.csv`;
        ctx.response.setHeader({name:'Content-Type',value:'text/csv; charset=utf-8'});
        ctx.response.setHeader({name:'Content-Disposition',value:`attachment; filename="${filename}"`});
        ctx.response.write(buildCsv(rows));
    };

    const csvCell = (val) => {
        if (val===null||val===undefined) return '""';
        return `"${String(val).replace(/"/g,'""')}"`;
    };

    const buildCsv = (rows) => {
        const header=COLUMNS.map(csvCell).join(',');
        const lines=rows.map(row=>row.slice(0,COLUMNS.length).map(csvCell).join(','));
        return [header,...lines].join('\r\n');
    };

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    const sanitize = (val) => String(val||'').replace(/[';]/g,'').trim();

    const escHtml = (str) => String(str==null?'':str)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;');

    const formatTimestamp = (d) => {
        const pad=n=>String(n).padStart(2,'0');
        return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    };

    return { onRequest };
});
