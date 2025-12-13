/**
 * Module Description
 * 
 * Version    Date            Author           Remarks
 * 1.00       12 Mar 2019     US34734
 *
 */

/**
 * @param {String} type Context Types: scheduled, ondemand, userinterface, aborted, skipped
 * @returns {Void}
 */


function buildCustomPage(request, response){
	nlapiLogExecution('AUDIT','request.getMethod()',request.getMethod());
	
	if(request.getMethod() == 'GET'){
		
		// this is the populated view to the client
		nlapiLogExecution('AUDIT','buildCustomPage');
		createForm();		

	} else {
		//POST
		nlapiLogExecution('AUDIT','Search Submitted for Processing');	

	  	var fileType = request.getParameter('custpage_outputfiletype');
		var fileCabinetFolderID = request.getParameter('custpage_folderid');
		var savedSearchID = request.getParameter('custpage_search');
		var outputFileName = request.getParameter('custpage_outputfilename');
		var includeTimestamp = request.getParameter('custpage_include_timestamp');


		nlapiLogExecution('DEBUG', 'buildCustomPage POST - fileType', fileType);
		nlapiLogExecution('DEBUG', 'buildCustomPage POST - fileCabinetFolderID', fileCabinetFolderID);
		nlapiLogExecution('DEBUG', 'buildCustomPage POST - savedSearchID', savedSearchID);
		nlapiLogExecution('DEBUG', 'buildCustomPage POST - outputFileName', outputFileName);
		nlapiLogExecution('DEBUG', 'buildCustomPage POST - includeTimestamp', includeTimestamp);
		
		
		var params = new Array();
		params['custscript_fc_sch_output_file_type'] = fileType;
		params['custscript_fc_sch_file_cabinet_folder_id'] = fileCabinetFolderID;
		params['custscript_fc_sch_saved_search'] = savedSearchID;
		params['custscript_fc_sch_output_file_name'] = outputFileName;
		params['custscript_fc_sch_include_timestamp'] = includeTimestamp;
		
		//execute the scheduled script to do the bulk of the work to create the invoices
		var sched_status = nlapiScheduleScript('customscript_saved_search_to_file_cabine', 'customdeploy_search_to_fc_for_suitelet', params);
		nlapiLogExecution('DEBUG','sched_status: ',sched_status);
		nlapiSetRedirectURL('suitelet', nlapiGetContext().getScriptId(), nlapiGetContext().getDeploymentId());
	}
}


function main_scheduled(){
	
	var defaultOutputFileType = nlapiGetContext().getSetting('SCRIPT','custscript_fc_sch_output_file_type');
	var defaultFolder = nlapiGetContext().getSetting('SCRIPT','custscript_fc_sch_file_cabinet_folder_id');
	var defaultSavedSearch = nlapiGetContext().getSetting('SCRIPT','custscript_fc_sch_saved_search');
	var outputFileName = nlapiGetContext().getSetting('SCRIPT','custscript_fc_sch_output_file_name');
	var includeTimeStamp = nlapiGetContext().getSetting('SCRIPT','custscript_fc_sch_include_timestamp');
	
	var searchResults = loadSearchOver4k(null, defaultSavedSearch, null, null);

	if(searchResults != null && searchResults.length > 0){
		var aryFieldsWithData = convertSavedSearchToArray(searchResults);
		
		var strData = '';
		var strHeaders = '';
		for (var i = 0; aryFieldsWithData != null && i < aryFieldsWithData.length; i++) {
			
			var row = aryFieldsWithData[i];
			var debug =123;
			
			for (var j = 0; row != null && j < row.length; j++) {
				
				var cell = row[j];
				
				if(i == 0){
					strHeaders += cell.fieldName + ',';
				}
				
				strData += cell.fieldVal + ',';
				
				var debug =123;
			}
			strData += '\n'
		}
		
		var data = strHeaders + '\n' + strData;
		
		var extension = '';
		if(defaultOutputFileType == 'CSV'){extension = '.csv';}
		if(defaultOutputFileType == 'EXCEL'){
			extension = '.xls';
			data = nlapiEncrypt(data, 'base64');
			}
		
		var timestamp = '';
		if(includeTimeStamp == 'T'){timestamp = '_'+dateToYMD();}
		
		var filename = outputFileName + timestamp + extension;
		
		var myFile = nlapiCreateFile(filename, defaultOutputFileType, data);
		myFile.setFolder(defaultFolder);
		myFile.setDescription('Script Generated File');

		 var fileID = nlapiSubmitFile(myFile);
		 return fileID;
		}
}
	
	

