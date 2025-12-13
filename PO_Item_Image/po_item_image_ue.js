/**
 * PO Item Image Script
 * SuiteScript 1.0 User Event
 * 
 * Populates item thumbnail images on Purchase Order lines
 * by looking up the item's storedisplaythumbnail and setting the URL
 */

function userEventBeforeSubmit(type){

    var itemCount = nlapiGetLineItemCount('item');	
    for (var i=1; i<=itemCount; i++){			
        
        // Get Item Id
        var itemId = nlapiGetLineItemValue('item','item',i);
        
        // Get item type and determine record type
        var itemType = nlapiGetLineItemValue('item', 'itemtype', i);
        var recordType = '';	
                    
        switch (itemType) {   
            case 'InvtPart':
                recordType = 'inventoryitem';
                break;
            case 'NonInvtPart':
                recordType = 'noninventoryitem';
                break;
            case 'Service':
                recordType = 'serviceitem';
                break;
            case 'Assembly':
                recordType = 'assemblyitem';
                break;                
            case 'GiftCert':
                recordType = 'giftcertificateitem';
                break;
            default:
        }		

        var item = nlapiLoadRecord(recordType, itemId);		
        var imgFileId = item.getFieldValue('storedisplaythumbnail');		
        
        if (imgFileId) {
            var file = nlapiLoadFile(imgFileId);
            
            if (file.isOnline()){
                var imageUrl = file.getURL();
                // Complete url - update domain as needed
                var completeUrl = 'https://system.sandbox.netsuite.com' + imageUrl;
                // Set completed url to custom column field
                nlapiSetLineItemValue('item','custcol3',i,completeUrl);
            }
        }
    }
}
