/**
 *@NApiVersion 2.x
 *@NScriptType UserEventScript
 */

define(['N/http', 'N/format', 'N/search', 'N/record'],
		function(http, format, search, record) {
	
function beforeLoad (context)
{
	var skuparent = search.load({
		id: 'customsearch2_2'
	});
	var skuchild = search.load({
		id: 'customsearch3'
	});
	
	var parentfilters = skuparent.filters;
	var searchResult1 = skuparent.run().getRange({
		start: 0,
		end: 999
	});
	var childfilters = skuchild.filters;
	var searchResult2 = skuchild.run().getRange({
		start: 0,
		end: 999
	});

	var itemSKU = context.newRecord;
	var customField = itemSKU.getValue('custitem1');
	
if(!customField)
	{
	log.debug('SKU empty', 'here');
	var randomNum = "";
	for(i=0; i < 8; i++){
		randomNum += Math.floor(Math.random()*10).toString();
	}
    log.debug('randomNum', randomNum);
    
    var sku = (('1' + Math.floor(Math.random()*1000000) + 1).toString(0,8));
    
    log.debug('sku', sku);
    itemSKU.setValue('custitem1', sku);
    
}
	else{
		log.debug('SKU not empty', 'here');
	}
}
return {
	beforeLoad: beforeLoad
};
});
