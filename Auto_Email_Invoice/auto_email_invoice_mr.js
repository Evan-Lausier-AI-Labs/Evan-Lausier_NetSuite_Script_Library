// Requires custom fields "INVOICE EMAIL SENT?", ", "INVOICE EMAIL ERROR?"", "INVOICE EMAIL SENT ERROR MESSAGE"
//custentity_apm_email_addr_inv_attach.customer
//"email.customer"
//
/**
 * @NApiVersion 2.x
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 */
define(['N/email', 'N/file', 'N/record', 'N/render', 'N/runtime', 'N/search', 'N/transaction'],
    /**
     * @param{email} email
     * @param{file} file
     * @param{record} record
     * @param{render} render
     * @param{runtime} runtime
     * @param{search} search
     * @param{transaction} transaction
     */
    function(email, file, record, render, runtime, search, transaction) {

        var LOG_START = ' ****** START ***** ';
        var LOG_END = ' &&&&& END &&&&& ';

        var currentScript = runtime.getCurrentScript();
        var author = currentScript.getParameter({
            name: 'custscript_apm_email_author'
        });

        var emailTemplate = currentScript.getParameter({
            name: 'custscript_apm_email_template'
        });

        function getInputData() {
            var stLogTitle = 'Get Input Data function';
            try {
                log.debug(stLogTitle, stLogTitle + LOG_START);
                var searchToLoad = currentScript.getParameter({
                    name: 'custscript_apm_inv_search'
                });
                return search.load(searchToLoad);
            } catch(e){
                log.error(stLogTitle, e.name + ': ' + e.message);
            }
        }

        function map(context) {
            var stLogTitle = 'Map function'
            try {
                var searchResults = JSON.parse(context.value);
                log.debug(stLogTitle,'searchResults: ' +JSON.stringify(searchResults));

                var transId = searchResults.id;
                log.debug(stLogTitle, 'transId: ' +transId);

                var emails=[];

                var customerEmail = searchResults.values["email.customer"];
                log.debug(stLogTitle, 'customer email is: ' +customerEmail);

                if(!isEmpty(customerEmail)){
                    emails.push(customerEmail);
                }

                var otherEmails = searchResults.values["custentity_apm_email_addr_inv_attach.customer"];
                log.debug(stLogTitle, 'customer email is: ' +otherEmails);

                if(!isEmpty(otherEmails)){
                    var splitEmails = otherEmails.split(/,|;/);
                    for(var i=0;i<splitEmails.length;i++){
                        emails.push(splitEmails[i]);
                    }
                }

                log.debug(stLogTitle, 'Email Recipients are: ' +emails);

                var fileId = searchResults.values["internalid.file"].value;
                log.debug(stLogTitle, 'fileId: ' + fileId);

                var entityId = parseInt(searchResults.values.entity.value);
                log.debug(stLogTitle, 'entityId: ' + entityId);

                context.write({
                    key: transId,
                    value: {fileId: fileId, email:emails, entityId:entityId}
                });
            } catch (e){
                log.error(stLogTitle, e.name + ': ' + e.message);
                context.write({
                    key: transId,
                    error: {error: e.name + ': ' + e.message}
                });
                log.debug(stLogTitle, stLogTitle + LOG_END);
            }
        }

        function reduce(context) {
            try {
                var stLogTitle = 'Reduce function';
                var fileObj = [];
                var transId = parseInt(context.key);
                log.debug(stLogTitle, 'transId: ' +transId);

                var allAttached = true;

                for(var i=0 ; i<context.values.length;i++) {
                    var contextValues = JSON.parse(context.values[i]);
                    log.debug(stLogTitle, 'contextValues are: '+JSON.stringify(contextValues));

                    var emailId = contextValues.email;
                    log.debug(stLogTitle, 'email: ' +emailId);

                    var fileId = parseInt(contextValues.fileId);
                    log.debug(stLogTitle, 'fileId: ' +fileId);

                    var entityId = parseInt(contextValues.entityId);
                    log.debug(stLogTitle, 'entityId: ' +entityId);

                    if(!isNaN(fileId)){
                        var invAttachment = addAttachmentsEmail(fileId);
                        log.debug(stLogTitle, 'file size is: '+invAttachment.size);

                        if(invAttachment.size < 10485760){
                            fileObj.push(invAttachment);
                        } else{
                            log.error(stLogTitle, 'PDF File size is greater than 10 MB for Transaction: ' +transId);
                            allAttached = false;
                            var transRecord = updateErrorDetails(transId,true,'One of the attachments size is greater than 10 MB');
                            break;
                        }
                    } else allAttached=true;
                }

                if(allAttached && !isEmpty(emailId) && (emailId.length<=10)){
                    var transactionPDFFile = addTransactionPDF(transId);

                    if (transactionPDFFile!=null)
                        fileObj.push(transactionPDFFile);

                    log.debug(stLogTitle, 'transactionPDFFile is: '+JSON.stringify(transactionPDFFile));
                    log.debug(stLogTitle, 'final fileObj for transaction '+context.key+' is : '+JSON.stringify(fileObj));

                    var emailSize = 0;
                    for(i=0; i<fileObj.length;i++){
                        emailSize = emailSize + fileObj[i].size;
                    }
                    log.debug(stLogTitle, 'email size is: '+emailSize);

                    if(emailSize < 15728640){
                        var mergeResult = render.mergeEmail({
                            templateId: emailTemplate,
                            transactionId: parseInt(transId)
                        });

                        sendEmail(author,emailId,mergeResult.subject,mergeResult.body,fileObj,transId);
                        log.debug(stLogTitle, 'email is sent');
                        context.write({
                            key: transId
                        });
                    } else {
                        log.error(stLogTitle, 'Email size is greather than 15MB for Transaction Id: '+context.key);
                        var transRecord = updateErrorDetails(transId,true,'Total email size is greater than 15 MB');
                    }

                } else if(isEmpty(emailId)){
                    log.error(stLogTitle, 'No recipients are found to send email for this transaction: '+context.key);
                    var transRecord = updateErrorDetails(transId,true,'No recipients are found to send email for this transaction');

                } else if((emailId.length>10)){
                    log.error(stLogTitle, 'Total # of recipients are above 10 for this transaction: '+context.key);
                    var transRecord = updateErrorDetails(transId,true,'Total # of recipients are above 10 for this transaction');
                }

            }catch (e) {
                log.error(stLogTitle, e.name + ': ' + e.message);
                context.write({
                    key: context.key,
                    error: {error: e.name + ': ' + e.message}
                });
                log.debug(stLogTitle, stLogTitle + LOG_END);
            }
        }

        function summary(context){
            var stLogTitle = 'Summarize function';
            var totalRecordsProcessed = 0;

            context.output.iterator().each(function(key){
                log.debug({
                    title: ' context.output.iterator',
                    details: 'key: ' + key
                });
                totalRecordsProcessed++;

                var transRecord = record.submitFields({
                    type: record.Type.INVOICE,
                    id: key,
                    values:{
                        custbody_apm_is_email_sent: true,
                        custbody_apm_is_email_error: false,
                        custbody_apm_email_sent_error_msg: ''
                    }
                });

                log.debug(stLogTitle, stLogTitle + LOG_END);
                return true;
            });

            context.mapSummary.errors.iterator().each(function (key, error){
                var stMapError = JSON.parse(error);
                log.debug(stLogTitle, 'Reduce Summary Errors ', +JSON.stringify(stMapError));
                log.error({
                    title:  'Map error for key: ' + key,
                    details: stMapError.name + ': ' + stMapError.message
                });
                var transRecord = updateErrorDetails(key,true,stMapError.message);
            });

            context.reduceSummary.errors.iterator().each(function (key, error){
                var stReduceError = JSON.parse(error);
                log.debug(stLogTitle, 'Reduce Summary Errors ', +JSON.stringify(stReduceError));
                log.error({
                    title:  'Reduce error for key: ' + key,
                    details: stReduceError.name + ': ' + stReduceError.message
                });
                var transRecord = updateErrorDetails(key,true,stReduceError.message);
            })

            log.debug({
                title: 'Total records updated',
                details: totalRecordsProcessed
            });
        }

        return {
            getInputData: getInputData,
            map: map,
            reduce: reduce,
            summarize: summary
        };

        function addAttachmentsEmail(fileId){
            log.debug('addAttachmentsEmail','file Id:'+fileId);
            var fileObj = file.load({id: fileId});
            return fileObj;
        }

        function addTransactionPDF(transId){
            var transactionPDFFile = render.transaction({
                entityId: transId,
                printMode: render.PrintMode.PDF,
                inCustLocale: true
            });
            return transactionPDFFile;
        }

        function sendEmail(author,emailId,subject,body,file,transId){
            email.send({
                author: author,
                recipients: emailId,
                subject: subject,
                body: body,
                attachments: file,
                relatedRecords: {
                    transactionId: transId
                }
            });
        }

        function updateErrorDetails(key,isError,errorMsg){
            var transId = record.submitFields({
                type: record.Type.INVOICE,
                id: key,
                values:{
                    custbody_apm_is_email_error: isError,
                    custbody_apm_email_sent_error_msg: errorMsg
                }
            });
            return transId;
        }

        function isEmpty(value) {
            if (value === null) {
                return true;
            } else if (value === undefined) {
                return true;
            } else if (value === '') {
                return true;
            } else if (value === ' ') {
                return true;
            } else if (value === 'null') {
                return true;
            } else {
                return false;
            }
        }
    });
