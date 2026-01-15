/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 *
 * Handles client-side events for Create Invoice Suitelet
 *
 * @copyright 2022 Oracle
 * 
 *
 */

 define(['N/currentRecord', 'N/runtime', 'N/log', 'N/ui/dialog', 'N/url', 'N/error', 'N/format','N/search'],
    (currentRecord, runtime, log, dialog, url, error, format,search) => {
        const pageInit = (context) => {
            if (context.mode !== 'create') {
                return;
            }
        };

        const handleCancelBtn = (recordId) => {
         	let redirect = url.resolveTaskLink({
            	id: 'CARD_-29' ,
			});
          
            window.location.replace(redirect);
        };
        const handleResetBtn = (recordId) => {
         	let redirect = url.resolveTaskLink({
            	id: 'EDIT_SCRIPTLET_510_1' ,
			});
            window.location.replace(redirect);
        };
         

        const fieldChanged = (context) => {
          console.log('new context',context);
            const url = window.location;
            const urlParams = new URLSearchParams(url.search);

            if (context.fieldId === 'startdatefield') {
                let startDate = context.currentRecord.getText({fieldId: 'startdatefield'});
                let startDateStr = '';
              if (startDate){
                let startDateObj = new Date(startDate);
                //startDateStr = startDateObj.toISOString().substring(0, 10);}
                startDateStr = startDateObj.toISOString();}
                /*let confirmed = confirm("This page will reload and update the invoice create criteria for Start Date = " + startDate + "\n\nOK to proceed?");*/

               // if (confirmed) {
                    urlParams.set('start_date', startDateStr);
                    window.onbeforeunload = null;
                    url.search = urlParams.toString();
               // }
            }
            else if (context.fieldId === 'enddatefield') {
                let endDate = context.currentRecord.getText({fieldId: 'enddatefield'});
              let endDateStr = '';
              if (endDate){
                let endDateObj = new Date(endDate);
                //endDateStr = endDateObj.toISOString().substring(0, 10);}
                endDateStr = endDateObj.toISOString();}

                /*let confirmed = confirm("This page will reload and update the invoice create criteria for End Date = " + endDate + "\n\nOK to proceed?");*/

                //if (confirmed) {
                    urlParams.set('end_date', endDateStr);
                    window.onbeforeunload = null;
                    url.search = urlParams.toString();
                //}
            }
            else if (context.fieldId === 'brandtypefield') {
                let brandVal = context.currentRecord.getValue({fieldId: 'brandtypefield'});
                urlParams.set('Brand', brandVal );
                window.onbeforeunload = null;
                url.search = urlParams.toString();
            }
            else if (context.fieldId === 'recordtypefield') {
                let recTypeVal = context.currentRecord.getValue({fieldId: 'recordtypefield'});
                urlParams.set('record_type', recTypeVal );
                window.onbeforeunload = null;
                url.search = urlParams.toString();
            }
            else if (context.fieldId === 'storenumberfield') {
                let storeNumberVal = context.currentRecord.getValue({fieldId: 'storenumberfield'});
                urlParams.set('storeNumberVal', storeNumberVal );
                window.onbeforeunload = null;
                url.search = urlParams.toString();
            }
           else if (context.fieldId === 'franchiseeidfield') {
                let franchiseeVal = context.currentRecord.getValue({fieldId: 'franchiseeidfield'});
                urlParams.set('Franchisee', franchiseeVal );
                window.onbeforeunload = null;
                url.search = urlParams.toString();
            }
 			else if (context.fieldId === 'royaltybillingfield') {  //royaltyBillingField
                let royaltyBillingVal = context.currentRecord.getValue({fieldId: 'royaltybillingfield'});
                urlParams.set('royaltyBilling', royaltyBillingVal );
                window.onbeforeunload = null;
                url.search = urlParams.toString();
                //comment everything below out for R+H, keep for WOB
            }
       // else if(context.fieldId === 'accountingperiodfield'){
       //          var accPeriod = context.currentRecord.getValue({fieldId: 'accountingperiodfield'});
       //          var dateSearch = search.lookupFields({
       //            type: 'accountingperiod',
       //            id: accPeriod,
       //            columns: ['startdate','enddate']
       //          });
       //          console.log(dateSearch);
       //          var sDate = new Date(dateSearch['startdate']);
       //          var eDate = new Date(dateSearch['enddate']);
       //          console.log(sDate);
       //          console.log(eDate);
       //          context.currentRecord.setValue({
       //            fieldId: 'startdatefield',
       //            value: sDate,
       //            ignoreFieldChange: true
       //          });
       //          context.currentRecord.setValue({
       //            fieldId:'enddatefield',
       //            value: eDate,
       //            ignoreFieldChange: true
       //          });
       //          urlParams.set('start_date', sDate.toISOString());
       //          urlParams.set('end_date', eDate.toISOString());
       //          window.onbeforeunload = null;
       //          url.search = urlParams.toString();
       //      }
        };
		const saveRecord = (context) => {
           let currentRecord = context.currentRecord;
           let lineCount = currentRecord.getLineCount({
                    sublistId: 'sales_list'
                });
                let arrSalesDataToAdd = [];
          	console.log('Inside of sales array');
          console.log('check linecount', lineCount);
                for (let i = 0; i < lineCount; i++) {
                    let isMarked = currentRecord.getSublistValue({
                        sublistId: 'sales_list',
                        fieldId: 'sd_select',
                        line: i
                    });
                    if (isMarked) {
                        arrSalesDataToAdd.push(i);
                    }
                   console.log('isMarked', isMarked);
                }
          console.log('arrSalesDataToAdd.length', arrSalesDataToAdd);
          	if(arrSalesDataToAdd.length == 0){
              /*throw error.create({
                    name: 'MISSING_SALES_DATA',
                    message: 'Please select one or more lines of sales data to create an invoice.'
                });*/
            alert('Please select one or more lines of sales data to create an invoice.');
            return false;
            }
            return true;
        }
   
        return {
            pageInit: pageInit,
            handleCancelBtn: handleCancelBtn,
            handleResetBtn: handleResetBtn,
           // handleSearchBtn: handleSearchBtn,
            fieldChanged:fieldChanged,
         	saveRecord: saveRecord
        };
    });
