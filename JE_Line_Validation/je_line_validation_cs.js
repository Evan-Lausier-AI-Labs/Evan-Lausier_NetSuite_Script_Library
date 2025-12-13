/**
 * Module Description
 * 
 * Version 1.0    Date 12/14/2018            Author E.Lausier           Remarks
 *
 */

function lookupSAPInfo(){
	
	var searchResults = loadSearchOver4k('customrecord_sap_cost_center', 'customsearch_sap_cost_center_search', null, null);
	
	var arySAPInfo = [];
	if(searchResults != null && searchResults.length > 0){
		
		for (var i=0; i < searchResults.length; i++){
			var searchresult = searchResults[i];
			var tmpObj = {};
			tmpObj.sapid = searchresult.getValue('internalid');
			tmpObj.subsidiary = searchresult.getValue('custrecord_sap_cc_cocode');
            tmpObj.department = searchresult.getValue('custrecord_sap_cc_dept');
			tmpObj.name = searchresult.getValue('name');		
			arySAPInfo.push(tmpObj);
		}
	}
	return arySAPInfo;
}

function getSAPObj(subsidiary,department, arySAPInfo){
	
	for (var i=0; i < arySAPInfo.length; i++){
		if(arySAPInfo[i].subsidiary == subsidiary && arySAPInfo[i].department == department){
			return arySAPInfo[i].name;
		}
	}	
}

function validateLine(type) {
	
    var recordType = nlapiGetRecordType();
    var arySAPInfo = lookupSAPInfo();
    var acctId = nlapiGetCurrentLineItemValue('line','account');
    var acctRec = nlapiLoadRecord('account', acctId);
    
    var acct_intercompany = acctRec.getFieldValue('custrecord_bb_acct_interco');
    var tlf = acctRec.getFieldValue('custrecord_bb_tlf_button');
    
    // Get the account number by parsing the displayed account info
    var acctDisplay = nlapiGetCurrentLineItemValue(type, 'account_display');
    if (acctDisplay == '' || acctDisplay == null) { return true };
    var strAcctNum = acctDisplay.substring(0, acctDisplay.indexOf(" "));
    var acctNum = parseInt(strAcctNum);

    // Classification fields
    var department = nlapiGetCurrentLineItemValue('line', 'department');
    var dac = nlapiGetCurrentLineItemValue('line', 'cseg_bb_dac');
    var riskLocation = nlapiGetCurrentLineItemValue('line', 'custcol_cseg_bb_risk_loc');
    var product = nlapiGetCurrentLineItemValue('line', 'cseg_product'); 
    var affiliate = nlapiGetCurrentLineItemValue('line', 'cseg_bb_affiliate');
    var profitCenter = nlapiGetCurrentLineItemValue('line', 'custcol_cseg_bb_profitcent');
    var source = nlapiGetCurrentLineItemValue('line', 'custcol_bb_je_source');
    var subsidiary = nlapiGetFieldValue('custbody_bb_cc');
    var sublistIndex = nlapiGetCurrentLineItemIndex(type);
    var sapCC = nlapiGetCurrentLineItemValue('line', 'custcol_bb_sap_cc');
    var sapName = getSAPObj(subsidiary, department, arySAPInfo);

    // #1: If Underwriting account, require DAC, Risk Location, and Product
    if (!isFieldEmpty(dac)) {
        if (isFieldEmpty(riskLocation)) { alert('Line ' + sublistIndex + ':  Account ' + acctNum + ' requires a Risk Location to be selected.'); return false; }
        if (isFieldEmpty(product)) { alert('Line ' + sublistIndex + ':  Account ' + acctNum + ' requires a Product to be selected.'); return false; }
        if (isFieldEmpty(profitCenter)) { alert('Line ' + sublistIndex + ':  Account ' + acctNum + ' requires a Profit Center to be selected.'); return false; }    
    }
  
    // #2: If a line hits Intercompany, require Affiliate
    if (isFieldEmpty(affiliate)) {
        if (isFieldEmpty(affiliate) && !isFieldEmpty(acct_intercompany)) { alert('Line ' + sublistIndex + ':  Account ' + acctNum + ' requires a Affiliate to be selected.'); return false; }
    }
  
    // #3: If P&L (starts with 4,5,6,7), require Profit Center
    if (acctNum >= 40000000 && acctNum <= 79999999) {
        if (isFieldEmpty(profitCenter)) { alert('Line ' + sublistIndex + ':  Account ' + acctNum + ' requires a Profit Center to be selected.'); return false; }
    }
  
    // #4: If GOE (starts with 6): require Department
    if (acctNum >= 60000000 && acctNum <= 69999999){
        if (isFieldEmpty(department)) { alert('Line ' + sublistIndex + ':  Account ' + acctNum + ' requires a Department to be selected.'); return false; }
        if (isFieldEmpty(profitCenter)) { alert('Line ' + sublistIndex + ':  Account ' + acctNum + ' requires a Profit Center to be selected.'); return false; }    
    }
      
    // #5: All lines require Source
    if (isFieldEmpty(source)){
        if (isFieldEmpty(source)) { alert('Line ' + sublistIndex + ':  All Lines ' + acctNum + ' requires a Source to be selected.'); return false; }
    }

    // #6: If tlf not empty, apply dac rules
    if (!isFieldEmpty(tlf)) {
        if (isFieldEmpty(riskLocation)) { alert('Line ' + sublistIndex + ':  Account ' + acctNum + ' requires a Risk Location to be selected.'); return false; }
        if (isFieldEmpty(product)) { alert('Line ' + sublistIndex + ':  Account ' + acctNum + ' requires a Product to be selected.'); return false; }
        if (isFieldEmpty(profitCenter)) { alert('Line ' + sublistIndex + ':  Account ' + acctNum + ' requires a Profit Center to be selected.'); return false; }
    }

    // #7: Populate SAP Cost Center
    if ((sapCC == '' || sapCC == null) && (department != '' || department != null) && (subsidiary != '' || subsidiary != null)) {
        nlapiSetCurrentLineItemValue('line', 'custcol_bb_sap_cc', sapName);
    }

    return true;
}

function isFieldEmpty(val) {
    if (val == '' || val == null || val == 'F') {
        return true;
    }
    return false;
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
