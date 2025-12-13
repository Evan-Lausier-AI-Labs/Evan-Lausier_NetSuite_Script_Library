// Author: Evan Lausier
// Date: 06/12/2024
// Description: Updates Employee External ID based on custom email field change

/**
 * @NApiVersion 2.x
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 */
define(['N/record'],
/**
 * @param {record} record
 */
function(record) {
    function afterSubmit(scriptContext) {
      //Step 1
      rec = scriptContext.oldRecord;

      //Step 2
      var extId = rec.getValue({fieldId: 'externalid'});
      var empEmail = rec.getValue({fieldId: 'custbody_apm_is_email_sent'});

              //Step 3
              if (empEmail != extId)
                {
                  //Step 4
                  record.submitFields({
                  type: record.Type.EMPLOYEE,
                  id: rec.id,
                  values: {
                      'externalid': empEmail
                  }
});
                }
        //Step 5
      	var newext = rec.getValue({fieldId: 'externalid'});
        log.debug('rec id',rec.id)
    }
    return {
        afterSubmit: afterSubmit
    };
});
