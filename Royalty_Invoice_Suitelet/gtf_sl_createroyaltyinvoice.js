/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 * Allows users to create an Invoice
 * @copyright 2022 Oracle
 * @author
 */

define(['N/redirect', 'N/ui/serverWidget', 'N/search', 'N/runtime', 'N/cache', 'N/ui/dialog', 'N/ui/message', 'N/format'],
    (redirect, serverWidget, search, runtime, cache, dialog, message, format) => {

        const obtainScriptId = () => {
            log.debug("Inside of Suitelet");
            // Loads the client script for any client-side handling required.
           let stLogTitle = 'obtainScriptId';
            try {
                log.debug("Inside of try");
                let scriptId = runtime.getCurrentScript().getParameter('custscript_gtf_client_script_1_4');
                log.debug(stLogTitle, 'scriptId: ' +  scriptId);
                let fileId;
                if (scriptId) {
                    let scriptSearch = search.create({
                        type: "script",
                        filters: [
                            ["internalid", "is", scriptId]
                        ],
                        columns: [
                            search.createColumn({
                                name: "scriptfile",
                                sort: search.Sort.ASC
                            }),
                            "scriptfile"
                        ]
                    });

                    let results = scriptSearch.run().getRange(0, 1);
                    for (let i = 0; i < results.length; i++) {
                        fileId = results[i].getValue({
                            name: 'scriptfile'
                        });
                    }
                }
                return fileId;
            } catch (error) {
                log.error(stLogTitle, error.toString());
                throw error;
            }
        };

/**
 * This function returns franchisee sales reporting
 *
 * @param {String} Start Date
 * @param {String} End Date
 * @param {Id} Billing Schedule
 * @returns {Array} List of franchise sales reporting
 */
const getAllResults = (s) => {
    let results = s.run();
    let searchResults = [];
    let searchid = 0;
    let resultslice = [];
    do {
        resultslice = results.getRange({start:searchid,end:searchid+1000});
        resultslice.forEach((slice) => {
            searchResults.push(slice);
            searchid++;
        });
    } while (resultslice.length >=1000);
    return searchResults;
};
//Loads the Map Reduce Script as a parameter on script record
  //Call cacheidvalue
const callMapReduce = (cacheKey, invoiceDate,arrSalesDataToAdd) => {
    let stLogTitle = 'callMapReduce';
    try {
      log.debug('Get cachekey values',cacheKey);
      const cacheObject = cache.getCache({
                        name: 'salesDataCacheData',
                        scope: cache.Scope.PUBLIC
                    });
      //Get Cache data
      let cacheData = cacheObject.get({
                        key: cacheKey
                    });
      log.debug('Get cache data', cacheData);
        
      let taskId = '';
      require(['N/task'], function (task) {
            let taskObj = task.create({
                taskType: task.TaskType.MAP_REDUCE,
                scriptId: runtime.getCurrentScript().getParameter('custscript_gtf_map_reduce_parameter_1_4'),
                deploymentId: 'customdeploy_gtf_mr_createinvoiceroyalty',
                  //Set cache variable
                params: {
                    custscript_gtf_cache_key: cacheKey,
                    custscript_gtf_sl_invoice_date: invoiceDate,
                    custscript_gtf_arr_sales_data: arrSalesDataToAdd
                    }
                });
            taskId = taskObj.submit();
      });
      return taskId;
    } catch (error) {
        log.error(stLogTitle, error.toString());
        throw error;
    }
};
//Defines the function that is executed after the page completes loading
const page_initial = (context) => {
    let stLogTitle = 'page_initial';
    try {
      log.debug('Inside page initial');
        let response = context.response;
        let form = serverWidget.createForm({
            title: 'Select Sales Data',
            hideNavBar: 'false'
        });

        // Load the Client Script
       let clientScriptId = obtainScriptId();
        log.debug("clientScriptId", clientScriptId);
        if (clientScriptId) {
            form.clientScriptFileId = clientScriptId;
        }
        else {
            log.error('Missing client script file id');
        }
		let parameters = context.request.parameters;
            log.debug(stLogTitle, parameters);

            let startDateVal = parameters.start_date;
      		let Franchisee = parameters.Franchisee;
            let storeNumberVal = parameters.storeNumberVal;
      		let Brand = parameters.Brand;
            let royaltyBilling = parameters.royaltyBilling;
            let accPeriod = parameters.accounting_period;
      		/**let royaltyBillingSchedule = parameters.royaltyBillingSchedule*/
			let startDateObj = '';
		if(startDateVal){
			log.debug('Inside start date if');
			startDateObj = new Date(startDateVal);
           let startOffsetHours = startDateObj.getTimezoneOffset()/60;  
            log.debug('startOffsetHours',startOffsetHours);
            startDateObj.setHours(startDateObj.getHours() + startOffsetHours);
		}
			let endDateVal = parameters.end_date;
			let endDateObj = '';
		if(endDateVal){
            log.debug('Inside end date if');
			endDateObj = new Date(endDateVal);
           let endOffsetHours = endDateObj.getTimezoneOffset()/60;
            endDateObj.setHours(endDateObj.getHours() + endOffsetHours);
		}
			
			
        // Franchisee select field in header
        let franchiseeIdField = form.addField({
            id: 'franchiseeidfield',
            type: serverWidget.FieldType.SELECT,
            label: 'Franchisee',
            source: 'customer'
        });
        if (Franchisee){
        franchiseeIdField.defaultValue = Franchisee;}
        /**franchiseeIdField.updateDisplayType({
            displayType : serverWidget.FieldDisplayType.DISABLED
        });*/

        // Store Number select field in header
        let storeNumber = form.addField({
            id: 'storenumberfield',
            type: serverWidget.FieldType.SELECT,
            label: 'Store Number',
          	source:'customrecord_cseg_fran_store_num'
        });
        if (storeNumberVal){
        storeNumber.defaultValue = storeNumberVal;}
        /**storeNumber.updateDisplayType({
            displayType : serverWidget.FieldDisplayType.DISABLED
        });*/

        
      // Brand select field in header
        let brandType = form.addField({
            id: 'brandtypefield',
            type: serverWidget.FieldType.SELECT,
            label: 'Brand Type',
            source: 'customrecord_cseg_fran_filter_1'
        });
        if (Brand){
        brandType.defaultValue = Brand;
        }
        //Invoice Date in header
      let invoiceDate = form.addField({
            id: 'invoicedatefield',
            type: serverWidget.FieldType.DATE,
            label: 'Invoice Date'
        });
      invoiceDate.isMandatory = true;


        // Start Date field in header
        let startDate = form.addField({
            id: 'startdatefield',
            type: serverWidget.FieldType.DATE,
            label: 'Sales Start Date'
           
        });
		
		startDate.defaultValue = startDateObj;
        startDate.isMandatory = true;
		
		// End Date field in header
      	 let endDate = form.addField({
            id: 'enddatefield',
            type: serverWidget.FieldType.DATE,
            label: 'Sales End Date'
      
        });
         //below field only for WOB
      // let accountingPeriod = form.addField({
      //   id: 'accountingperiodfield',
      //   type: serverWidget.FieldType.SELECT,
      //   label: 'Accounting Period',
      //   source: 'accountingperiod'
      // });
      // if(accPeriod){
      //   accountingPeriod.defaultValue = accPeriod;
      // }else{
      //   var sDate;
      //   var eDate;
      //   var accountingperiodSearchObj = search.create({
      //     type: "accountingperiod",
      //     filters:
      //       [
      //         ["startdate","onorbefore","today"],
      //         "AND",
      //         ["enddate","onorafter","today"],
      //         "AND",
      //         ["parent","noneof","@NONE@"]
      //       ],
      //     columns:
      //       [
      //         search.createColumn({
      //           name: "periodname",
      //           sort: search.Sort.ASC,
      //           label: "Name"
      //         }),
      //         search.createColumn({name: "startdate", label: "Start Date"}),
      //         search.createColumn({name: "enddate", label: "End Date"})
      //       ]
      //   });
      //   accountingperiodSearchObj.run().each(function(result){
      //     // .run().each has a limit of 4,000 results
      //     accountingPeriod.defaultValue = result.id;
      //     sDate = result.getValue('startdate');
      //     eDate = result.getValue('enddate');
      //     return true;
      //   });
      //   startDate.defaultValue = sDate;
      //   endDateObj = new Date(eDate);
      //   let endOffsetHours = endDateObj.getTimezoneOffset()/60;
      //   endDateObj.setHours(endDateObj.getHours() + endOffsetHours);
      //   endDate.defaultValue = endDateObj;
      // }
		  endDate.defaultValue = endDateObj;
      endDate.isMandatory = true;

      //Royalty Billing Schedule in header
       let royaltyBillingField = form.addField({
            id: 'royaltybillingfield',
            type: serverWidget.FieldType.SELECT,
            label: 'Royalty Billing Schedule',
            source: 'customlist_fran_sl_royalty_billing_sch'
        });
      
      royaltyBillingField.isMandatory = true;
      
      if(royaltyBilling){
        royaltyBillingField.defaultValue = royaltyBilling;
      }
        form.addSubmitButton('Create Invoices');
      

        form.addButton({
            id: 'btn_cancel',
            label: 'Cancel',
            functionName: 'handleCancelBtn()'
        });
       form.addButton({
            id: 'btn_reset',
            label: 'Reset',
            functionName: 'handleResetBtn()'
        });
      /*form.addButton({
            id: 'btn_search',
            label: 'Search',
            functionName: 'handleSearchBtn()'
        });*/
        // Add the Sales Data sublist to the form
        let sublist = form.addSublist({
            id: 'sales_list',
            type: serverWidget.SublistType.LIST,
            label: 'Sales Data to Process'
        });

        sublist.addMarkAllButtons();

        sublist.addField({
            id: 'sd_select',
            label: 'Select',
            type: serverWidget.FieldType.CHECKBOX
        });
        sublist.addField({
            id: 'sd_id',
            label: 'Internal Id',
            type: serverWidget.FieldType.TEXT
        });
		let fsAgreementId = sublist.addField({
            id: 'sd_fs_agreement_id',
            label: 'Franchise Agreement Internal Id',
            type: serverWidget.FieldType.TEXT
        });
      fsAgreementId.updateDisplayType({
            displayType: serverWidget.FieldDisplayType.HIDDEN
        });
      
      	let franchiseSalesId = sublist.addField({
            id: 'sd_fs_id',
            label: 'Franchise Sales Internal Id',
            type: serverWidget.FieldType.TEXT
        });
        franchiseSalesId.updateDisplayType({
            displayType: serverWidget.FieldDisplayType.HIDDEN
        });
      /*
        let idField = sublist.addField({
            id: 'sd_date',
            label: 'Sales Date',
            type: serverWidget.FieldType.DATE
        });
*/
        sublist.addField({
            id: 'sd_franchisee',
            label: 'Franchisee',
            type: serverWidget.FieldType.TEXT
        });
		let franchiseeId = sublist.addField({
            id: 'sd_franchisee_id',
            label: 'Franchisee Id',
            type: serverWidget.FieldType.TEXT
        });
        franchiseeId.updateDisplayType({
            displayType: serverWidget.FieldDisplayType.HIDDEN
        });
        sublist.addField({
            id: 'sd_storenumber',
            label: 'Store Number',
            type: serverWidget.FieldType.TEXT
        });
		let storeNumberId = sublist.addField({
            id: 'sd_storenumber_id',
            label: 'Store Number Id',
            type: serverWidget.FieldType.TEXT
		});
		storeNumberId.updateDisplayType({
            displayType: serverWidget.FieldDisplayType.HIDDEN
		});
        sublist.addField({
            id: 'sd_brand',
            label: 'Brand',
            type: serverWidget.FieldType.TEXT
        });
		let brandInternalId = sublist.addField({
            id: 'sd_brand_id',
            label: 'Brand Id',
            type: serverWidget.FieldType.TEXT
		});
		brandInternalId.updateDisplayType({
            displayType: serverWidget.FieldDisplayType.HIDDEN
		});
      sublist.addField({
            id: 'sd_subsidiary',
            label: 'Subsidiary',
            type: serverWidget.FieldType.TEXT
        });
		let SubsidiaryInternalId = sublist.addField({
            id: 'sd_subsidiary_id',
            label: 'Subsidiary Id',
            type: serverWidget.FieldType.TEXT
		});
		//SubsidiaryInternalId.updateDisplayType({
        //    displayType: serverWidget.FieldDisplayType.HIDDEN
		//});
      /*
		sublist.addField({
            id: 'sd_memo',
            label: 'Memo',
            type: serverWidget.FieldType.TEXT
        });
        */
		sublist.addField({
            id: 'sd_item',
            label: 'Item',
            type: serverWidget.FieldType.TEXT
        });
		let itemInternalId = sublist.addField({
            id: 'sd_item_id',
            label: 'Item Id',
            type: serverWidget.FieldType.TEXT
		});
		itemInternalId.updateDisplayType({
            displayType: serverWidget.FieldDisplayType.HIDDEN
        });
       
          sublist.addField({
            id: 'sd_quantity',
            label: 'Billable Sales',
            type: serverWidget.FieldType.TEXT
        });

          sublist.addField({
            id: 'sd_rate',
            label: 'Rate',
            type: serverWidget.FieldType.TEXT
        });
      	sublist.addField({
            id: 'sd_rate_type',
            label: 'Rate Type',
            type: serverWidget.FieldType.TEXT
          });
      /*
		sublist.addField({
            id: 'sd_royalty_amount',
            label: 'Royalty Amount',
            type: serverWidget.FieldType.TEXT
          });
          */
      sublist.addField({
            id: 'sd_account',
            label: 'Account',
            type: serverWidget.FieldType.TEXT
          });

        // run saved search to populate invoice sublist
        let savedSearchId = runtime.getCurrentScript().getParameter({name:'custscript_gtf_store_search_s_1_4'});
        let objSublistSearch = search.load({id:savedSearchId});
		
       //Filter by Brand
		if(Brand){
       let filterBrand = search.createFilter({
            name: "custrecord_fran_fs_sl_filter_1",
            join: "CUSTRECORD_FRAN_FS_STORE_NUMBER",
            operator: search.Operator.IS,
            values: Brand
        });
        objSublistSearch.filters.push(filterBrand);
        }
      if(storeNumberVal){
       let filterStore = search.createFilter({
            name: "custrecord_fran_fs_store_number",
            join: "CUSTRECORD_FRAN_FS_STORE_NUMBER",
            operator: search.Operator.IS,
            values: storeNumberVal
        });
        objSublistSearch.filters.push(filterStore);
        }
      if(royaltyBilling){
       let filterSchedule = search.createFilter({
            name: "custrecord_fran_fa_royalty_billing_sched",
            join: "custrecord_fran_fa_sn",
            operator: search.Operator.IS,
            values: royaltyBilling
        });
        objSublistSearch.filters.push(filterSchedule);
        }
      
      //Filter by start date
      	if(startDateObj){
          
       let startDateFilter = search.createFilter({
                name: "custrecord_fran_fs_sales_date",
         		join: "CUSTRECORD_FRAN_FS_STORE_NUMBER",
                operator: search.Operator.ONORAFTER,
                values: format.format({value: startDateObj, type: format.Type.DATE})
            });
            objSublistSearch.filters.push(startDateFilter);
        }
      //Filter by end date
     	if(endDateObj){
          
       let endDateFilter = search.createFilter({
                name: "custrecord_fran_fs_sales_date",
         		join: "CUSTRECORD_FRAN_FS_STORE_NUMBER",
                operator: search.Operator.ONORBEFORE,
                values: format.format({value: endDateObj, type: format.Type.DATE})
            });
            objSublistSearch.filters.push(endDateFilter);
        }
      
      //Filter by franchisee
      if(Franchisee){
      let franchiseeFilter = search.createFilter({
            name: "custrecord_fran_fs_franchise_customer",
            join: "CUSTRECORD_FRAN_FS_STORE_NUMBER",
            operator: search.Operator.ANYOF,
        	values: Franchisee
         });
        objSublistSearch.filters.push(franchiseeFilter);
        log.debug('franchiseeFilter', franchiseeFilter); 
      }
      
      
      //Filter by royalty billing schedule
       let filterRoyaltyBilling = search.createFilter({
            name: "custrecord_fran_fa_royalty_billing_sched",
         	join: "custrecord_fran_fa_sn",
            operator: search.Operator.IS,
            values: 'customlist_royalty_billing_list'  //Variable Client Script
        });
        objSublistSearch.filters.push(filterRoyaltyBilling);
      
		//Set the values of fields on suitelet
        let counter = 0;
        getAllResults(objSublistSearch).forEach((result) => {
          log.debug('result',result);
            let resultValues = JSON.stringify(result.values);
          log.debug('result.values',resultValues);
            let franchiseeID = result.getText({
				name: "custrecord_fran_fs_franchise_customer",
                join: "CUSTRECORD_FRAN_FS_STORE_NUMBER",
                summary: "GROUP"});
			let franchiseeInternalId = result.getValue({
				name: "custrecord_fran_fs_franchise_customer_id",
                join: "CUSTRECORD_FRAN_FS_STORE_NUMBER",
                summary: "GROUP"});
            let storeNumber = result.getText({
				name: "custrecord_fran_fs_store_number",
                join: "CUSTRECORD_FRAN_FS_STORE_NUMBER",
                summary: "GROUP"});
			let storeNumberInternalId = result.getValue({
				name: "internalid",
                summary: "GROUP"});
            let salesBrand = result.getText({ 
				name: "custrecord_fran_fs_sl_filter_1",
                join: "CUSTRECORD_FRAN_FS_STORE_NUMBER",
                summary: "GROUP"});
			let salesBrandInternalId = result.getValue({
				name: "custrecord_fran_fs_sl_filter_1",
                join: "CUSTRECORD_FRAN_FS_STORE_NUMBER",
                summary: "GROUP"});
          /*  let salesDate= result.getValue({
				name: "custrecord_fran_fs_sales_date",
                join: "CUSTRECORD_FRAN_FS_STORE_NUMBER",
                summary: "GROUP"});
           let salesMemo = result.getValue({
				name: "custrecord_fran_fs_memo",
                join: "CUSTRECORD_FRAN_FS_STORE_NUMBER",
                summary: "GROUP"});*/
           let salesItem = result.getText({
				name: "custrecord_fran_fa_item",
                join: "custrecord_fran_fa_sn",
                summary: "GROUP"});
          let salesItemInternalId = result.getValue({
				name: "custrecord_fran_fa_item",
                join: "custrecord_fran_fa_sn",
                summary: "GROUP"});
          let billableSales = result.getValue({
				name: "custrecord_fran_fs_billable_sales",
                join: "CUSTRECORD_FRAN_FS_STORE_NUMBER",
                summary: "SUM"});
          let salesRate = result.getValue({
				name: "custrecord_fran_fa_rate",
                join: "custrecord_fran_fa_sn",
                summary: "GROUP"});
			let salesRateInternalId = result.getValue({
				name: "custrecord_fran_fa_rate",
                join: "custrecord_fran_fa_sn",
                summary: "GROUP"});
          let salesRateType = result.getText({
				name: "custrecord_fran_fa_rate_type",
                join: "custrecord_fran_fa_sn",
                summary: "GROUP"});
			let salesRateTypeInternalId = result.getValue({
				name: "custrecord_fran_fa_rate_type",
                join: "custrecord_fran_fa_sn",
                summary: "GROUP"});
          let salesAccount = result.getText({
				name: "custrecord_fran_fa_ar",
                join: "custrecord_fran_fa_sn",
                summary: "GROUP"});
          	/*let salesRoyaltyAmount = result.getValue({
              name: "formulacurrency",
              summary: "GROUP"});*/
           	//let subsidiary = result.getText({
            //  name: "cseg_fran_store_num_filterby_subsidiary",
            //  summary: "GROUP"
            //});
          let subsidiary = result.getText({
            name: "custrecord_fran_collecting_subsidiary",
            join: "CUSTRECORD_FRAN_FA_SN",
            summary: "GROUP"
          });
          let subsidiaryId = result.getText({
            name: "custrecord_fran_collecting_subsidiary_id",
            join: "CUSTRECORD_FRAN_FA_SN",
            summary: "GROUP"
          });
            let salesId = result.getValue({
              name: "internalid",
              summary: "GROUP"
            });
          	let agreementId = result.getValue({
              	name: "internalid",
                join: "custrecord_fran_fa_sn",
                summary: "GROUP"
            });
          	let franchiseSalesId = result.getValue({
              	name: "formulanumeric",
                summary: "SUM"
            });
            sublist.setSublistValue({
                id: 'sd_franchisee',
                line: counter,
                value: franchiseeID
            });
			sublist.setSublistValue({
                id: 'sd_franchisee_id',
                line: counter,
                value: franchiseeInternalId
            });

            sublist.setSublistValue({
                id: 'sd_id',
                line: counter,
                value: salesId
            });

            /*
            sublist.setSublistValue({
                id: 'sd_date',
                line: counter,
                value: salesDate
            });
            */
            sublist.setSublistValue({
                id: 'sd_storenumber',
                line: counter,
                value: storeNumber
            });
          	/*if(salesMemo){
          	sublist.setSublistValue({
                id: 'sd_memo',
                line: counter,
                value: salesMemo
            });
            }*/
          	sublist.setSublistValue({
                id: 'sd_item',
                line: counter,
                value: salesItem
            });
          	if(billableSales){
          	sublist.setSublistValue({
                id: 'sd_quantity',
                line: counter,
                value: billableSales
            });
            }
			      sublist.setSublistValue({
                id: 'sd_rate',
                line: counter,
                value: salesRate
            });
          /*
          	if(salesRoyaltyAmount){
          sublist.setSublistValue({
              id:'sd_royalty_amount',
              line: counter,
              value: salesRoyaltyAmount
            });
            }*/
          	sublist.setSublistValue({
                id: 'sd_rate_type',
                line: counter,
                value: salesRateType
            });
          	sublist.setSublistValue({
              id:'sd_subsidiary',
              line: counter,
              value: subsidiary
            });
            sublist.setSublistValue({
                id:'sd_subsidiary_id',
                line: counter,
                value: subsidiaryId
            });
          if(salesAccount){
          	sublist.setSublistValue({
                id: 'sd_account',
                line: counter,
                value: salesAccount
            });
          }
            if(salesBrand){
                sublist.setSublistValue({
                    id: 'sd_brand',
                    line: counter,
                    value: salesBrand
                });
            }
            if(agreementId){
                sublist.setSublistValue({
                    id: 'sd_fs_agreement_id',
                    line: counter,
                    value:agreementId
                });
            }
            if(franchiseSalesId){
                sublist.setSublistValue({
                    id: 'sd_fs_id',
                    line: counter,
                    value: franchiseSalesId
                });
            }
            counter++;

            return true;
        });

        response.writePage(form);

    } catch (error) {
        log.error(stLogTitle, error.toString());
    }
};
		//Defines the Suitelet script trigger point
        const onRequest = (context) => {
            let stLogTitle = 'onRequest';
            try {
                let request = context.request;
                log.debug(stLogTitle, '-----START-----');
                if (request.method === 'GET') {
                  
                    // Create & initialize the form
                    page_initial(context);

                } else if (request.method === 'POST') {
                    let parameters = context.request.parameters;
                    log.debug('POST/ Parameters', parameters);
                   
                    let invoiceDate = parameters.invoicedatefield;
                    log.debug('invoiceDate in POST', invoiceDate);
                    let endDate = parameters.enddatefield;
                    let startDate = parameters.startdatefield;

                    let lineCount = request.getLineCount({
                        group: 'sales_list'
                    });

                    let arrSalesDataToAdd = [];
                    for (let i = 0; i < lineCount; i++) {
                        log.debug('In Loop - line i', i);
                        let isMarked = request.getSublistValue({
                            group: 'sales_list',
                            name: 'sd_select',
                            line: i
                        });
                        log.debug('In Loop - isMarked', isMarked);

                        if (isMarked === 'T') {
                            log.debug('In Loop - in isMarked if');
                            let recId = request.getSublistValue({
                                group: 'sales_list',
                                name: 'sd_id',
                                line: i
                            });
                          let fsAgreementId = request.getSublistValue({
                                group: 'sales_list',
                                name: 'sd_fs_agreement_id',
                                line: i
                            });
                           let fsSalesId = request.getSublistValue({
                                group: 'sales_list',
                                name: 'sd_fs_id',
                                line: i
                            });
                          /*let fsBillableSales = request.getSublistValue({
                                group: 'sales_list',
                                name: 'sd_quantity',
                                line: i
                            });*/
                         let salesKey = recId +'|'+ fsAgreementId +'|'+ fsSalesId + '|'+ startDate+'|'+ endDate;
                         //  let salesKey = {
                         //    'recId':recId,
                         //    'fsAgreementId':fsAgreementId,
                         //    'fsSalesId':fsSalesId,
                         //    'startdate':,
                         //    'endDate':endDate} ;
                            arrSalesDataToAdd.push(salesKey);
                        }
                    }
                    log.debug('POST/ salesdata:', arrSalesDataToAdd.length);
					//Pull internal id of franchisee id 
                  

                  	
                  let cacheKey = Math.floor(Math.random() * 1000000);
                 	log.debug('Try cacheKey',cacheKey);
                  
                    let SalesDataToAdd = {
                      'arrSalesDataToAdd': arrSalesDataToAdd
                    };
					//Establishing data structure in cache
                    const cacheObject = cache.getCache({
                        name: 'salesDataCacheData',
                        scope: cache.Scope.PUBLIC
                    });
                  //Assigning variable to cache
                    cacheObject.put({
                        key: cacheKey,
                        value: SalesDataToAdd
                    });

                    // Call map/reduce script to create Invoice
                  	//Reference Cache by key
                    if (arrSalesDataToAdd.length > 0) {
                        let taskId1 = callMapReduce(cacheKey, invoiceDate,SalesDataToAdd);
                        log.debug('POST','map/reduce script triggered: ' + taskId1);
                    }

                  redirect.toTaskLink({
                    id : 'LIST_TRAN_CUSTINVC'
                  });
                }

            } catch (error) {
                log.error(stLogTitle, error.toString());
                throw error;
            }
        };

        return {onRequest};
    });