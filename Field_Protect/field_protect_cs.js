/**
 * Module Description
 * 
 * Version 1.0    Author Evan Lausier           Remarks
 *
 */
//
/**
 * The recordType (internal id) corresponds to the "Applied To" record in your script deployment. 
 * 
 * @appliedtorecord recordType
 * 
 * @param {String} type Operation types: create, edit
 *                      
 * @returns {Void}
 */

//Client Script, Post Sourcing:
function postSource(type, name){
  var role = nlapiGetRole();
  
 if (role != '3'){
   nlapiDisableLineItemField('expense', 'amount', true);
   nlapiDisableLineItemField('expense', 'category', true);
   nlapiDisableLineItemField('expense', 'account_display', true);
   nlapiDisableLineItemField('expense', 'department', true);
   nlapiDisableLineItemField('expense', 'memo', true);
   nlapiDisableLineItemField('expense', 'custcol_cseg_bb_profitcent', true);
   nlapiDisableLineItemField('expense', 'custcol_cseg_bb_risk_loc', true);
   nlapiDisableLineItemField('expense', 'custcol_bb_underwriting_year', true);
   nlapiDisableField('usertotal', true);
   nlapiDisableField('customform', true);
   nlapiDisableField('transactionnumber', true);
   nlapiDisableField('tranid', true);
   nlapiDisableField('entity', true);
   nlapiDisableField('account', true);
   nlapiDisableField('usertotal', true);
   nlapiDisableField('currency', true);
   nlapiDisableField('exchangerate', true);
   nlapiDisableField('paymenthold', true);
   nlapiDisableField('duedate', true);
   nlapiDisableField('trandate', true);
   nlapiDisableField('custbody_bb_invoice_date', true);
   nlapiDisableField('postingperiod', true);
   nlapiDisableField('memo', true);
   nlapiDisableField('approvalstatus', true);
   nlapiDisableField('custbody_bb_concur_po', true);
   nlapiDisableField('custbody_bb_concur_invoice', true);
   nlapiDisableField('custbody_vendor_category', true);
   nlapiDisableField('custbody_bb_billpay_method', true);
   nlapiDisableField('custbody_bb_vb_comments', true);
 }
}

//Client Script, Validate Line:
function clientValidateLine(type){
var role = nlapiGetRole();
  
 if (role != '3'){
   nlapiDisableLineItemField('expense', 'amount', true);
   nlapiDisableLineItemField('expense', 'category', true);
   nlapiDisableLineItemField('expense', 'account_display', true);
   nlapiDisableLineItemField('expense', 'department', true);
   nlapiDisableLineItemField('expense', 'memo', true);
   nlapiDisableLineItemField('expense', 'custcol_cseg_bb_profitcent', true);
   nlapiDisableLineItemField('expense', 'custcol_cseg_bb_risk_loc', true);
   nlapiDisableLineItemField('expense', 'custcol_bb_underwriting_year', true);
   nlapiDisableField('usertotal', true);
   nlapiDisableField('customform', true);
   nlapiDisableField('transactionnumber', true);
   nlapiDisableField('tranid', true);
   nlapiDisableField('entity', true);
   nlapiDisableField('account', true);
   nlapiDisableField('usertotal', true);
   nlapiDisableField('currency', true);
   nlapiDisableField('exchangerate', true);
   nlapiDisableField('paymenthold', true);
   nlapiDisableField('duedate', true);
   nlapiDisableField('trandate', true);
   nlapiDisableField('custbody_bb_invoice_date', true);
   nlapiDisableField('postingperiod', true);
   nlapiDisableField('memo', true);
   nlapiDisableField('approvalstatus', true);
   nlapiDisableField('custbody_bb_concur_po', true);
   nlapiDisableField('custbody_bb_concur_invoice', true);
   nlapiDisableField('custbody_vendor_category', true);
   nlapiDisableField('custbody_bb_billpay_method', true);
   nlapiDisableField('custbody_bb_vb_comments', true);
 return true;
}
}

//Client Script, LineInit:
function clientLineInit(type){
var role = nlapiGetRole();
  
 if (role != '3'){
   nlapiDisableLineItemField('expense', 'amount', true);
   nlapiDisableLineItemField('expense', 'category', true);
   nlapiDisableLineItemField('expense', 'account_display', true);
   nlapiDisableLineItemField('expense', 'department', true);
   nlapiDisableLineItemField('expense', 'memo', true);
   nlapiDisableLineItemField('expense', 'custcol_cseg_bb_profitcent', true);
   nlapiDisableLineItemField('expense', 'custcol_cseg_bb_risk_loc', true);
   nlapiDisableLineItemField('expense', 'custcol_bb_underwriting_year', true);
   nlapiDisableField('usertotal', true);
   nlapiDisableField('customform', true);
   nlapiDisableField('transactionnumber', true);
   nlapiDisableField('tranid', true);
   nlapiDisableField('entity', true);
   nlapiDisableField('account', true);
   nlapiDisableField('usertotal', true);
   nlapiDisableField('currency', true);
   nlapiDisableField('exchangerate', true);
   nlapiDisableField('paymenthold', true);
   nlapiDisableField('duedate', true);
   nlapiDisableField('trandate', true);
   nlapiDisableField('custbody_bb_invoice_date', true);
   nlapiDisableField('postingperiod', true);
   nlapiDisableField('memo', true);
   nlapiDisableField('approvalstatus', true);
   nlapiDisableField('custbody_bb_concur_po', true);
   nlapiDisableField('custbody_bb_concur_invoice', true);
   nlapiDisableField('custbody_vendor_category', true);
   nlapiDisableField('custbody_bb_billpay_method', true);
   nlapiDisableField('custbody_bb_vb_comments', true);
}
}
