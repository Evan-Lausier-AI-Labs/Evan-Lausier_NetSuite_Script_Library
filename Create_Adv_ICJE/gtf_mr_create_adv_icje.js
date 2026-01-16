/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 */
 /**
 * Copyright (c) 1998-2014 NetSuite, Inc.
 * 2955 Campus Drive, Suite 100, San Mateo, CA, USA 94403-2511
 * All Rights Reserved.
 *
 * This software is the confidential and proprietary information of
 * NetSuite, Inc. ("Confidential Information"). You shall not
 * disclose such Confidential Information and shall use it only in
 * accordance with the terms of the license agreement you entered into
 * with NetSuite.
 *
 * This script is to provide a UI of pending fulfillment orders
 *
 * @author Puja Roy
 * @created 15 Oct 2025
 * @version 1.0
 *
 */
/*
Name                : GTF | MR Create Adv ICJE
Purpose             : To create adv ICJE (Intercompany Bill Distribution) - triggered from UE script
Created On          : 15-Oct 2025
Author              : Puja Roy
Script Type         : Map/Reduce
 */
define(['N/record','N/search','N/log','N/runtime'], (record, search, log, runtime) => {

    const getInputData = (context) => {
		const script = runtime.getCurrentScript();

		const savedSearchId = script.getParameter({ name: 'custscript_mr_vb_distribution_search_id' });
			
		
			log.debug('savedSearchId', savedSearchId);
			
			if(savedSearchId){
				const searchObj = search.load({
									id: savedSearchId
						});
				return searchObj;
				
			}
			else{
		
		
				// Receive VB ID from UE
				//const vbId = context.parameters.custscript_gtf_mr_vb_id;
				var vbId = runtime.getCurrentScript().getParameter({ name: 'custscript_gtf_mr_vb_id' });
				return [vbId]; // Pass as array for MR processing
			}
    };

   const map = (context) => {

    log.debug("Raw context value", context.value);

    let vbId;

    try {
        // When search result is returned, value is JSON
        const row = JSON.parse(context.value);

        vbId = row.values.internalid?.value || row.id;

        log.debug("VB ID from search row", vbId);

    } catch (err) {

        // Not JSON → Direct VB ID from array
        vbId = context.value;
        log.debug("VB ID from input array", vbId);
    }

    // Write VB ID for reduce stage
    context.write({
        key: vbId,
        value: vbId
    });
};


    const reduce = (context) => {
		try{
        const vbId = context.key;
		log.debug('vbId',vbId);
        const vbRec = record.load({ type: record.Type.VENDOR_BILL, id: vbId });
        const vbSubsidiaryVal = vbRec.getValue('subsidiary');

        const subsidiaryRec = record.load({ type: record.Type.SUBSIDIARY, id: vbSubsidiaryVal });
        const vbSubsidiaryExtID = subsidiaryRec.getValue('externalid');

        const apAccount = '721';
        const arAccount = '245';
		const newAccntToUse = '349';
        const vbTotalExpenseLines = vbRec.getLineCount('expense');
		log.debug('vbTotalExpenseLines-',vbTotalExpenseLines);
        let arrExpDetails = [];

        // Collect expense line details
        for (let i = 0; i < vbTotalExpenseLines; i++) {
            const lineExpEntity = vbRec.getSublistValue('expense','cseg_gtf_exp_entity',i);
            const expAmount = vbRec.getSublistValue('expense','amount',i);
            const expAccnt = vbRec.getSublistValue('expense','categoryexpaccount',i);
            const expDept = vbRec.getSublistValue('expense','department',i);
            const expMemo = vbRec.getSublistValue('expense','memo',i);
            const expClass = vbRec.getSublistValue('expense','class',i);
            const expCOA = vbRec.getSublistValue('expense','cseg_coa',i);
			
			var accountText = vbRec.getSublistText('expense','categoryexpaccount',i);
			var match = accountText.match(/^\d+/);
			var accntlength = match ? match[0].length : null;
			log.debug('Exp accntlength',accntlength);


            const expEntityRec = record.load({
                type: 'customrecord_cseg_gtf_exp_entity',
                id: lineExpEntity
            });
            const expEntitySubId = expEntityRec.getValue('custrecord_gtf_subsidiary_ext_id');
			log.debug('vbSubsidiaryExtID-'+vbSubsidiaryExtID, 'expEntitySubId-'+expEntitySubId);
			
            if (vbSubsidiaryExtID != expEntitySubId) {
                arrExpDetails.push({
                    ExpEntity: expEntitySubId,
                    ExpAccnt: expAccnt,
                    ExpAmount: expAmount,
                    ExpDept: expDept,
                    ExpMemo: expMemo,
                    ExpClass: expClass,
                    ExpCoa: expCOA
                });
            }
        }

        if (arrExpDetails.length > 0) {
            const icJEid = createICJE(record, arrExpDetails, vbSubsidiaryVal, vbSubsidiaryExtID, apAccount, arAccount, accntlength, newAccntToUse);
            if (icJEid) {
                record.submitFields({
                    type: record.Type.VENDOR_BILL,
                    id: vbId,
                    values: { 'custbody_gtf_linked_icje': icJEid }
                });
                log.debug('ICJE created for VB', vbId + ' -> ICJE ID: ' + icJEid);
            }
        }
	}
	catch(exx){
		log.debug('Error occurred', exx);
		
	}
		
		
    };
	
	
    const createICJE = (record, arrExpDetails, vbSubsidiaryVal, vbSubsidiaryExtID, apAccount, arAccount, accntlength, newAccntToUse) => {
        const expEntityExtIds = [...new Set(arrExpDetails.map(e => e.ExpEntity))];
        const expEntityMap = {};

        if (expEntityExtIds.length > 0) {
            const subsidiarySearch = search.create({
                type: "subsidiary",
                filters: [["externalid","anyof",expEntityExtIds]],
                columns: ["internalid","externalid"]
            });

            subsidiarySearch.run().each(result => {
                expEntityMap[result.getValue("externalid")] = result.getValue("internalid");
                return true;
            });
        }

        const jeRecObj = record.create({ type: record.Type.ADV_INTER_COMPANY_JOURNAL_ENTRY, isDynamic: true });
		log.debug('vbSubsidiaryVal-createJE-duetofrom',vbSubsidiaryVal);
        jeRecObj.setValue('subsidiary', vbSubsidiaryVal);
        jeRecObj.setValue('custbody_gtf_journal_entry_type', 1);
		
		if(accntlength == 4){
			arAccount = newAccntToUse;
			apAccount = newAccntToUse;
		}
			

        arrExpDetails.forEach((expLine, i) => {
            const expEntityIntId = expEntityMap[expLine.ExpEntity];
			log.debug('expEntityIntId-createJE-duetofrom',expEntityIntId);
			
            // Debit/Credit lines (same as before)
            const lines = [
                {subs: vbSubsidiaryVal, acc: arAccount, debit: expLine.ExpAmount, credit: null, dueToFrom: expEntityIntId, eliminate: true},
                {subs: vbSubsidiaryVal, acc: expLine.ExpAccnt, debit: null, credit: expLine.ExpAmount, dueToFrom: null, eliminate: false},
                {subs: expEntityIntId, acc: expLine.ExpAccnt, debit: expLine.ExpAmount, credit: null, dueToFrom: null, eliminate: false},
                {subs: expEntityIntId, acc: apAccount, debit: null, credit: expLine.ExpAmount, dueToFrom: vbSubsidiaryVal, eliminate: true}
            ];

            lines.forEach(line => {
                jeRecObj.selectNewLine({ sublistId: 'line' });
                jeRecObj.setCurrentSublistValue({ sublistId: 'line', fieldId: 'linesubsidiary', value: line.subs });
                jeRecObj.setCurrentSublistValue({ sublistId: 'line', fieldId: 'account', value: line.acc });
                if (line.debit) jeRecObj.setCurrentSublistValue({ sublistId: 'line', fieldId: 'debit', value: line.debit });
                if (line.credit) jeRecObj.setCurrentSublistValue({ sublistId: 'line', fieldId: 'credit', value: line.credit });
                if (line.dueToFrom) jeRecObj.setCurrentSublistValue({ sublistId: 'line', fieldId: 'duetofromsubsidiary', value: line.dueToFrom });
                jeRecObj.setCurrentSublistValue({ sublistId: 'line', fieldId: 'department', value: expLine.ExpDept });
                jeRecObj.setCurrentSublistValue({ sublistId: 'line', fieldId: 'class', value: expLine.ExpClass });
                jeRecObj.setCurrentSublistValue({ sublistId: 'line', fieldId: 'memo', value: expLine.ExpMemo });
                jeRecObj.setCurrentSublistValue({ sublistId: 'line', fieldId: 'cseg_coa', value: expLine.ExpCoa });
              //  if (line.eliminate !== undefined) jeRecObj.setCurrentSublistValue({ sublistId: 'line', fieldId: 'eliminate', value: line.eliminate });
                jeRecObj.commitLine({ sublistId: 'line' });
            });

            if ((i + 1) % 50 === 0) log.audit('Processed lines', i + 1);
        });

        const jeRecId = jeRecObj.save({ enableSourcing: true, ignoreMandatoryFields: false });
        log.debug('Adv ICJE ID', jeRecId);
        return jeRecId;
    };

    return { getInputData, map, reduce };
});