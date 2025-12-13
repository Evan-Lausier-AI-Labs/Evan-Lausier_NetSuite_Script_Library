/**
 * Suitelet to trigger workflow actions on Journal entries
 * @param {Object} request - The request object
 * @param {Object} response - The response object
 */
function mySuitelet(request, response) {
    var wfInstance = nlapiTriggerWorkflow('journal', request.getParameter('soid'), 143, 'workflowaction_approve');
    nlapiSetRedirectURL('RECORD', 'journal', request.getParameter('soid'));
}
