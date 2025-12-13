function buildCustomPage(){

	nlapiLogExecution('AUDIT','request.getMethod()',request.getMethod());
	
	if(request.getMethod() == 'GET'){		
		nlapiLogExecution('AUDIT','buildCustomPage');
		createForm(null);		
	} else {
		nlapiLogExecution('AUDIT','SUBMIT CLICKED');

		var lineCount = request.getLineItemCount('custpage_files_available');
		if(lineCount > 0){
			nlapiLogExecution('DEBUG','lineCount',lineCount);
			var i = 1;
			var x = 0;
			var processRecord = 'F';
			var recordsToBeProcessed = []; 

			nlapiLogExecution('DEBUG','lineCount.length',lineCount);
			
			while (i <= lineCount) {
				
				processRecord = request.getLineItemValue('custpage_files_available', 'custpage_process_yesno', i);

				nlapiLogExecution('DEBUG','upload?',request.getLineItemValue('custpage_files_available', 'custpage_process_yesno', i));
				nlapiLogExecution('DEBUG','internal ID',request.getLineItemValue('custpage_files_available', 'custpage_internalid', i));
				nlapiLogExecution('DEBUG','name',request.getLineItemValue('custpage_files_available', 'custpage_name', i));
				nlapiLogExecution('DEBUG','folder',request.getLineItemValue('custpage_files_available', 'custpage_folder', i));
				nlapiLogExecution('DEBUG','size',request.getLineItemValue('custpage_files_available', 'custpage_documentsize', i));
				nlapiLogExecution('DEBUG','date created',request.getLineItemValue('custpage_files_available', 'custpage_created', i));
				nlapiLogExecution('DEBUG','last modified',request.getLineItemValue('custpage_files_available', 'custpage_modified', i));
				nlapiLogExecution('DEBUG','type',request.getLineItemValue('custpage_files_available', 'custpage_filetype', i));				
				
				if (processRecord == 'T') {
					var strIntID = request.getLineItemValue('custpage_files_available', 'custpage_internalid', i)
					nlapiLogExecution('DEBUG','strIntID: ',strIntID);
					recordsToBeProcessed[x] = strIntID;						
					processRecord = 'F';
					x++;
				}
				i++;			
			}
			
			if(recordsToBeProcessed.length > 0){
				var uploadDirectory = nlapiGetContext().getSetting('SCRIPT','custscript_sftp_up_interface_directory');
				var replaceExisting = request.getParameter("custpage_overwrite_existing");
				nlapiLogExecution('DEBUG','replaceExisting',replaceExisting);		
				
				var params = new Array();
				params['custscript_sftp_operation'] = 'upload';
				params['custscript_sftp_upload_file_id'] = recordsToBeProcessed[0];
				params['custscript_sftp_upload_directory'] = uploadDirectory;
				params['custscript_sftp_upload_replace_existing'] = replaceExisting;
				
				var sched_status = nlapiScheduleScript('customscript_sftp_transfer', 'customdeploy_sftp_transfer', params);
				nlapiLogExecution('DEBUG','sched_status: ',sched_status);			
			}

			nlapiSetRedirectURL('suitelet', nlapiGetContext().getScriptId(), nlapiGetContext().getDeploymentId());
			var statusSearch = nlapiLoadSearch('scheduledscriptinstance', getSearchToRedirectTo());
			statusSearch.setRedirectURLToSearchResults();
		}
	}
}

