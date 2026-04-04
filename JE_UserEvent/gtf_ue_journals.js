/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 *
 * GTF | Journal Entry User Event
 *
 * beforeLoad  - locks the COA segment column (display only)
 * beforeSubmit - auto-populates class (brand) and COA from account/department
 *               mappings, enforces dept/fund/name required flags
 *
 * Root cause fix (2026-04-04): Large reversal JEs (1500-2000 lines) accumulate
 * 1000+ distinct department IDs, blowing the SuiteQL IN clause hard limit and
 * throwing SSS_SEARCH_ERROR_OCCURRED. Both getAccountsDetails and
 * getDepartmentsDetails now chunk their ID arrays in batches of 500.
 *
 * Script file: gtf_ue_journals.js
 */
define(['N/record', 'N/query', 'N/ui/serverWidget', 'N/error'], (record, query, serverWidget, error) => {

    const beforeLoad = (context) => {
        try {
            if (context.type === context.UserEventType.CREATE || context.type === context.UserEventType.EDIT) {
                initLogic(context)
            }
        } catch (e) {
            log.error("beforeLoad", e)
        }
    }

    const beforeSubmit = (context) => {
        try {
            if (context.type === context.UserEventType.CREATE || context.type === context.UserEventType.EDIT) {
                defaultFields(context)
            }
        } catch (e) {
            log.error("beforeSubmit", e)
            throw e;
        }
    }

    const initLogic = (context) => {
        const form = context.form;
        const lineSublist = form.getSublist('line');
        const lineCOAField = lineSublist.getField('cseg_coa');
        lineCOAField.updateDisplayType({
            displayType : serverWidget.FieldDisplayType.DISABLED
        });
    }

    const defaultFields = (context) => {
        const rec = context.newRecord;
        const accountIds = [];
        const deptIds = [];
        const sublistId = 'line';
        const voiding = rec.getValue('void');
        if (voiding == 'T') return;

        const lineCount = rec.getLineCount({ sublistId });
        for (let i = 0; i < lineCount; i++) {
            const accountId = rec.getSublistValue({ sublistId, fieldId: 'account', line: i });
            const departmentId = rec.getSublistValue({ sublistId, fieldId: 'department', line: i });
            if (accountId && !accountIds.includes(accountId)) accountIds.push(accountId);
            if (departmentId && !deptIds.includes(departmentId)) deptIds.push(departmentId);
        }

        const accMap = getAccountsDetails(accountIds);
        const deptMap = getDepartmentsDetails(deptIds);
        log.debug('accMap size', Object.keys(accMap).length);
        log.debug('deptMap size', Object.keys(deptMap).length);

        for (let i = 0; i < lineCount; i++) {
            try {
                const accountId = rec.getSublistValue({ sublistId, fieldId: 'account', line: i });
                const departmentId = rec.getSublistValue({ sublistId, fieldId: 'department', line: i });

                const acc = accountId ? accMap[accountId] : null;
                const dept = departmentId ? deptMap[departmentId] : null;

                const brandId = (dept && dept.brand) ? dept.brand : null;
                const coaSegId = (acc && acc.coa) ? acc.coa : null;
                const deptreq = (acc && acc.deptreq) ? acc.deptreq : null;
                const fundreq = (acc && acc.fundreq) ? acc.fundreq : null;
                const namereq = (acc && acc.namereq) ? acc.namereq : null;
                const adfundinterco = (acc && acc.adfundinterco) ? acc.adfundinterco : null;

                if (brandId) {
                    rec.setSublistValue({ sublistId, fieldId: 'class', line: i, value: brandId });
                }
                if (coaSegId) {
                    rec.setSublistValue({ sublistId, fieldId: 'cseg_coa', line: i, value: coaSegId });
                }
                if (adfundinterco == 'T') {
                    rec.setSublistValue({ sublistId, fieldId: 'cseg_fund', line: i, value: 311 });
                }

                const cseg_fund = rec.getSublistValue({ sublistId, fieldId: 'cseg_fund', line: i });
                const name = rec.getSublistValue({ sublistId, fieldId: 'entity', line: i });

                if (deptreq == 'T' && !departmentId) {
                    throw error.create({
                        name: 'MISSING_REQD_FLD',
                        message: 'Please provide a value in department.',
                        notifyOff: true
                    });
                }
                if (fundreq == 'T' && cseg_fund) {
                    throw error.create({
                        name: 'MISSING_REQD_FLD',
                        message: 'Please remove the Fund.',
                        notifyOff: true
                    });
                }
                if (namereq == 'T' && !name) {
                    throw error.create({
                        name: 'MISSING_REQD_FLD',
                        message: 'Please provide a value in Name/entity.',
                        notifyOff: true
                    });
                }
            } catch (lineErr) {
                throw new Error(`defaultFields line error: Line ${i}: ${lineErr.name} - ${lineErr.message}`);
            }
        }
    }

    /**
     * Fetches account custom fields in chunks of 500 to avoid the SuiteQL
     * IN clause limit of 1000. Large JEs can have many distinct accounts.
     */
    const getAccountsDetails = (accountIds) => {
        if (!accountIds || accountIds.length === 0) return {};
        const map = {};
        const chunkSize = 500;
        for (let i = 0; i < accountIds.length; i += chunkSize) {
            const chunk = accountIds.slice(i, i + chunkSize);
            const placeholders = chunk.map(() => '?').join(',');
            const sql = `
                SELECT 
                    account.id AS id, 
                    account.custrecord_gtf_coa_brand AS brand,
                    account.cseg_coa AS coa,
                    account.custrecord_gtf_deptreqflag AS deptreq,
                    account.custrecord_gtf_preventfund AS fundreq,
                    account.custrecord_gtf_namereqflag AS namereq,
                    account.custrecord_gtf_preventje AS manualje,
                    account.custrecord_gtf_adfundinterco AS adfundinterco
                FROM account
                WHERE account.id IN (${placeholders})
            `;
            query.runSuiteQL({ query: sql, params: chunk }).asMappedResults().forEach(r => {
                map[r.id] = {
                    brand: r.brand,
                    coa: r.coa,
                    adfundinterco: r.adfundinterco,
                    deptreq: r.deptreq,
                    fundreq: r.fundreq,
                    namereq: r.namereq
                };
            });
        }
        return map;
    };

    /**
     * Fetches department brand mapping in chunks of 500 to avoid the SuiteQL
     * IN clause limit of 1000. Large reversal JEs (1500-2000 lines) accumulate
     * 1000+ distinct department IDs, causing SSS_SEARCH_ERROR_OCCURRED.
     */
    const getDepartmentsDetails = (deptIds) => {
        if (!deptIds || deptIds.length === 0) return {};
        const map = {};
        const chunkSize = 500;
        for (let i = 0; i < deptIds.length; i += chunkSize) {
            const chunk = deptIds.slice(i, i + chunkSize);
            const placeholders = chunk.map(() => '?').join(',');
            const sql = `
                SELECT 
                    department.id AS id, 
                    department.custrecord_deptbrand AS brand
                FROM department
                WHERE department.id IN (${placeholders})
            `;
            query.runSuiteQL({ query: sql, params: chunk }).asMappedResults().forEach(r => {
                map[r.id] = { brand: r.brand };
            });
        }
        return map;
    };

    return { beforeLoad, beforeSubmit };
});
