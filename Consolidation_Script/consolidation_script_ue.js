/**
 *@NApiVersion 2.1
 *@NScriptType UserEventScript
 */
define(['N/record', 'N/log'],
    function (record, log) {
        function beforeSubmit({ type, UserEventType, newRecord }) {
            try {
                if (type === UserEventType.DELETE) return;
                    
                const recId = newRecord.id;
                const soRecObj = newRecord;
                const shipstate = soRecObj.getValue('shipstate');
                const customerId = soRecObj.getValue('entity').toString();
                const dateCreated = new Date();
                const newDate = twoDigits(dateCreated.getMonth() + 1).toString() + twoDigits(dateCreated.getDate()).toString() + dateCreated.getFullYear().toString();
                const dateCreatedHours = Number(dateCreated.getHours());

                log.debug('Vars Logging', { dateCreatedHours, dateCreated, newDate, shipstate, recId })

                const timeSlot = getTimeSlot(dateCreatedHours);
                const lineCount = soRecObj.getLineCount('item');
                let sumOfItemWeight = 0;
                let parentItemOrderClassCode = "";
                let IsInGroup = false;

                
                for (let i = 0; i < lineCount; i++) {

                    const location = soRecObj.getSublistValue('item', 'location', i);
                    const item = soRecObj.getSublistValue('item', 'item', i);
                    const quantity = soRecObj.getSublistValue('item', 'quantity', i) || 1;
                    const itemType = soRecObj.getSublistValue('item', 'itemtype', i);
                    const isProp65Eligible = soRecObj.getSublistValue('item', 'custcol_4p_sop65', i);
                    const itemWeight = parseFloat(soRecObj.getSublistValue('item', 'custcol_4p_itemweight', i)) || 0;
                    let orderClassCode = soRecObj.getSublistValue('item', 'custcol_mfc_order_class_code', i);
                    const consolidatedStringId = customerId + "_" + newDate + "_" + location + "_" + timeSlot;

                    if (itemWeight) {
                        sumOfItemWeight += (itemWeight * quantity);
                    }

                    log.debug('Line Item - ' + i, {
                        item,
                        itemType,
                        isProp65Eligible,
                        location,
                        orderClassCode,
                        consolidatedStringId,
                        itemWeight,
                        sumOfItemWeight
                    });

                    if (itemType === 'Group') {
                        IsInGroup = true;
                        parentItemOrderClassCode = orderClassCode;
                    } else if (itemType === 'EndGroup') {
                        IsInGroup = false;
                        parentItemOrderClassCode = ""
                    }

                    if (IsInGroup) {
                        orderClassCode = parentItemOrderClassCode
                    }

                    if (itemType === 'InvtPart' || itemType === 'Assembly') {
                        if ( 
                          shipstate === 'CA' 
                          && isProp65Eligible 
                          && !orderClassCode.includes('-P65') 
                        ) { 
                          orderClassCode += '-P65' 
                        }
                        soRecObj.setSublistValue('item', 'custcol_mfc_order_class_code', i, orderClassCode)

                        if (location) {
                            soRecObj.setSublistValue('item', 'custcol_conso_order_id', i, consolidatedStringId)
                        }
                    }
                }

                soRecObj.setValue('custbody_4p_orderweight', sumOfItemWeight);
            } catch (e) {
                log.error('error in beforeSubmit', e)
            }
        }


        function twoDigits(n) {
            return n > 9 ? "" + n : "0" + n;
        }

        function getTimeSlot(hour) {
            if (hour < 2) return 1;
            if (hour < 4) return 2;
            if (hour < 6) return 3;
            if (hour < 8) return 4;
            if (hour < 10) return 5;
            if (hour < 12) return 6;
            if (hour < 14) return 7;
            if (hour < 16) return 8;
            if (hour < 18) return 9;
            if (hour < 20) return 10;
            if (hour < 22) return 11;
            if (hour < 24) return 12;

            return 0;
        }

        return {
            beforeSubmit
        };
    });