function createForm(args){
	nlapiLogExecution('DEBUG','createForm', 'ENTER FUNCTION');
	
	var param_source_folder = request.getParameter("custparam_source_folder");
	var paramObjs = getParameters();

	var form = nlapiCreateForm('Secure File Transfer - UPLOAD');    

	var rootDir = getRootDirForUpload();
	
	var folderSelect = form.addField('custpage_select_folder', 'select', 'Select Source');
	var aryFolderContents = getSubFolders(rootDir);
	folderSelect.addSelectOption('', '');
	
	_.each(aryFolderContents, function (value, key) {
		folderSelect.addSelectOption(value.fileID, value.filename);
	});	
	
	folderSelect.setDefaultValue(paramObjs.source_folder);
	
	if(paramObjs.source_folder != '' && paramObjs.source_folder != null){
		var files_sublist = form.addSubList('custpage_files_available','list','Files Available');
		files_sublist.addField('custpage_process_yesno','radio','Upload?');
		var searchID = getSearchForAvailableFilesToUpload();
		var resolvedJoins = getSublistSearchResults(paramObjs, files_sublist, searchID, 'file', true);
		
		var numResults = 0;
		if(!_.isEmpty(paramObjs)){
			files_sublist.setLineItemValues(resolvedJoins.resolvedJoins);
			if(resolvedJoins.resolvedJoins){
				numResults = resolvedJoins.resolvedJoins.length;
			}
		}
		files_sublist.setLabel('Files Available: '+numResults.toString());
	}
	form.setScript('customscript_sftp_upload_client');
	
	var overwriteExisting = form.addField('custpage_overwrite_existing', 'checkbox', 'Overwrite Existing?');
	overwriteExisting.setDefaultValue('T');
	
	form.addSubmitButton('Upload File');	
	response.writePage(form);
}

function getParameters(){
	var paramObj = {};
	paramObj.source_folder = request.getParameter("custparam_source_folder");
	nlapiLogExecution('ERROR','getParameters - param_source_folder', paramObj.source_folder);
	return paramObj;
}

function getRootDirForUpload(){
	var rootdir = nlapiGetContext().getSetting('SCRIPT','custscript_root_dir_for_upload');
	nlapiLogExecution('DEBUG','getRootDirForUpload', 'ID: '+rootdir);
	return rootdir;
}

function getSearchToRedirectTo(){
	var searchID = nlapiGetContext().getSetting('SCRIPT','custscript_sftp_upload_search_redirect');
	nlapiLogExecution('DEBUG','getSearchToRedirectTo', 'ID: '+searchID);
	return searchID;
}

function getSearchForAvailableFilesToUpload(){
	var searchID = nlapiGetContext().getSetting('SCRIPT','custscript_sftp_upload_file_list');
	nlapiLogExecution('DEBUG','getSearchForAvailableFilesToUpload', 'ID: '+searchID);
	return searchID;
}

function getSubFolders(rootdir){
	var filters = new Array();
	filters[0] = new nlobjSearchFilter('parent', null, 'is', rootdir);

	var columns = new Array();
	var filename = new nlobjSearchColumn('name');
	var fileid = new nlobjSearchColumn('internalid');
	
	columns[0] = filename;
	columns[1] = fileid;
	
	var aryResults = [];

	var searchResult = nlapiSearchRecord('folder', null , filters , columns);
	if(searchResult) {
		for (var i = 0 ; i < searchResult.length; i++) {
			var f = searchResult[i];
			aryResults.push({'fileID': f.getValue(fileid), 'filename': f.getValue(filename)})
		};
	};
	return aryResults;
}

function getFilesInFolder(folder){
	var filters = new Array();
	filters[0] = new nlobjSearchFilter('internalid', null, 'is', rootdir);

	var columns = new Array();
	var filename = new nlobjSearchColumn('name', 'file');
	var fileid = new nlobjSearchColumn('internalid', 'file');

	columns[0] = filename;
	columns[1] = fileid;
	
	var aryResults = [];

	var searchResult = nlapiSearchRecord('folder', null , filters , columns);
	if(searchResult) {
		for (var i = 0 ; i < searchResult.length; i++) {
			var f = searchResult[i];
			aryResults.push({'fileID': f.getValue(fileid), 'filename': f.getValue(filename)})
		};
	};
	return aryResults;
}

function fieldChanged(type, name){
	nlapiLogExecution('ERROR','fieldChanged', 'ENTER FUNCTION');
	nlapiLogExecution('ERROR','fieldChanged', 'type: '+type +', name: '+name);
	
	if(name === 'custpage_select_folder'){applyFilters();}
}

function applyFilters(){
	nlapiLogExecution('ERROR','applyFilters', 'ENTER FUNCTION');
	
	var filter_source_folder = nlapiGetFieldValue('custpage_select_folder') || "";
	nlapiLogExecution('DEBUG','applyFilters', 'filter_source_folder ' + filter_source_folder);
	
	var url = nlapiResolveURL('SUITELET', 'customscript_sftp_interface_upload','customdeploy_sftp_interface_upload');
	nlapiLogExecution('DEBUG','url', url);
	
	if(filter_source_folder != null && filter_source_folder != ''){
		url += '&custparam_source_folder=' + encodeURIComponent(filter_source_folder);
	}
	
	nlapiLogExecution('DEBUG','url', url);	
	window.open(url,'_self',false);
	nlapiLogExecution('DEBUG','applyFilters', 'after redirect');
}

