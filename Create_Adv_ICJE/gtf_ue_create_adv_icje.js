/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
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
 * @created 19 Aug 2025
 * @version 1.0
 *
 */
/*
Name                : GTF | UE Create Adv ICJE
Purpose             : To trigger MR script and pass VB id to create adv ICJE (Intercompany Bill Distribution)
Created On          : 19-Aug 2025
Author              : Puja Roy
Script Type         : User Event
 */
define(['N/task', 'N/log'], (task, log) => {

    const afterSubmit = (scriptContext) => {
        if (scriptContext.type !== 'create' && scriptContext.type !== 'edit') return;

        const vbRec = scriptContext.newRecord;
        const vbId = vbRec.id;

        try {
            const mrTask = task.create({
                taskType: task.TaskType.MAP_REDUCE,
                scriptId: 'customscript_gtf_mr_create_adv_icje',  
                params: {
                    'custscript_gtf_mr_vb_id': vbId
                }
            });
            const taskId = mrTask.submit();
            log.debug('Triggered MR for Vendor Bill', 'VB ID: ' + vbId + ', Task ID: ' + taskId);
        } catch (e) {
            log.error('Error triggering MR', e);
        }
    };

    return { afterSubmit };
});
