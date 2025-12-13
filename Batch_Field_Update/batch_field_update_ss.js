/**
 * Batch Field Update Utility
 * SuiteScript 1.0 Scheduled Script
 * 
 * Updates field values on multiple records using nlapiSubmitField
 * with governance management via nlapiYieldScript
 */

function updateFieldsWithValues(){ 
    
    var aryRecordsFieldsValues = [];
    
    // Format: [recordId, [fieldIds], [values]]
    aryRecordsFieldsValues = [
        ['131947',['custbody_fb_shopify_payment_methods'],['11']],
        ['579431',['custbody_fb_shopify_payment_methods'],['12']]
    ];
    
    updateFieldWithValue('customerdeposit', aryRecordsFieldsValues);
}
 
function updateFieldWithValue(recordType, aryRecordsFieldsValues){
 
    for ( var i in aryRecordsFieldsValues) {        
        
        nlapiLogExecution('DEBUG','Record: ' + aryRecordsFieldsValues[i][0]);
        
        try {
            nlapiSubmitField(recordType, aryRecordsFieldsValues[i][0], aryRecordsFieldsValues[i][1], aryRecordsFieldsValues[i][2]); 
        } catch (error) {
            nlapiLogExecution('DEBUG','ERROR ON : ' + aryRecordsFieldsValues[i][0], error);
        }
        
        var context = nlapiGetContext();
        usageRemaining = context.getRemainingUsage();
        
        if(usageRemaining < 50){
            nlapiYieldScript();
        }
    }
}