function getSublistSearchResults(mainArgs, sublist, baseSearchID, baseSearchType, saveSearch){
	nlapiLogExecution('DEBUG','getSublistSearchResults', 'ENTER FUNCTION');
	var searchFilters = null;
	
	if(!_.isEmpty(mainArgs)){
		nlapiLogExecution('DEBUG','mainArgs', 'mainArgs NOT null');
		searchFilters = new Array();
		nlapiLogExecution('DEBUG','mainArgs.source_folder', mainArgs.source_folder);
				
		if(mainArgs.source_folder != null && mainArgs.source_folder.length > 0){
			searchFilters.push(new nlobjSearchFilter('folder', null, 'anyof', mainArgs.source_folder))
		};
		
		nlapiLogExecution('DEBUG','getSublistSearchResults','1');
	}
	
	var searchResults = loadSearchOver4k(baseSearchType, baseSearchID, searchFilters, null);
	nlapiLogExecution('DEBUG','getSublistSearchResults','searchResults.length: '+searchResults.length);
	
	var searchIntID = null;
	if(saveSearch){
		searchIntID = createSearchInstance(baseSearchType, baseSearchID, searchFilters)
	}
	nlapiLogExecution('DEBUG','getSublistSearchResults','2');
	if(searchResults != null && searchResults.length > 0){
		var resolvedJoins = convertSavedSearchToSublist(sublist, searchResults) || null;
	}
	nlapiLogExecution('DEBUG','getSublistSearchResults','3');
	
	return {'resolvedJoins': resolvedJoins, 'searchIntID':searchIntID};
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

function createSearchInstance(baseSearchType, baseSearchID, filters){
	var uniqStr = moment().format("YYYYMMDDhhmmss");
	var newTitle = 'SFTP Upload Sublist '+uniqStr;
	var newID = 'customsearch_sftp_up_'+uniqStr;
	
	nlapiLogExecution('DEBUG','createSearchInstance', 'newTitle '+newTitle);
	nlapiLogExecution('DEBUG','createSearchInstance', 'newID '+newID);
	
	var search = nlapiLoadSearch(baseSearchType, baseSearchID);
	var existingSearchType = search.getSearchType();
	var existingSearchFilters = search.getFilters();
	var existingSearchColumns = search.getColumns();
	
	var newSearch = nlapiCreateSearch(existingSearchType, existingSearchFilters,existingSearchColumns);
	newSearch.addFilters(filters);
	newSearch.setIsPublic(true);
	var search_int_id = newSearch.saveSearch(newTitle, newID);
	nlapiLogExecution('DEBUG','createSearchInstance', 'search_int_id '+search_int_id);
	return search_int_id;
}

function convertSavedSearchToSublist(sublist, searchResults){
	searchResults[0].getAllColumns().forEach(function(col) {
	    sublist.addField(getJoinedName(col), 'text', col.getLabel());
	});
	
	var resolvedJoins = searchResults.map(function(sr) {
	    var ret = {
	        id: sr.getId()
	    };
	    sr.getAllColumns().forEach(function(col) {
	        ret[getJoinedName(col)] = sr.getText(col) || sr.getValue(col);
	    });
	    return ret;
	});
	
	return resolvedJoins;
}

function getJoinedName(col) {
    if(col.getName().indexOf('formula') === 0 && col.getLabel()){
    	var rtnValFormula = 'lbl_'+ col.getLabel();
    	rtnValFormula = ('custpage_' + rtnValFormula).toLowerCase();
    	nlapiLogExecution('DEBUG','getJoinedName', 'rtnValFormula: '+rtnValFormula);
    	return rtnValFormula;
    }
    var join = col.getJoin();
    var rtnVal = join ? col.getName() + '__' + join : col.getName();
    rtnVal = ('custpage_' + rtnVal).toLowerCase();
    return rtnVal.toLowerCase();
}
