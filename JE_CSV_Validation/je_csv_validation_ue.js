/**
 * JE CSV Validation Script
 * SuiteScript 1.0 User Event
 * 
 * Validates Journal Entry lines during CSV import for proper classification fields.
 * Checks for required fields based on account type and auto-populates SAP Cost Center.
 */

function lookupAccountInfo(aryAccountIDs){
    var filters = new Array();
    filters[0] = new nlobjSearchFilter('internalid', null, 'anyOf', aryAccountIDs);
    
    var searchResults = loadSearchOver4k('account', 'customsearch_acct_lookup_for_je_validati', filters, null);
    
    var aryAccountInfo = [];
    if(searchResults != null && searchResults.length > 0){
        for (var i=0; i < searchResults.length; i++){
            var searchresult = searchResults[i];
            var tmpObj = {};
            tmpObj.acctID = searchresult.getValue('internalid');
            tmpObj.intercompanyAcct = searchresult.getValue('custrecord_bb_acct_interco');
            tmpObj.tlf = searchresult.getValue('custrecord_bb_tlf_button');
            tmpObj.acctNumber = searchresult.getValue('number');        
            aryAccountInfo.push(tmpObj);
        }
    }
    return aryAccountInfo;
}

function lookupSAPInfo(){
    var searchResults = loadSearchOver4k('customrecord_sap_cost_center', 'customsearch_sap_cost_center_search', null, null);
    
    var arySAPInfo = [];
    if(searchResults != null && searchResults.length > 0){
        for (var i=0; i < searchResults.length; i++){
            var searchresult = searchResults[i];
            var tmpObj = {};
            tmpObj.sapid = searchresult.getValue('internalid');
            tmpObj.subsidiary = searchresult.getValue('custrecord_sap_cc_ccode');
            tmpObj.department = searchresult.getValue('custrecord_sap_cc_dept');
            tmpObj.name = searchresult.getValue('name');        
            arySAPInfo.push(tmpObj);
        }
    }
    return arySAPInfo;
}

function getAcctObj(acctId, aryAccountInfo){
    for (var i=0; i <= aryAccountInfo.length; i++){
        if(aryAccountInfo[i].acctID == acctId){
            return aryAccountInfo[i];
        }
    }    
}

function getSAPObj(subsidiary, department, arySAPInfo){
    for (var i=0; i <= arySAPInfo.length; i++){
        if(arySAPInfo[i].subsidiary == subsidiary && arySAPInfo[i].department == department){
            return arySAPInfo[i].name;
        }
    }    
}

