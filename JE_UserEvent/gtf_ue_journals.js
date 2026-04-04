/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 *
 * GTF | Journal Entry User Event
 *
 * beforeLoad  – locks the COA segment column (display only)
 * beforeSubmit – auto-populates class (brand) and COA from account/department
 *               mappings, enforces dept/fund/name required flags
 *
 * Script file: gtf_ue_journals.js
 */
define(['N/record', 'N/query', 'N/ui/serverWidget', 'N/error'], (record, query, serverWidget, error) => {
    const beforeLoad = (context) => {
        try {
            if (context.type === context.UserEventType.CREATE || context.type === context.UserEventType.EDIT) {
                initLogic(context)
                //addCurrencies(context)
            }
        } catch (e) {
            log.error("beforeLoad", e)
        }
    }
    const beforeSubmit = (context) => {
        try {
            if (context.type === context.UserEventType.CREATE || context.type === context.UserEventType.EDIT) {
                defaultFields(context)
                //addCurrencies(context)
            }
        } catch (e) {
            log.error("beforeSubmit", e)
            throw e;
        }
    }
    
    const initLogic = (context) => {
        const thisRecord = context.newRecord;
        const form = context.form;
        const lineSublist = form.getSublist('line');
        const subsidiaryField = form.getField('subsidiary')
        const cseg_fundField = form.getField('cseg_fund')
        const cseg_fran_store_numField = form.getField('cseg_fran_store_num')
        const cseg_coaField = form.getField('cseg_coa')
        const lineBrandField = lineSublist.getField('class')
        const lineDepartmentField = lineSublist.getField('department')
        const lineCOAField = lineSublist.getField('cseg_coa')
        const lineFundField = lineSublist.getField('cseg_fund')
        const lineStoreNumberField = lineSublist.getField('cseg_fran_store_num')
        //lineBrandField.isMandatory = true;
        //lineDepartmentField.isMandatory = true;
        //lineBrandField.updateDisplayType({
        //    displayType : serverWidget.FieldDisplayType.DISABLED
        //});
        //lineCOAField.isMandatory = true;
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
        if(voiding == 'T'){
            return;
        }
        const lineCount = rec.getLineCount({ sublistId });
        for (let i = 0; i < lineCount; i++) {
            const accountId = rec.getSublistValue({ sublistId, fieldId: 'account', line: i });
            const departmentId = rec.getSublistValue({ sublistId, fieldId: 'department', line: i });
            if (accountId && !accountIds.includes(accountId)) accountIds.push(accountId);
            if (departmentId && !deptIds.includes(departmentId)) deptIds.push(departmentId);
        }

        const accMap = getAccountsDetails(accountIds);       // {id -> {brand, coa}}
        const deptMap = getDepartmentsDetails(deptIds);      // {id -> {brand}}
        log.debug('accMap', accMap)
        log.debug('deptMap', deptMap)
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
                log.debug('acc', acc)
                log.debug('coaSegId', coaSegId)
                if (brandId) {
                    rec.setSublistValue({
                        sublistId,
                        fieldId: 'class',
                        line: i,
                        value: brandId
                    });
                }
                if (coaSegId) {
                    rec.setSublistValue({
                        sublistId,
                        fieldId: 'cseg_coa',
                        line: i,
                        value: coaSegId
                    });
                }
                if(adfundinterco == 'T'){
                    rec.setSublistValue({
                        sublistId,
                        fieldId: 'cseg_fund',
                        line: i,
                        value: 311
                    });
                }
                const cseg_fund = rec.getSublistValue({ sublistId, fieldId: 'cseg_fund', line: i });
                const name = rec.getSublistValue({ sublistId, fieldId: 'entity', line: i });
                if(deptreq == 'T' && !departmentId){
                     throw error.create({
                         name: 'MISSING_REQD_FLD',
                         message: 'Please provide a value in department.',
                         notifyOff: true // Prevents email alerts to the admin for a user error
                    });
                }
                if(fundreq == 'T' && cseg_fund){
                     throw error.create({
                         name: 'MISSING_REQD_FLD',
                         message: 'Please remove the Fund.',
                         notifyOff: true // Prevents email alerts to the admin for a user error
                    });
                }
                if(namereq == 'T' && !name){
                     throw error.create({
                         name: 'MISSING_REQD_FLD',
                         message: 'Please provide a value in Name/entity.',
                         notifyOff: true // Prevents email alerts to the admin for a user error
                    });
                }
            } catch (lineErr) {
                 throw new Error(`defaultFields line error: Line ${i}: ${lineErr.name} - ${lineErr.message}`);
            }
        }

    }
    const getAccountsDetails = (accountIds) => {
        if (!accountIds || accountIds.length === 0) return {};
        const placeholders = accountIds.map(() => '?').join(',');
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
        const results = query.runSuiteQL({ query: sql, params: accountIds }).asMappedResults();
        const map = {};
        results.forEach(r => {
            map[r.id] = {
                brand: r.brand,
                coa: r.coa,
                adfundinterco: r.adfundinterco,
                deptreq: r.deptreq,
                fundreq: r.fundreq,
                namereq: r.namereq
            };
        });
        return map;
    };

    const getDepartmentsDetails = (deptIds) => {
        if (!deptIds || deptIds.length === 0) return {};

        // Sanitize: only pass values that are valid integers to the parameterized query.
        // Non-numeric or non-primitive values (e.g. objects, arrays) cause SSS_SEARCH_ERROR_OCCURRED.
        const sanitizedIds = deptIds
            .filter(id => id !== null && id !== undefined && !isNaN(Number(id)))
            .map(id => Number(id));

        log.debug('getDepartmentsDetails | raw deptIds', JSON.stringify(deptIds));
        log.debug('getDepartmentsDetails | sanitizedIds', JSON.stringify(sanitizedIds));

        if (sanitizedIds.length === 0) return {};

        const placeholders = sanitizedIds.map(() => '?').join(',');
        const sql = `
            SELECT 
                department.id AS id, 
                department.custrecord_deptbrand AS brand
            FROM department
            WHERE department.id IN (${placeholders})
        `;

        try {
            const results = query.runSuiteQL({ query: sql, params: sanitizedIds }).asMappedResults();
            const map = {};
            results.forEach(r => {
                map[r.id] = { brand: r.brand };
            });
            return map;
        } catch (e) {
            // Log the full error plus the params so the root cause is visible in the execution log.
            // Returning {} allows the JE save to proceed; brand auto-population is skipped for these lines.
            log.error('getDepartmentsDetails | query failed', {
                message: e.message,
                sanitizedIds: sanitizedIds,
                rawDeptIds: JSON.stringify(deptIds)
            });
            return {};
        }
    };
    
    return {
        beforeLoad,
        beforeSubmit
    };
});