function createForm(){
	
	nlapiLogExecution('DEBUG','createForm', 'ENTER FUNCTION');
	
	
	
	var defaultOutputFileType = nlapiGetContext().getSetting('SCRIPT','custscript_fc_default_file_type');
	var defaultFolder = nlapiGetContext().getSetting('SCRIPT','custscript_fc_default_folder');
	var defaultSavedSearch = nlapiGetContext().getSetting('SCRIPT','custscript_fc_default_saved_search');
	var outputFileName = nlapiGetContext().getSetting('SCRIPT','custscript_fc_output_file_name');
	
		
	var form = nlapiCreateForm('Saved Search To File Cabinet');    
	
	form.setScript('customscript_search_to_file_cab_client');

	var fileTypeSelect = form.addField('custpage_outputfiletype','select','Output File Type:','Custom').setMandatory(true);
//	fileTypeSelect.addSelectOption('','');
	fileTypeSelect.addSelectOption('CSV','CSV');
//	fileTypeSelect.addSelectOption('EXCEL','EXCEL');
	fileTypeSelect.setDefaultValue(defaultOutputFileType);


	form.addField('custpage_folderid','integer','File Cabinet Folder ID').setMandatory(true).setDefaultValue(defaultFolder);
	form.addField('custpage_search','select','Saved Search','-119').setMandatory(true).setDefaultValue(defaultSavedSearch);
	form.addField('custpage_outputfilename','text','Output File Name').setMandatory(true).setDefaultValue(outputFileName);
	form.addField('custpage_include_timestamp','checkbox','Include Time Stamp');
	
	var fld_timestamp = form.addField('custpage_timestamp','text','Time Stamp Preview');

	var strToday = dateToYMD();
	
	fld_timestamp.setDefaultValue('_'+strToday);
	fld_timestamp.setDisplayType('hidden');

	form.addSubmitButton('Create File');
	
	response.writePage(form);
}


function loadSearchOver4k(ss_type, ss_id, addFilters, replaceFilters){
	
	//saved search MUST be sorted by internal ID ascending...future addition to force that?
	
	//var completeSearchResultSet = new Array();
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
	
	//get resulting updated filter expression for use in >4k loop
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
	        if (i == 4001)
	        {
	        	lastResult = r.getId();
	        	return false;
	        	}
	        else return true;
	    });
	}

	return completeSearchResultSet;	
}

function convertSavedSearchToArray(searchResults){
	
	var arySearchResults = [];

	//for each row
	for (var i = 0; searchResults != null && i < searchResults.length; i++) {
		
		var aryCols = [];
		//for each column
		searchResults[i].getAllColumns().forEach(function(col) {
			var colObj = {};
		    //var fieldName = getJoinedName(col);
		    var fieldName = col.getLabel();
		    colObj.fieldName = fieldName;
		    nlapiLogExecution('DEBUG', 'fieldName', fieldName);
		    
		    var fieldVal = searchResults[i].getText(col) || searchResults[i].getValue(col);
		    colObj.fieldVal = fieldVal;
		    nlapiLogExecution('DEBUG', 'fieldVal', fieldName);
		    
		    aryCols.push(colObj);
		});

		arySearchResults.push(aryCols)
	}

	var debug =123;

	return arySearchResults;
}

function getJoinedName(col) {
    if(col.getName().indexOf('formula') === 0 && col.getLabel()){
      return 'fm_'+ col.getLabel().toLowerCase();
    }
    var join = col.getJoin();
    return join ? col.getName() + '__' + join : col.getName();
}


function dateToYMD(date) {
//var date = new Date('March 13, 08 9:22:9');
    
	if(!date){date = new Date();}
	
	var s = date.getSeconds();
	var min = date.getMinutes();
	var h = date.getHours();
	var d = date.getDate();
    var m = date.getMonth() + 1; //Month from 0 to 11
    var y = date.getFullYear();
    var returnStr = '' + y + '-' + (m<=9 ? '0' + m : m) + '-' + (d <= 9 ? '0' + d : d) + '_' + (h <= 9 ? '0' + h : h)+ '' + (min <= 9 ? '0' + min : min)+ '' + (s <= 9 ? '0' + s : s);

    return returnStr;
}

function fieldChanged(type, name){
	if (
			name === 'custpage_include_timestamp'
		)
	{
		updateTime();
	}
}

function updateTime(){
	
	nlapiSetFieldValue('custpage_timestamp', '_'+dateToYMD());
}