function beforeSubmit(){
    var executionContext = nlapiGetContext().getExecutionContext();

    if (executionContext == 'csvimport') {
        var lineItemCount = nlapiGetLineItemCount('line');
        
        var aryAccountIDs = [];
        if(lineItemCount > 0){
            for (var i=1; i <= lineItemCount; i++){
                aryAccountIDs.push(nlapiGetLineItemValue('line','account', i));
            }
        }
        
        var aryAccountInfo = lookupAccountInfo(aryAccountIDs);
        var arySAPInfo = lookupSAPInfo();

        if(lineItemCount > 0){
            for (var i=1; i <= lineItemCount; i++){
                var acctId = nlapiGetLineItemValue('line','account', i);
                var acctObj = getAcctObj(acctId, aryAccountInfo);
                var acct_intercompany = acctObj.intercompanyAcct;
                var tlf = acctObj.tlf;
                var acctNum = acctObj.acctNumber;

                // Classification fields
                var department = nlapiGetLineItemValue('line', 'department', i);
                var dac = nlapiGetLineItemValue('line', 'cseg_bb_dac', i);
                var riskLocation = nlapiGetLineItemValue('line', 'custcol_cseg_bb_risk_loc', i);
                var product = nlapiGetLineItemValue('line', 'cseg_product', i); 
                var affiliate = nlapiGetLineItemValue('line', 'cseg_bb_affiliate', i);
                var source = nlapiGetLineItemValue('line', 'custcol_bb_je_source', i);
                var profitCenter = nlapiGetLineItemValue('line', 'custcol_cseg_bb_profitcent', i);
                var sapCostCenter = nlapiGetLineItemValue('line', 'custcol_bb_sap_cc', i);
                var subsidiary = nlapiGetValue('subsidiary');
                var sapName = getSAPObj(subsidiary, department, arySAPInfo);

                // #1: If Underwriting account, require DAC, Risk Location, and Product
                if (!!dac) {
                    if (riskLocation == '' || riskLocation == null) {
                        throw nlapiCreateError('Line', 'Line: Account ' + acctNum + ' requires a Risk Location to be selected.');
                    }
                    if (product == '' || product == null) {
                        throw nlapiCreateError('Line', 'Line: Account ' + acctNum + ' requires a Product to be selected.');
                    }
                    if (profitCenter == '' || profitCenter == null) {
                        throw nlapiCreateError('Line', 'Line: Account ' + acctNum + ' requires a Profit Center to be selected.');
                    }    
                }

                // #2: If a line hits Intercompany, require Affiliate
                if (affiliate == '' || affiliate == null) {
                    if ((affiliate == '' || affiliate == null) && (acct_intercompany == 'T')) {
                        throw nlapiCreateError('Line', 'Line: Account ' + acctNum + ' requires an Affiliate to be selected.');
                    }
                }

                // #3: If P&L (starts with 4,5,6,7), require Profit Center
                if (acctNum >= 40000000 && acctNum <= 79999999) {
                    if (profitCenter == '' || profitCenter == null) {
                        throw nlapiCreateError('Line', 'Line: Account ' + acctNum + ' requires a Profit Center to be selected.');
                    }
                }

                // #4: If GOE (starts with 6): require Department
                if (acctNum >= 60000000 && acctNum <= 69999999) {
                    if (department == '' || department == null) {
                        throw nlapiCreateError('Line', 'Line: Account ' + acctNum + ' requires a Department to be selected.');
                    }
                    if (profitCenter == '' || profitCenter == null) {
                        throw nlapiCreateError('Line', 'Line: Account ' + acctNum + ' requires a Profit Center to be selected.');
                    }    
                }

                // #5: All lines require Source
                if (source == '' || source == null) {
                    throw nlapiCreateError('Line', 'Line: Account ' + acctNum + ' requires a Source to be selected.');
                }

                // #6: If TLF active, require DAC, Risk Location, and Product
                if (!!tlf) {
                    if (riskLocation == '' || riskLocation == null) {
                        throw nlapiCreateError('Line', 'Line: Account ' + acctNum + ' requires a Risk Location to be selected.');
                    }
                    if (product == '' || product == null) {
                        throw nlapiCreateError('Line', 'Line: Account ' + acctNum + ' requires a Product to be selected.');
                    }
                    if (profitCenter == '' || profitCenter == null) {
                        throw nlapiCreateError('Line', 'Line: Account ' + acctNum + ' requires a Profit Center to be selected.');
                    }    
                }
            
                // #7: Populate SAP Cost Center
                if (sapCostCenter == '' || sapCostCenter == null) {
                    nlapiSetLineItemValue('line', 'custcol_bb_sap_cc', sapName, i);
                }
            }
        }
    }
}

function loadSearchOver4k(ss_type, ss_id, addFilters, replaceFilters){
    var completeSearchResultSet = [];
        
    var search = nlapiLoadSearch(ss_type, ss_id);
    var existingFilters = search.getFilters();
    
    var filterExpression = [["internalidnumber","greaterthan","0"]];
    
    search.setFilterExpression(filterExpression);
    search.addFilters(existingFilters);
    search.addFilters(addFilters);
    
    if(replaceFilters != null){ 
        search.setFilterExpression(filterExpression);
        search.addFilters(replaceFilters);
    }
    
    var finalFilterExpression = search.getFilterExpression();
    var results = search.runSearch();
    var i = 1;
    var lastResult = 0;
    
    results.forEachResult(function(r) {
        completeSearchResultSet.push(r);
        i++;
        if (i == 4001){
            lastResult = r.getId();
            return false;
        }
        else return true;
    });

    while (i == 4001) {
        i = 1;
        search = nlapiLoadSearch(ss_type, ss_id);
        finalFilterExpression[0][2] = lastResult;
        search.setFilterExpression(finalFilterExpression);
        results = search.runSearch();

        results.forEachResult(function(r) {
            completeSearchResultSet.push(r);
            i++;
            if (i == 4001) {
                lastResult = r.getId();
                return false;
            }
            else return true;
        });
    }

    return completeSearchResultSet;    
}
