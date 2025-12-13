/**
 * Module Description
 * 
 * Version    Date            Author           
 * 1.00       23 Sep 2019     Ryan Artz         
 *
 * Remarks: Allied users are creating customer refunds via the customer refund page.
 * Once a user selects which customer deposit to apply the refund all other lines should be locked.
 * Specifically the apply button. On Record Submit. The Custom field custbody_celigo_sfnc_salesforce_id
 * needs to be updated with the same field coming from the transaction with the apply checkbox enabled.
 */

function confirmLine(type, name) {
    if ((name === 'apply')){
        checkBoxes();
    }

    function checkBoxes(){
        var recordType = nlapiGetRecordType();
        var sublistIndex = nlapiGetCurrentLineItemIndex(type);
        var applied = nlapiGetCurrentLineItemValue(type, 'apply');

        if (recordType == 'customerrefund') {
            var salesforceID = 123;
            
            if(applied == 'F'){
                var depositlineItemCount = nlapiGetLineItemCount('deposit');
                for (var i=1; i <= depositlineItemCount; i++){
                    nlapiSetLineItemDisabled('deposit', 'apply', false, i)
                    nlapiSetFieldValue('custbody_celigo_sfnc_salesforce_id', null)
                }
                var applylineItemCount = nlapiGetLineItemCount('apply');
                for (var i=1; i <= applylineItemCount; i++){
                    nlapiSetLineItemDisabled('apply', 'apply', false, i)
                    nlapiSetFieldValue('custbody_celigo_sfnc_salesforce_id', null)
                }
            }

            if(applied == 'T') {
                var applylineItemCount = nlapiGetLineItemCount('apply');
                var depositlineItemCount = nlapiGetLineItemCount('deposit');
                nlapiLogExecution('DEBUG','lineItemCount: apply',applylineItemCount);
                
                if(applylineItemCount > 0){
                    for (var i = 1; applylineItemCount != null && i <= applylineItemCount; i++) {
                        var checkBoxVal = nlapiGetLineItemValue('apply','apply', i);
                        if(checkBoxVal == 'T'){
                            var keepEnabled = i
                            var tranType = nlapiGetLineItemValue('apply','trantype',keepEnabled)
                            var internalID2 = nlapiGetLineItemValue('apply','internalid',keepEnabled)

                            if (tranType == 'CustPymt'){
                                var depositObj = getSearchValueCustPay(internalID2)
                                salesforceID = depositObj.salesforceID
                                nlapiSetFieldValue('custbody_celigo_sfnc_salesforce_id', salesforceID)
                                
                                for (var i=1; i <= applylineItemCount; i++){
                                    if (keepEnabled != i)
                                        nlapiSetLineItemDisabled('apply', 'apply', true, i)
                                }
                                for (var i=1; i <= applylineItemCount; i++){
                                    nlapiSetLineItemDisabled('deposit', 'apply', true, i)
                                }
                            }
                            else if (tranType == 'CustCred'){
                                var depositObj = getSearchValue(internalID2)
                                salesforceID = depositObj.salesforceID
                                nlapiSetFieldValue('custbody_celigo_sfnc_salesforce_id', salesforceID)
                            
                                for (var i=1; i <= applylineItemCount; i++){
                                    if (keepEnabled != i)
                                        nlapiSetLineItemDisabled('apply', 'apply', true, i)
                                }
                                for (var i=1; i <= depositlineItemCount; i++){
                                    nlapiSetLineItemDisabled('deposit', 'apply', true, i)
                                }
                            }    
                        }
                    }
                }
        
                if(depositlineItemCount > 0){
                    for (var i = 1; depositlineItemCount != null && i <= depositlineItemCount; i++) {
                        var checkBoxVal = nlapiGetLineItemValue('deposit','apply', i);
                        if(checkBoxVal == 'T'){
                            var keepEnabled = i
                            var internalID2 = nlapiGetLineItemValue('deposit','doc',i)
                            var depositObj = getSearchValueCustDep(internalID2)
                            salesforceID = depositObj.salesforceID
                            nlapiSetFieldValue('custbody_celigo_sfnc_salesforce_id', salesforceID)
                            
                            for (var i=1; i <= depositlineItemCount; i++){
                                if (keepEnabled != i)
                                    nlapiSetLineItemDisabled('deposit', 'apply', true, i)
                            }
                            for (var i=1; i <= applylineItemCount; i++){
                                nlapiSetLineItemDisabled('apply', 'apply', true, i)
                            }
                        }
                    }
                }
            }
            return true;
        }
    }
}

function isFieldEmpty(val) {
    if (val == '' || val == null) {
        return true;
    }
    return false;
} 

function getSearchValueCustDep(internalIDinput){
    var customerdepositSearch = nlapiSearchRecord("customerdeposit",null,
        [
            ["type","anyof","CustDep"], 
            "AND", 
            ["internalid","anyof",internalIDinput]
        ], 
        [
            new nlobjSearchColumn("internalid"), 
            new nlobjSearchColumn("custbody_celigo_sfnc_salesforce_id")
        ]
    );

    var depsObjs = null;
    for ( var i = 0; customerdepositSearch != null && i < customerdepositSearch.length; i++ ) {
        var depositObj = {};
        depositObj.id = customerdepositSearch[i].getId();
        depositObj.internalID = customerdepositSearch[i].getValue('internalid');
        depositObj.salesforceID = customerdepositSearch[i].getValue('custbody_celigo_sfnc_salesforce_id');
        depsObjs = depositObj;
    }
    return depsObjs;
}

function getSearchValueCustPay(internalIDinput){
    var customerdepositSearch = nlapiSearchRecord("customerpayment",null,
        [
            ["type","anyof","CustPymt"], 
            "AND", 
            ["internalid","anyof",internalIDinput]
        ], 
        [
            new nlobjSearchColumn("internalid"), 
            new nlobjSearchColumn("custbody_celigo_sfnc_salesforce_id")
        ]
    );

    var depsObjs = null;
    for ( var i = 0; customerdepositSearch != null && i < customerdepositSearch.length; i++ ) {
        var depositObj = {};
        depositObj.id = customerdepositSearch[i].getId();
        depositObj.internalID = customerdepositSearch[i].getValue('internalid');
        depositObj.salesforceID = customerdepositSearch[i].getValue('custbody_celigo_sfnc_salesforce_id');
        depsObjs = depositObj;
    }
    return depsObjs;
}

function getSearchValue(internalIDinput){
    var customerdepositSearch = nlapiSearchRecord("creditmemo",null,
        [
            ["type","anyof","CustCred"], 
            "AND", 
            ["internalid","anyof",internalIDinput]
        ], 
        [
            new nlobjSearchColumn("internalid"), 
            new nlobjSearchColumn("custbody_celigo_sfnc_salesforce_id")
        ]
    );

    var depsObjs = null;
    for ( var i = 0; customerdepositSearch != null && i < customerdepositSearch.length; i++ ) {
        var depositObj = {};
        depositObj.id = customerdepositSearch[i].getId();
        depositObj.internalID = customerdepositSearch[i].getValue('internalid');
        depositObj.salesforceID = customerdepositSearch[i].getValue('custbody_celigo_sfnc_salesforce_id');
        depsObjs = depositObj;
    }
    return depsObjs;
}

function SaveRecord(type) {
  
}
