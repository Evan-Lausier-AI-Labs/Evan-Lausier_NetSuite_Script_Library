/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 *
 * Create franchise royalty invoices from sales data
 */
define(['N/search', 'N/record', 'N/runtime', 'N/email', 'N/format', 'N/cache'],
    (search, record, runtime, email, format, cache) => {
    var procBool = true;
    const isEmpty = (stValue) => {
        return ((stValue === 'none' || stValue === '' || stValue == null || stValue == undefined) || (stValue.constructor === Array && stValue.length == 0) ||
            (stValue.constructor === Object && (function (v) {
                    for (let k in v)
                        return false;
                    return true;
                })(stValue)));
    };
    var errReasonArr = [];
    var failed_records = [];
    var franchiseeFeeSearch = [];
    const getInputData = () => {

        let stLogTitle = 'getInputData';
        log.debug(stLogTitle, '- Start getInputData -');
        try {
            var ssId = runtime.getCurrentScript().getParameter({
                name: "custscript_sales_data_search_1_5"
            });
            if (ssId) {
                log.debug('ssId', ssId);
                franchiseeFeeSearch = search.load({
                    id: ssId
                });
                log.debug('franchiseeFeeSearch', franchiseeFeeSearch);

                let cacheKey = runtime.getCurrentScript().getParameter('custscript_cache_key_1_5');

                if (!isEmpty(cacheKey)) {
                    const cacheObject = cache.getCache({
                        name: 'salesDataCacheData',
                        scope: cache.Scope.PUBLIC
                    });

                    const cacheData = cacheObject.get({
                        key: cacheKey
                    });
                    log.debug(stLogTitle, 'cacheData: ' + cacheData);
                    log.debug(stLogTitle + ' cacheKey: ', cacheKey);
                    let jsonData = JSON.parse(cacheData);
                    log.debug(stLogTitle + ' jsonData: ', jsonData);

                    if (!isEmpty(jsonData) && !isEmpty(jsonData.arrSalesDataToAdd)) {
                        let filters = [];
                        jsonData.arrSalesDataToAdd.forEach((salesKey, index) => {
                            log.debug(stLogTitle + ' salesKey: ', salesKey);
                            let arrIDs = salesKey.split('|');
                            let recId = arrIDs[0];
                            let fsAgreementId = arrIDs[1];
                            let fsSalesId = arrIDs[2];
                            let startDate = arrIDs[3];
                            let endDate = arrIDs[4];
                            if (index == 0) {
                                filters.push([
                                        ["internalid", "anyof", recId], "AND",
                                        ["custrecord_fran_fa_sn.internalid", "anyof", fsAgreementId], "AND",
                                        ["formulanumeric", "anyof", fsSalesId], "AND",
                                        ["custrecord_fran_fs_store_number.custrecord_fran_fs_sales_date", "onorafter", startDate], "AND",
                                        ["custrecord_fran_fs_store_number.custrecord_fran_fs_sales_date", "onorbefore", endDate]
                                    ]);
                            } else {
                                filters.push("OR", [
                                        ["internalid", "anyof", recId], "AND",
                                        ["custrecord_fran_fa_sn.internalid", "anyof", fsAgreementId], "AND",
                                        ["formulanumeric", "anyof", fsSalesId], "AND",
                                        ["custrecord_fran_fs_store_number.custrecord_fran_fs_sales_date", "onorafter", startDate], "AND",
                                        ["custrecord_fran_fs_store_number.custrecord_fran_fs_sales_date", "onorbefore", endDate]
                                    ]);
                            }
                        });
                        let filters2 = [];
                        log.debug('filters', filters);
                        filters2.push("AND", filters);
                        franchiseeFeeSearch.filterExpression = franchiseeFeeSearch.filterExpression.concat(filters2);
                        log.debug('filter expression', franchiseeFeeSearch.filterExpression);
                        var results = sresults(franchiseeFeeSearch);
                        log.debug('filter results', results);
                    }

                }
                return franchiseeFeeSearch;
            } else {
                log.error(stLogTitle + ' No search defined on deployment.');
            }
        } catch (e) {
            log.error(stLogTitle + ' Unexpected error:', e.toString());
        } finally {
            log.debug(stLogTitle, '- End getInputData -');
        }
    };

    const map = (context) => {
        let stLogTitle = 'map';
        log.debug(stLogTitle, '---START---');
        try {
            let resultObj = JSON.parse(context.value);
            log.debug(stLogTitle, resultObj);
            let custForm = resultObj.values["GROUP(custrecord_fran_fa_invoice_form_id.CUSTRECORD_FRAN_FA_SN)"];
            let franchiseeID = resultObj.values["GROUP(custrecord_fran_fs_franchise_customer.CUSTRECORD_FRAN_FS_STORE_NUMBER)"].value;
            let storeNum = resultObj.values["GROUP(custrecord_fran_fs_store_number.CUSTRECORD_FRAN_FS_STORE_NUMBER)"].value;
            let brand = resultObj.values["GROUP(custrecord_fran_fs_sl_filter_1.CUSTRECORD_FRAN_FS_STORE_NUMBER)"].value;
            let account = resultObj.values["GROUP(custrecord_fran_fa_ar.CUSTRECORD_FRAN_FA_SN)"].value;
            let subsidiary = resultObj.values["GROUP(custrecord_fran_collecting_subsidiary_id.CUSTRECORD_FRAN_FA_SN)"];
            let itemID = resultObj.values["GROUP(custrecord_fran_fa_item.CUSTRECORD_FRAN_FA_SN)"].value;
            let rate = resultObj.values["GROUP(custrecord_fran_fa_rate.CUSTRECORD_FRAN_FA_SN)"];
            let rateType = resultObj.values["GROUP(custrecord_fran_fa_rate_type.CUSTRECORD_FRAN_FA_SN)"].value;
            let billableSales = resultObj.values["SUM(custrecord_fran_fs_billable_sales.CUSTRECORD_FRAN_FS_STORE_NUMBER)"];
            let agreementId = resultObj.values["GROUP(internalid.CUSTRECORD_FRAN_FA_SN)"];
            let valueDict = {
                'custForm': custForm,
                'franchiseeID': franchiseeID,
                'storeNum': storeNum,
                'brand': brand,
                'account': account,
                'subsidiary': subsidiary,
                'itemID': itemID,
                'rate': rate,
                'rateType': rateType,
                'billableSales': billableSales,
                'agreementId': agreementId
            }
            let keyPass = franchiseeID + storeNum + account + subsidiary;
            log.debug('keyPass', keyPass);
            context.write(keyPass, valueDict);

        } catch (e) {
            log.error(stLogTitle + ' Unexpected error:', e);
        } finally {
            log.debug(stLogTitle, '---END---');
        }
    };

    const reduce = (context) => {
        let stLogTitle = 'reduce';
        var fail = 0;
        var failed_franchisee = [];
        var objResult = {};
        let key = '';

        try {
            log.debug(stLogTitle, '---START---');
            log.debug(stLogTitle, context);
            let resultArr = context.values;
            log.debug(stLogTitle, 'resultArr length: ' + resultArr.length);

            if (!isEmpty(resultArr) && resultArr.length > 0) {
                const resultObj0 = JSON.parse(resultArr[0]);
                log.debug('fsStoreNumber', resultObj0);
                let custForm = resultObj0.custForm;
                let franchiseeID = resultObj0.franchiseeID;
                let storeNum = resultObj0.storeNum;
                let brand = resultObj0.brand;
                let account = resultObj0.account;
                let subsidiary = resultObj0.subsidiary;
                let invoiceRecord = record.create({
                    type: "invoice",
                    isDynamic: true
                });
                log.debug('test invoice creation');
                invoiceRecord.setValue({
                    fieldId: "customform",
                    value: custForm,
                });
                invoiceRecord.setValue({
                    fieldId: "entity",
                    value: franchiseeID,
                });
                invoiceRecord.setValue({
                    fieldId: 'subsidiary',
                    value: subsidiary
                });
                invoiceRecord.setValue({
                    fieldId: "cseg_fran_store_num",
                    value: storeNum
                });
                invoiceRecord.setValue({
                    fieldId: "custbody_fran_inv_store_number",
                    value: storeNum
                });
                invoiceRecord.setValue({
                    fieldId: "cseg_fran_filter_1",
                    value: brand
                });
                invoiceRecord.setValue({
                    fieldId: "account",
                    value: account,
                });

                let invoiceDate = runtime.getCurrentScript().getParameter('custscript_sl_invoice_date_1_5');
                invoiceDate = format.parse({
                    value: invoiceDate,
                    type: format.Type.DATE
                });

                if (!isEmpty(invoiceDate)) {
                    invoiceRecord.setValue({
                        fieldId: 'trandate',
                        value: new Date(invoiceDate)
                    });
                }
                invoiceRecord.setValue({
                    fieldId: "trandate",
                    value: invoiceDate,
                });
                for (var i = 0; i < resultArr.length; i++) {

                    let result = JSON.parse(resultArr[i]);
                    let itemID = result.itemID;
                    let rate = result.rate;
                    let rateType = result.rateType;
                    let billableSales = result.billableSales;
                    let itemLine = invoiceRecord.selectNewLine({
                        sublistId: "item"
                    });
                    invoiceRecord.setCurrentSublistValue({
                        sublistId: 'item',
                        fieldId: 'item',
                        value: itemID
                    });
                    invoiceRecord.setCurrentSublistValue({
                        sublistId: "item",
                        fieldId: "rate",
                        value: rate
                    });
                    if (rateType == 1) {
                        invoiceRecord.setCurrentSublistValue({
                            sublistId: "item",
                            fieldId: "quantity",
                            value: 1
                        });
                    }
                    if (rateType == 2) {
                        invoiceRecord.setCurrentSublistValue({
                            sublistId: "item",
                            fieldId: "quantity",
                            value: billableSales
                        });
                    }
                    invoiceRecord.commitLine({
                        sublistId: "item"
                    });
                    log.debug('Created item line', itemLine);
                }

                let invoiceID = invoiceRecord.save({
                    enableSourcing: true,
                    ignoreMandatoryFields: true
                });
                if (procBool) {
                    let cacheKey = runtime.getCurrentScript().getParameter('custscript_cache_key_1_5');
                    if (!isEmpty(cacheKey)) {
                        const cacheObject = cache.getCache({
                            name: 'salesDataCacheData',
                            scope: cache.Scope.PUBLIC
                        });

                        const cacheData = cacheObject.get({
                            key: cacheKey
                        });
                        let jsonData = JSON.parse(cacheData);
                        let arrIDs = "";
                        let recId = "";
                        let fsAgreementId = "";
                        let fsSalesId = "";
                        var startDate = "";
                        var endDate = "";
                        if (!isEmpty(jsonData) && !isEmpty(jsonData.arrSalesDataToAdd)) {
                            let filters = [];
                            jsonData.arrSalesDataToAdd.forEach((salesKey, index) => {
                                arrIDs = salesKey.split('|');
                                recId = arrIDs[0];
                                fsAgreementId = arrIDs[1];
                                fsSalesId = arrIDs[2];
                                startDate = arrIDs[3];
                                endDate = arrIDs[4];
                            });
                        }
                    }
                    var customrecord_fran_franchise_salesSearchObj = search.create({
                        type: "customrecord_fran_franchise_sales",
                        filters:
                        [
                            ["custrecord_fran_fs_sales_date", "within", startDate, endDate],
                            "AND",
                            ["custrecord_fran_fs_processed", "is", "F"],
                            "AND",
                            ["custrecord_fran_fs_sl_filter_1", "anyof", brand],
                            "AND",
                            ["custrecord_fran_fs_store_number", "anyof", storeNum],
                            "AND",
                            ["custrecord_fran_fs_franchise_customer", "anyof", franchiseeID]
                        ],
                        columns:
                        [
                            search.createColumn({
                                name: "internalid",
                                label: "Internal ID"
                            })
                        ]
                    });
                    var searchResultCount = customrecord_fran_franchise_salesSearchObj.runPaged().count;
                    log.debug("customrecord_fran_franchise_salesSearchObj result count", searchResultCount);
                    customrecord_fran_franchise_salesSearchObj.run().each(function (result) {
                        let franId = result.id;
                        log.debug("fran sales id", franId);
                        let franRec = record.load({
                            type: "customrecord_fran_franchise_sales",
                            id: franId
                        });
                        franRec.setValue('custrecord_fran_fs_processed', true);
                        franRec.save();
                        log.debug("processed to true");
                        return true;
                    });
                }
                log.debug("invoice created", invoiceID);
            }
        } catch (e) {
            log.error(stLogTitle + ' Unexpected error:', e);
            var errorMsgs = e.name + ': ' + e.message;
            log.error(errorMsgs);
            procBool = false;
            let cacheKey = runtime.getCurrentScript().getParameter('custscript_cache_key_1_5');
            if (!isEmpty(cacheKey)) {
                const cacheObject = cache.getCache({
                    name: 'salesDataCacheData',
                    scope: cache.Scope.PUBLIC
                });

                const cacheData = cacheObject.get({
                    key: cacheKey
                });
                let jsonData = JSON.parse(cacheData);
                let arrIDs = "";
                let recId = "";
                let fsAgreementId = "";
                let fsSalesId = "";
                var startDate = "";
                var endDate = "";
                if (!isEmpty(jsonData) && !isEmpty(jsonData.arrSalesDataToAdd)) {
                    let filters = [];
                    jsonData.arrSalesDataToAdd.forEach((salesKey, index) => {
                        arrIDs = salesKey.split('|');
                        recId = arrIDs[0];
                        fsAgreementId = arrIDs[1];
                        fsSalesId = arrIDs[2];
                        startDate = arrIDs[3];
                        endDate = arrIDs[4];
                    });
                }
            }
            var customrecord_fran_franchise_salesSearchObj = search.create({
                type: "customrecord_fran_franchise_sales",
                filters:
                [
                    ["custrecord_fran_fs_sales_date", "within", startDate, endDate],
                    "AND",
                    ["custrecord_fran_fs_processed", "is", "F"],
                    "AND",
                    ["custrecord_fran_fs_sl_filter_1", "anyof", brand],
                    "AND",
                    ["custrecord_fran_fs_store_number", "anyof", storeNum],
                    "AND",
                    ["custrecord_fran_fs_franchise_customer", "anyof", franchiseeID]
                ],
                columns:
                [
                    search.createColumn({
                        name: "internalid",
                        label: "Internal ID"
                    })
                ]
            });
            var searchResultCount = customrecord_fran_franchise_salesSearchObj.runPaged().count;
            log.debug("customrecord_fran_franchise_salesSearchObj result count", searchResultCount);
            customrecord_fran_franchise_salesSearchObj.run().each(function (result) {
                let franId = result.id;
                let memoMess = "At least one invoice failed to be created due to the following error: " + errorMsgs
                    let franRec = record.load({
                        type: "customrecord_fran_franchise_sales",
                        id: franId
                    });
                franRec.setValue('custrecord_fran_fs_processed', false);
                franRec.setValue('custrecord_fran_fs_inv_create_log', memoMess);
                franRec.save();
                log.debug("error logged")
                return true;
            });
            context.write({
                key: context.key,
                value: {
                    error: errorMsgs
                }
            });
            log.debug('wrote');

        } finally {
            log.debug(stLogTitle, '---END---');
        }
    };

    const summarize = (context) => {
        let stLogTitle = 'summary';
        try {
            log.debug('send emails');

            context.output.iterator().each(function (key, value) {
                var values;
                var err;
                var failedIF = key;
                failedRecords(failedIF);
                values = JSON.parse(value);
                log.debug('values', values);
                err = values.error;
                errorReason(err);
                log.debug('err', err);

                return false;
            });
            log.debug('look at failed import record array length', failed_records.length);
            log.debug('look at import record error array', errReasonArr);

            if (failed_records.length !== 0) {
                var author = runtime.getCurrentScript().getParameter({
                    name: 'custscript_sum_email_from_1_5'
                });
                var subject = runtime.getCurrentScript().getParameter({
                    name: 'custscript_sum_email_subj_1_5'
                });
                var curDate = new Date();
                var dd = String(curDate.getDate()).padStart(2, '0');
                var mm = String(curDate.getMonth() + 1).padStart(2, '0');
                var yyyy = curDate.getFullYear();
                curDate = mm + '/' + dd + '/' + yyyy;
                var date = curDate.toString();
                subject = subject + " " + date;
                var sendToEmail = runtime.getCurrentScript().getParameter({
                    name: 'custscript_sum_email_to_1_5'
                });
                var body = '<br/>';
                log.debug('constructing body');
                if (failed_records.length !== 0) {
                    body += 'The following ' + failed_records.length + ' franchise record(s) ' +
                    'have failed to create Invoice record. Please see the details below:';

                    body += '<br/><table border="1" width="80%" borderCollapse="collapse" style="font-size:12px;">';
                    body += '<tr>';
                    body += '<td><b>#</b></td>';
                    body += '<td><b>Date</b></td>';
                    body += '<td><b>Error Message</b></td>';
                    body += '</tr>';

                    var count = 1;
                    for (var i = 0; i < failed_records.length; i++) {
                        body += '<tr>';
                        body += '<td>' + count++ + '</td>';
                        body += '<td>' + curDate + '</td>';
                        body += '<td>' + errReasonArr[i] + '</td>';
                        body += '</tr>';
                    }
                }
                log.debug('before sending mail', body);

                email.send({
                    author: author,
                    recipients: sendToEmail,
                    subject: subject,
                    body: body
                });
            }

        } catch (e) {
            log.error(stLogTitle + ' Unexpected error:', e.toString());
        } finally {
            log.debug(stLogTitle, '---END---');

        }
    };
    function failedRecords(pco) {
        failed_records.push(pco);
    }

    function errorReason(err) {
        errReasonArr.push(err);
    }
    function sresults(searchObj) {
        var results_array = [];
        var page = searchObj.runPaged({
            pageSize: 4000
        });
        for (var i = 0; i < page.pageRanges.length; i++) {
            var pageRange = page.fetch({
                index: page.pageRanges[i].index
            });
            results_array = results_array.concat(pageRange.data);
        }
        return results_array;
    }

    return {
        getInputData: getInputData,
        map: map,
        reduce: reduce,
        summarize: summarize
    };
});
