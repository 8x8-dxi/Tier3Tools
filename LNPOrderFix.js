#!/usr/bin/env node
const CONF = require('./src/Config/config')
const Logger = require('./src/utils/app-logger')
var request = require("request");
var prompt = require('prompt');
const term = require( 'terminal-kit' ).terminal ;
const { isNull, isNullOrUndefined } = require('util');
const { peachpuff } = require('color-name');
const { lookup } = require('dns');
const e = require('express');
const { channel } = require('diagnostics_channel');

// Credentials and Environment
const AuthToken = CONF.authKey;
const SSOHOST = CONF.SSOHOST;
const SSOAUTHHOST = CONF.SSOAUTHHOST;
const APIHOST = 'https://platform.8x8.com';

/*
//=============================================

 _      _   _ _____    _______          _   C 
| |    | \ | |  __ \  |__   __|        | |
| |    |  \| | |__) |    | | ___   ___ | |
| |    | . ` |  ___/     | |/ _ \ / _ \| |
| |____| |\  | |         | | (_) | (_) | |
|______|_| \_|_|         |_|\___/ \___/|_|
                                          

//=============================================
*/
// TOKEN Authenthication
function getToken(callback) {
    if (typeof callback !== 'function') {
        throw new Error('[*] Please pass a valid callback function!');
    }
    let options = {
        method: 'POST',
        url: SSOHOST,
        headers:{
                    Host: SSOAUTHHOST,
                    Authorization: 'Basic ' + AuthToken,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
        form: {
            grant_type: 'client_credentials',
            scope: 'vo'
        }
    };
    request(options, callback);
};

// GET callback with JSON parse 
function GETDATA(options, callback) {
    request(options, function (error, response, body) {
        if (error){
            throw new Error(error);
        }
        if(body){
            return callback(error, JSON.parse(body));
        }
        return callback(error, body);
    });
}

// DELETE callback with JSON parse
function DELETEDATA(options, callback) {
    request(options, function (error, response, body) {
        if (error)
            throw new Error("[*] Fail to delete data. Error:", error);
        return callback(error, JSON.parse(body));
    });
}

// createDIDBinding
function createDIDBinding(access_token, BindingDetails) {
    if (!BindingDetails.customerId){
        throw new Error("[*] Customer ID is not set");
    }
    let options = {
        method: 'POST',
        url: APIHOST+'/vo/config/v1/customers/' + BindingDetails.customerId + '/pbxes/' + BindingDetails.pbxId + '/didbindings',
        headers: {
            "content-type": "application/json",
            "Authorization": 'Bearer ' + access_token
        },
        body: {
            subscriptionId: BindingDetails.subscriptionId,
            permanentDidId: BindingDetails.tempUUID
        },
        json: true
    };

    request(options,  (error, response, body) => {
        if (error){
            Logger.info("Error:", error);
            Logger.info("createDIDBinding payload", BindingDetails);
            throw new Error(error);
        }
        var result = body;
        if (result.failed) {
            Logger.error(`[*] Could not create DID Binding.", result.failed)`);
        } else if (result.success && result.success[0].message === 'Success') {
            swapTempDID(access_token, BindingDetails);
        }
    });
}

// Temp DID binding Deletion
function deleteDidBinding(access_token, BindingDetails) {
    let options = {
        method: 'DELETE',
        url: APIHOST+'/vo/config/v1/customers/' + BindingDetails.customerId + '/pbxes/' + BindingDetails.pbxId + '/didbindings/' + BindingDetails.didBindingId,
        headers:{
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + access_token
        }
    };
    Logger.info(`"DELETING didBinding [ ${BindingDetails.didBindingId}]`);
    
    DELETEDATA(options, (error, result)=> {
        if (!error && result.failed) {
            Logger.error(`[${result.failed[0]}] Failed to delete didBinding.` );
        } else {
            if (result.success) {
                Logger.info(`[i] Successfully DELETED didBinding`, JSON.stringify(result.success[0]));
                return createDIDBinding(access_token, BindingDetails);
            }
        }
    });
}

// Recreation of Temp DID Binding (GET, DELETE, POST)
function getDIDBinding(access_token, customerId, permanentDidId, callback) {
    let options = {
        method: 'GET',
        url: APIHOST+'/vo/config/v1/customers/' + customerId + '/didbindings',
        qs: {filter: `permanentDidId==${permanentDidId}`},
        headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + access_token
        }
    };

    Logger.info('[i] Getting didbindings...');
    return GETDATA(options, callback);
}

// Recreation of Temp DID Binding (GET, DELETE, POST)
function recreateDIDBinding(access_token, BindingDetails) {

    const buildAndDeleteDidBinding = (BindingDetails, error, result)=>{
        if (!error && result && result.content && result.content.length > 0 ) {

            var didBindingId = result.content[0].didBindingId;
            var pbxId = result.content[0].pbxId;
            var subscriptionId = result.content[0].subscriptionId;
            BindingDetails.subscriptionId = subscriptionId;
            BindingDetails.pbxId = pbxId;
            BindingDetails.didBindingId = didBindingId;

            Logger.info(`[i] Found didbinding [${didBindingId}] for subscriptionId [${pbxId}] on PBX [${subscriptionId}] `);

            if (BindingDetails.customerId && didBindingId && pbxId) {
                deleteDidBinding(access_token, BindingDetails)
            }
        }else{
            Logger.error(`No result find with TempUuid and PermUuid`);
        }
    }

    getDIDBinding(access_token, BindingDetails.customerId, BindingDetails.tempUUID, (error, result)=>{

        if (!error && result.pageResultSize === 0){
            Logger.info(`DID Binding could not be found with TempUuid ${BindingDetails.tempUUID} Attempting with permUuid ${BindingDetails.permUUID}`);
            getDIDBinding(access_token, BindingDetails.customerId , BindingDetails.permUUID, (error, result)=>{

                BindingDetails.actualTempUUID = BindingDetails.tempUUID;
                if (BindingDetails.permUUID !== BindingDetails.tempUUID){
                    BindingDetails.tempUUID = BindingDetails.permUUID;
                    Logger.warn(`We are using the PermUUID to recreate the DID bining as the TemUUID data could not be found!`)
                }
                buildAndDeleteDidBinding(BindingDetails, error, result);
            })
        }else{
            buildAndDeleteDidBinding(BindingDetails, error, result);
        }
    })
}

// ceate channel
function createChannel (access_token, BindingDetails) {
    let options = {
        method: 'POST',
        url: `${APIHOST}/vo/config/v1/customers/${BindingDetails.customerId}/pbxes/${BindingDetails.pbxId}/vccsites/${BindingDetails.siteId}/channels`,
        headers:{
            'Content-Type': 'application/json',
            Authorization: `Bearer ${access_token}`
        },
        body: [{"siteId": BindingDetails.siteId,
              "phoneNumber": BindingDetails.portedNumber}],
        json: true  
    };
    request(options, function (error, result, body) {
        if (body.failed) {
            Logger.error(`[*] Channel creation FAILED for ${BindingDetails.portedNumber} with error:\n ${JSON.stringify(body)}`);
        } else if (body.success){
            Logger.info (`Channel ${body.success[0].resourceId} successfully created for ${BindingDetails.portedNumber}`)
        }
    })
};

// function to assign PERM to VCC
function assignToVCC (access_token, BindingDetails) {
    let options = {
        method: 'POST',
        url: `${APIHOST}/dms/v2/customers/${BindingDetails.customerId}/bulkassignments`,
        headers: {
          'Content-Type': 'application/json',
          clientid: 'VCC',
          Authorization: 'Bearer '+ access_token
        },
        body: [{"didUuid": BindingDetails.permUUID}],
        json: true
    }
    request(options, function (error, result, body) {
        if (!error && body.orders[0].status === 'COMPLETED') {
            Logger.info(`[i] Number ${BindingDetails.portedNumber} successfully assigned to VCC.`);
            createChannel (access_token, BindingDetails);
        } else {
            Logger.error(`[*] Owner unassignment FAILED`);
        }
    })
};

// function to assign PERM to VCC
function assignToVOVCC (access_token, BindingDetails) {
    let options = {
        method: 'POST',
        url: `${APIHOST}/dms/v2/customers/${BindingDetails.customerId}/bulkassignments`,
        headers: {
          'Content-Type': 'application/json',
          clientid: 'vo_vcc',
          Authorization: 'Bearer '+ access_token
        },
        body: [{"didUuid": BindingDetails.permUUID}],
        json: true
    }
    request(options, function (error, result, body) {
        if (!error && body.orders[0].status === 'COMPLETED') {
            Logger.info(`[i] Number ${BindingDetails.portedNumber} successfully assigned to VO VCC.`);
            createChannel (access_token, BindingDetails);
        } else {
            Logger.error(`[*] Owner unassignment VO VCC FAILED`);
        }
    })
};

// function to unassign owner
function unassignDMS (access_token, BindingDetails) {
    let options = {
        method: 'POST',
        url: `${APIHOST}/dms/v2/customers/${BindingDetails.customerId}/bulkunassignments`,
        headers: {
          'Content-Type': 'application/json',
          clientid: BindingDetails.tempOwner,
          Authorization: 'Bearer '+ access_token
        },
        body: [{"didUuid": BindingDetails.tempUUID}],
        json: true
    }
        request(options, (error, result, body) => {
            if (!error && body.orders[0].status === 'COMPLETED') {
                Logger.info(`[i] Number successfully unassigned. Claiming Temp`);
                ClaimTemp (access_token, BindingDetails);
            } else {
                Logger.error(`[*] Owner unassignment FAILED`);
            }
    })
};

// Toggle DMS
function toggleDms (access_token, BindingDetails) {
    let options = {
        method: 'POST',
        url: `${APIHOST}/dms/v2/customers/${BindingDetails.customerId}/bulkassignments`,
        headers: {
          'Content-Type': 'application/json',
          clientid: 'vo',
          Authorization: 'Bearer '+ access_token
        },
        body: [{"didUuid": BindingDetails.permUUID}],
        json: true
    }

    request(options, function (error, result, body) {
        if (error){
            throw new Error(error);
        }
        //
        options.url = `${APIHOST}/dms/v2/customers/${BindingDetails.customerId}/bulkunassignments`;
        request(options, function (error, response, body) {
            if (!error && BindingDetails.tempOwner === 'vo_vcc' ){
                assignToVOVCC (access_token, BindingDetails);
            }else if (BindingDetails.vccChannelflag === true) {
                assignToVCC (access_token, BindingDetails)
            }
        })
    });      
}

swapVCCNumber = (access_token, BindingDetails, callback)=>{
    let options = {
        method: 'PATCH',
        url : `https://cloud8.8x8.com/vcc-phone-channels-manager/v1/channels?phone_number=${BindingDetails.tempNumber}`,
        headers:{
            'Content-Type': 'application/xml',
            Authorization: `Bearer ${access_token}`,
            'X-Tenant-Id': `${BindingDetails.VCCTenantID}`,
            'X-Customer-Id': `${BindingDetails.customerId}`,
            'X-Pbx-Id': `${BindingDetails.pbxId}`,
            'X-Site-Id': `${BindingDetails.siteId}`
        },
        body : {
            'phone_number': BindingDetails.portedNumber,
            'site_id': BindingDetails.siteId,
            'customer_id': BindingDetails.customerId,
            'pbx_id': BindingDetails.pbxId,
            'did_uuid': BindingDetails.permUUID
        },
        json:true
    }
    request(options, (error, result) =>{
        if (!error && result.failed) {
            Logger.error("[*] Failed to add Perm to VCC. ", result.failed[0]);
            if(callback) return callback(true, result.failed)
        } else {
            if (result.success) {
                Logger.info(`[i] Successfully added Perm ${BindingDetails.portedNumber} from channel list`);
                if(callback) return callback(error)
            }
        }
    });
}

swapVOVCCNumber = (access_token, BindingDetails, callback)=>{
    let options = {
        method: 'PATCH',
        url : `https://cloud8.8x8.com/vcc-contact-manager/v1/agents/${BindingDetails.channel.userId}`,
        headers:{
            'Content-Type': 'application/json',
            Authorization: `Bearer ${access_token}`,
            'X-Tenant-Id': `${BindingDetails.VCCTenantID}`,
            'X-Customer-Id': `${BindingDetails.customerId}`,
            'X-Pbx-Id': `${BindingDetails.pbxId}`,
            'X-Site-Id': `${BindingDetails.siteId}`,
            'X-Branch-Id':`${BindingDetails.channel.branchId}`
        },
        body : {
            phone_channel: {
                phone_number : BindingDetails.portedNumber
            },
        },
        json:true
    }
    request(options, (error, result) =>{
        //console.info(result.body)

        const body = result
        if (!error && result.body) {
            Logger.info(`[i] Temp ${BindingDetails.tempNumber} running clean up Quit`);
            ClaimTempBlank(access_token, BindingDetails)            
            if(callback) return callback(true, body)
        } else {
            Logger.info(`Done! ${JSON.stringify(result)}`);
        }
    });
}

getExtensionByNumber = (access_token, BindingDetails, item, callback)=>{
    const phoneNumber = BindingDetails.tempNumber.replace('+', '')
    let options = {
        method: 'GET',
        url : `https://platform.8x8.com/vo/config/v1/customers/${BindingDetails.customerId}/pbxes/${item.pbxId}/extensions?filter=primaryDID==${phoneNumber}`,
        headers:{
            'Content-Type': 'application/json',
            Authorization: `Bearer ${access_token}`,
        },
        json:true
    }
    let  channel  = null
    request(options, (err, result) =>{
        const body = result.body;

        if (!err && body.pageResultSize > 0){
            channel = body.content.pop();
         }
        return callback(err, channel)
    });
}

// check if number stuck in PORTED status
function VerifyNumberStatusAfterClaim(access_token, BindingDetails) {
    let options = {
        method: 'GET',
        url: `${APIHOST}/dms/v2/dids`,
        qs: {
            pageKey: 0,
            limit: 1,
            filter: 'phoneNumber==' + BindingDetails.portedNumber
        },
        headers:
        {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: 'Bearer ' + access_token
        }
    }
    GETDATA(options, (err, result)=>{
       if (!err && BindingDetails.vccChannelflag === true && BindingDetails.tempOwner !== 'vo_vcc'){
            assignToVCC (access_token, BindingDetails);
       } else if (!err && BindingDetails.tempOwner === 'vo_vcc' ){
            Logger.info(`[i] Temp ${BindingDetails.tempNumber} going to assignToVOVCC`);
            assignToVOVCC (access_token, BindingDetails);
       } else if (!err && result.content[0].status === 'PORTED'){
            toggleDms (access_token, BindingDetails);
       } else {
           Logger.info(`Operation ended.`);
       }
       
       if(BindingDetails.tempOwner === 'VCC' || BindingDetails.tempOwner === 'vcc'){
            swapVCCNumber(access_token, BindingDetails)
        }
        if(BindingDetails.tempOwner === 'VO_VCC' || BindingDetails.tempOwner === 'vo_vcc'){
            //console.info("---Swaping VO VCC---")
            Logger.info(`[i] Temp ${BindingDetails.tempNumber} going to swapVOVCCNumber`);
            swapVOVCCNumber(access_token, BindingDetails)
         }
    })
};

function ClaimTempBlank(access_token, BindingDetails) {
    if (!BindingDetails && !BindingDetails.customerId && !BindingDetails.tempUUID) {
            Logger.error("[*] Missing DID Information (customerId;tempUUID)", BindingDetails);
    }
    let options = {
        method: 'POST',
        url: APIHOST+'/dms/v2/customers/' + BindingDetails.customerId + '/bulkquitclaims',
        headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + access_token
        },

        body: [{
                didUuid: BindingDetails.tempUUID
            }
        ],
        json: true
    };
    request(options, function (error, response, body) {
        if (error){
            throw new Error(error);
        }   
        if (body.failed) {
            var result = body.failed[0];
            Logger.error("[*] Claim FAILED with error: ", result.failed);
        } else if (body.success){
            var result = body.success[0];
            if (result.message === 'Success') {
                Logger.info(`[i] Temp ${BindingDetails.tempNumber} was successfully claimed`);
            }
        } else if (body.status === 'CREATED') {
            if (body.errors && body.errors.length > 0){
                if (body.errors[0].message){
                    Logger.error(`[i] Temp ${BindingDetails.tempNumber} was not claimed ${JSON.stringify(body.errors)}`);
                }
            }else{
                Logger.info(`Completed for Temp: ${BindingDetails.tempNumber}. DONE`);
            }
        }
    });
}

// function to claim temp number back to DMS
function ClaimTemp(access_token, BindingDetails) {
        if (!BindingDetails && !BindingDetails.customerId && !BindingDetails.tempUUID) {
            Logger.error("[*] Missing DID Information (customerId;tempUUID)", BindingDetails);
    }
    let options = {
        method: 'POST',
        url: APIHOST+'/dms/v2/customers/' + BindingDetails.customerId + '/bulkquitclaims',
        headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + access_token
        },

        body: [{
                didUuid: BindingDetails.tempUUID
            }
        ],
        json: true
    };
    request(options, function (error, response, body) {
        if (error){
            throw new Error(error);
        }   
        if (body.failed) {
            var result = body.failed[0];
            Logger.error("[*] Claim FAILED with error: ", result.failed);
        } else if (body.success){
            var result = body.success[0];
            if (result.message === 'Success') {
                Logger.info(`[i] Temp ${BindingDetails.tempNumber} was successfully claimed`);
                //Verify the number status in DMS is not stuck in PORTED
                VerifyNumberStatusAfterClaim(access_token, BindingDetails)
            }
        } else if (body.status === 'CREATED') {
            Logger.info(`[i] Temp ${BindingDetails.tempNumber} was successfully claimed`);
            VerifyNumberStatusAfterClaim(access_token, BindingDetails)
        }
    });
}

// swap temp for perm
function swapTempDID(access_token, BindingDetails) {

    let tempUUID = BindingDetails.tempUUID;
    if (BindingDetails.actualTempUUID && BindingDetails.permUUID == BindingDetails.tempUUID){ // fix for missing binding
        tempUUID = BindingDetails.actualTempUUID
    }
    let options = {
        method: 'POST',
        url: `https://platform.8x8.com/vo/config/v1/customers/${BindingDetails.customerId}/dids/_portcomplete`,
        headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + access_token
        },
        body: {
            newDidId: BindingDetails.permUUID,
            oldDidId: tempUUID
        },
        json: true
    };

    request(options, function (error, response, body) {
        if (error)
            throw new Error(error);

        if (body && body.failed) {
            var result = body.failed[0];
            if (result.code === 'INVALID_DID_BINDING')
            {
                Logger.info("[*] INVALID_DID_BINDING. Attempting to recreate didBinding");
                recreateDIDBinding(access_token, BindingDetails);
            } else {
                unassignDMS(access_token, BindingDetails)
            }
        } else if (body && body.success) {
            var result = body.success[0];
            if (result.message === 'Success') {
                Logger.info(`[i] Number SWAP successfull. (permanentDid put into service)`);
                //Call to claim the Temp
                ClaimTemp(access_token, BindingDetails);
            }
        }else{
            Logger.warn(`${response.statusCode} : Swap temp return empty body ${JSON.stringify(body)} Request ${JSON.stringify(options)}`)
        }
    });
}

function getTempVCCChannel(access_token, BindingDetails, callback){
    BindingDetails.tempNumber = BindingDetails.tempNumber.replace(/[+]/g, "");
    let options = {
        method: 'GET',
        url: `${APIHOST}/vo/config/v1/customers/${BindingDetails.customerId}/pbxes/${BindingDetails.pbxId}/vccsites/${BindingDetails.siteId}/channels?filter=phoneNumber==${BindingDetails.tempNumber}`,
        headers:{
            'Content-Type': 'application/json',
            Authorization: `Bearer ${access_token}`
        }
    };
    let channel = null;
    GETDATA(options, (error, response)=>{
        if (!error && response.pageResultSize > 0){
            channel = response.content.pop();
        }
        return callback(error, channel)
    })
}

function DeleteTempChannel(access_token, BindingDetails){

    getTempVCCChannel(access_token, BindingDetails, (err, channel)=>{
        if (!err && channel){
            let options = {
                method: 'DELETE',
                url: `${APIHOST}/vo/config/v1/customers/${BindingDetails.customerId}/pbxes/${BindingDetails.pbxId}/vccsites/${channel.siteId}/channels/${channel.channelId}`,
                headers:{
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + access_token
                }
            };
            DELETEDATA(options,  (error, result)=> {
                if (!error && result.failed) {
                    Logger.error(`Failed to delete temp VCC channel ${JSON.stringifyresult.failed}`);
                } else {
                    Logger.info(`[i] Successfully DELETED Temp VCC Chanell ${JSON.stringify(result)}`);
                }
            });
        }
    })
}

function addPermNumberToVCC(access_token, BindingDetails, callback){
    let options = {
        method: 'POST',
        url : `https://cloud8.8x8.com/vcc-phone-channels-manager/v1/channels`,
        headers:{
            'Content-Type': 'application/xml',
            Authorization: `Bearer ${access_token}`,
            'X-Tenant-Id': `${BindingDetails.VCCTenantID}`,
        },
        body : {
            'phone_number': BindingDetails.portedNumber,
            'site_id': BindingDetails.siteId,
            'customer_id': BindingDetails.customerId,
            'pbx_id': BindingDetails.pbxId,
            'did_uuid': BindingDetails.permUUID
        },
        json:true
    }
    request(options, (error, result) =>{
        if (!error && result.failed) {
            Logger.error("[*] Failed to add Perm to VCC. ", result.failed[0]);
            if(callback) return callback(true, result.failed)
        } else {
            if (result.success) {
                Logger.info(`[i] Successfully added Perm ${BindingDetails.portedNumber} from channel list`);
                if(callback) return callback(error)
            }
        }
    });
}

function DeleteVCCCMTempViaProvAPI(access_token, BindingDetails, callback){
    let options = {
        method: 'DELETE',
        url : `https://cloud8.8x8.com/vcc-phone-channels-manager/v1/channels?phone_number=${BindingDetails.tempNumber}`,
        headers:{
            'Content-Type': 'application/xml',
            Authorization: `Bearer ${access_token}`,
            'X-Tenant-Id': `${BindingDetails.VCCTenantID}`,
            'X-Customer-Id': `${BindingDetails.customerId}`,
            'X-Pbx-Id': `${BindingDetails.pbxId}`,
            'X-Site-Id': `${BindingDetails.siteId}`,
        }
    }
    request(options, function (error, result) {
        if (!error && result.failed) {
            Logger.error("[*] Failed to delete. ", result.failed[0]);
            return callback(true, result.failed)
        } else {
            if (result.success) {
                Logger.info(`[i] Successfully removed Temp ${BindingDetails.tempNumber} from channel list`);
                Logger.info(`[i] Unassigning Temp ${BindingDetails.tempNumber} from VCC service`)
                addPermNumberToVCC(access_token, BindingDetails, callback)
            }
        }
    });
}

// Check Channels
function checkChannels (access_token, BindingDetails) {
 
    unassignDMS (access_token, BindingDetails);
    /*
    // This is an alternative call to DeleteVCCCMTempViaProvAPI
    getTempVCCChannel(access_token, BindingDetails, (err, channel)=>{
        if (!err && channel){
        }
    })
    */
        //      
};

function checkSiteResult (access_token, siteResult, pbxlistLength, BindingDetails) {
    getVCCTenant(access_token, BindingDetails, (err, tenant)=>{
        if(!tenant){
            Logger.error(`Failed to get tennat for customer ID ${BindingDetails.customerId} Error: ${JSON.stringify(err)}`)
            return 
        }

        BindingDetails.VCCTenantID = tenant.tenantId
        BindingDetails.siteId = tenant.siteId
        BindingDetails.clusterId = tenant.clusterId

        if (siteResult.size === pbxlistLength) {
            for ( let [key, value] of siteResult) {
                if (value === false){
                    Logger.info (`[i] None found for pbx: "${[key]}"`)
                } else {
                    Logger.info (`[i] Found site: ${BindingDetails.siteId} for pbx: "${[key]}"`)
                    Logger.info (`[i] Looking for Temp number in channel list`)
                    checkChannels (access_token, BindingDetails)
                }
            }   
        }
    })
}

// GET VCC site
function getVCCsite (access_token, BindingDetails) {

    getVCCTenant(access_token, BindingDetails, (err, tenant)=>{
        if(!tenant){
            Logger.error(`Failed to get tennat for customer ID ${BindingDetails.customerId} Error: ${JSON.stringify(err)}`)
            return 
        }

        if (tenant && tenant.siteId) {
            BindingDetails.VCCTenantID = tenant.tenantId
            BindingDetails.siteId = tenant.siteId
            BindingDetails.clusterId = tenant.clusterId
            Logger.info (`[i] Found site: ${BindingDetails.siteId} for pbx: "${[tenant.pbxName]}"`)
            Logger.info (`[i] Looking for Temp number in channel list`)
            checkChannels (access_token, BindingDetails) 
        }
    })
};

// GET Pbx if VCC
function getCustomerDetails (access_token, BindingDetails) {

    const doNext = (access_token, BindingDetails) =>{
        return (item) =>{
            getExtensionByNumber(access_token, BindingDetails, item, (err, channel) =>{

                if (!err && channel){
                    BindingDetails.pbxId = item.pbxId;
                    BindingDetails.pbxName = item.name;
                    BindingDetails.channel = channel
                    getVCCsite (access_token, BindingDetails);
                } else if(!err && !channel) {
                    Logger.warn (`Number does not belong to PBX for ${BindingDetails.customerId} PBXID ${item.pbxId}`);
                }else{
                    Logger.warn(`Get PBX Extn failed`)
                }
            })
        }
     };
    let options = {
        method: 'GET',
        url: `${APIHOST}/vo/config/v1/customers/${BindingDetails.customerId}/pbxes?`,
        headers:{
            'Content-Type': 'application/json',
            Authorization: `Bearer ${access_token}`
        }
    };
    Logger.info(`[i] Getting PBX info for: ${BindingDetails.customerId}`);
    request(options, function (error, response, body) {
        if (error){
            throw new Error(error);
        }
        if (body){
            var data = JSON.parse(body);
            if (data.pageResultSize > 0 ){ 
                Logger.warn(`[i] Looking up VCC Site`);
                let pbxlist = data.content;
                var siteResult = new Map ();
                // TODO check why we need to iterate through the entire list of PBX
                pbxlist.forEach (doNext(access_token, BindingDetails));
            }else{
                Logger.info (`[**[error]] Could not find PBX for ${BindingDetails.customerId}`);
            }
        }
    });
};

function getVCCTenant(access_token, BindingDetails, callback){
    let options = {
        method: 'GET',
        url: `https://cloud8gatekeeper.us-west-2.prod.cloud.8x8.com/vcc-globalprovisioning/v1/customers/${BindingDetails.customerId}/tenants`,
        headers: {
            Authorization: 'Bearer ' + access_token,
            'Content-Type': 'application/json'
        },
        rejectUnauthorized: false,
        requestCert: false,//add when working with https sites
        agent: false,//add when working with https sites
    }
    let tennant = null
    GETDATA(options, (error, response)=>{
        if (!error && response.length > 0){
            tennant = response.pop();
        }
        return callback(error, tennant)
    })
}

// GET fax service info
function getFaxDID(access_token, BindingDetails){
        let options = {
            method: 'GET',
            url: `${APIHOST}/fax/v1/customers/${BindingDetails.customerId}/dids?filter=didId==${BindingDetails.tempUUID}`,
            headers: {
                Authorization: 'Bearer ' + access_token,
                'Content-Type': 'application/json'
            }
        }
        GETDATA(options, (error, response)=>{
            if (!error && response.pageResultSize > 0){
                var fax = response.content.pop();
                Logger.info('FAX: ', fax)
                if (fax.status === 'AVAILABLE') {
                    let options = {
                        method: 'DELETE',
                        url: `${APIHOST}/fax/v1/customers/${BindingDetails.customerId}/dids/${BindingDetails.tempUUID}`,
                        headers:{
                            'Content-Type': 'application/json',
                            Authorization: 'Bearer ' + access_token
                        }
                    };
                    DELETEDATA(options, function (error, result) {
                        if (!error && result.failed) {
                            Logger.error("[*] Failed to delete didBinding. ", result.failed[0]);
                        } else {
                            if (result.success) {
                                Logger.info(`[i] Successfully DELETED Temp DID from FAX service ${JSON.stringify(result.success[0])}`);
                                swapTempDID(access_token, BindingDetails); 
                            }
                        }
                    });
                }else{
                    //Todo
                    //What else????
                    //Logger.info(`Work in progess! We detected Stataus ${fax.status} which is not yet implemented!`);
                    Logger.warn(`[i] Going to unassign TEMP from ${BindingDetails.tempOwner}`);
                    unassignDMS (access_token, BindingDetails);
                }
            }
        })
    }

// Get Port Details
function getPortDetails(access_token, phoneNumber) {
    let options = {
        method: 'GET',
        url: `${APIHOST}/dms/v2/dids`,
        qs: {
            pageKey: 0,
            limit: 1,
            filter: 'phoneNumber==' + phoneNumber
        },
        headers:
                {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Authorization: 'Bearer ' + access_token
                }
    };
    request(options, function (error, response, body) {

        if (error || response.statusCode === 401)
            throw new Error(response.statusCode);
        var data = JSON.parse(body);
        if (data.content.length > 0) {
            var content = data.content[0];
            var BindingDetails = {
                permUUID: content.uuid,
                portedNumber: content.phoneNumber,
                permOwner : content.serviceOwner,
                permStatus : content.status,
                customerId: content.customerId,
            }
            
            if (content.temporaryDid != null) {
                    BindingDetails.tempUUID = content.temporaryDid.uuid
                    BindingDetails.tempNumber = content.temporaryDid.phoneNumber
                    BindingDetails.tempStatus = content.temporaryDid.status
                    BindingDetails.tempOwner = content.temporaryDid.serviceOwner
                    Logger.info(`[i] PERM ${BindingDetails.portedNumber} :: uuid: ${BindingDetails.permUUID} || ${BindingDetails.permStatus}(${BindingDetails.permOwner})`);
                    Logger.info(`[i] TEMP ${BindingDetails.tempNumber} :: uuid: ${BindingDetails.tempUUID} || ${BindingDetails.tempStatus}(${BindingDetails.tempOwner})`);
                    if (BindingDetails.tempStatus === 'AVAILABLE') {
                        Logger.info(`[i] Temp Number in status ${BindingDetails.tempStatus} Claiming Temporary.`);
                        ClaimTemp(access_token, BindingDetails);
                    } else {
                            // Handle VO failures
                        if (BindingDetails.tempOwner === 'vo') {
                            Logger.info('[i] Temporary owned by VO. Attempting number SWAP' );
                            swapTempDID(access_token, BindingDetails); 
                        }
                            // Handle fax failures
                        if (BindingDetails.tempOwner === 'fax'){
                            Logger.info(`[i] Temporary assigned to FAX service. Getting VCC data`)
                            getFaxDID(access_token, BindingDetails)
                        }
                            // Handle VCC failures 
                        if ( BindingDetails.tempOwner === 'VCC' || BindingDetails.tempOwner === 'vcc' || BindingDetails.tempOwner === 'vo_vcc') {
                            Logger.info(`[i] Temporary assigned to ${BindingDetails.tempOwner}. Getting VCC data`)
                            BindingDetails.vccChannelflag = true;
                            getCustomerDetails(access_token, BindingDetails);
                        }
                    }
                } else {
                    Logger.info (`[i] Number ${BindingDetails.portedNumber} has no temporary attached. No action to take.`);
                    VerifyNumberStatusAfterClaim(access_token, BindingDetails);
                }
        } else {
            Logger.info (`**[error] Number of ${phoneNumber} was not found in DMS. Please make sure the number is correct and try again`);
            LookUpNumber(access_token);
        };
    });
};

//Get Numbers in Order
function getAffectedNumbers (access_token, CustomerOrder){

    const LoopList = (access_token, NumberList)=>{
        // Get the list of failed numbers
        if (NumberList != null) {
            var ticker = setTimeout (() => {
                while (NumberList.length > 0) {
                    let phoneNumber = NumberList.pop ()
                    getPortDetails(access_token, phoneNumber)
                } 
                    clearTimeout (ticker);
                    return;
            }, 5000)
        }else{
            Logger.info(`Could not find any failed numbers for the mentioned Order`);
            LookUpOrder();
        }
    }

    const processResult = (error, result) =>{
        
        if (!error && result.status !== 'FAILED'){
            //check if there there are pending numbers
            let pendingList = result.detailedStatus.failed;
            // if (pendingList.length === 0 && result.detailedStatus.pending.length > 0){
            //     pendingList = result.detailedStatus.pending
            // }
            
            if (pendingList){
                Logger.info(`The Job status is "${result.status}" and there [${result.detailedStatus.failed}] numbers.`);
                term.yellow(`There ${pendingList.length} pending numbers. DO YOU WANT TO SWAP THE PENIDING LIST?\n`);
    
                let options = {
                    message: 'Please confirm YES of NO to continue',
                    name: 'Confirm',
                }
                getUserInput( options, (err, confirmation) =>{
                    if (confirmation.toLowerCase() === 'yes') {
                        Logger.info (`You have selected to swap the Pending list!! I hope you know what your doing!`);
                        LoopList(access_token, pendingList);
                    }else if(confirmation.toLowerCase() === 'no'){
                        Logger.info (`You choosed not to proceed! Wise choice ;)`);
                        return
                    }else{
                        Logger.info (`Invalid choice!`);
                        return
                    }
                });
            }else{
                Logger.warn(`There is no issue with the order ID [${CustomerOrder.orderId}]. The issues may have been fixed`);
                return
            }

        }else {
            if (!error && result.status  === 'FAILED'){
                // Get the list of failed numbers
                LoopList(access_token, result.detailedStatus.failed);
                
            } else {
                Logger.info (`This is NOT a failed order`);
                LookUpOrder();
            }
        }
    }


    let options = {
        method: 'GET',
        url: APIHOST + '/dms/v2/management/bulkportins/' + CustomerOrder.bulkUuid + '/portins/' + CustomerOrder.orderId + '/jobs/portcomplete',
        headers: {
            Authorization: 'Bearer ' + access_token,
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    }
    
    GETDATA(options, processResult);

};

//GET userInput
function getUserInput(promptObject, callback) {
    prompt.start();
    prompt.get(promptObject, (err, result, confirmResult) => {
        return callback(err, result.Confirm);
    });
}

// Get Order Details
function GetPortinJobByOrderID (access_token, orderId) {
    //Get the port order to find the activation job
    
    let options = {
        method: 'GET',
        url: `${APIHOST}/dms/v2/portins?filter=uuid==${orderId}`,
        headers: {
            Authorization: 'Bearer ' + access_token,
            'Content-Type': 'application/json'
        }
    }
    
    GETDATA(options, (err, body) => {
        if (!err && body.content && body.content.length > 0) {
            let order = body.content.pop();
            Logger.info(`[i] Getting Order Details`);
            let CustomerOrder = {
                customerId:order.customerId,
                bulkUuid : order.bulkUuid,
                orderId:orderId
            }
            // Get the Bulk Order
            getAffectedNumbers (access_token, CustomerOrder)
        
        }else{
            Logger.info(`[*] Could not find any results. Please make sure Order ID is VALID`);
            LookUpOrder();
        }
    });
};

//Get number from user
function LookUpNumber(access_token){
    
    let options = {
        message: 'Please enter Ported numer in international format',
        name: 'Confirm',
        validator: /^\+(?:[0-9] ?){6,14}[0-9]$/,
        warning: '[WARNING] Phone number is not valid, please use international format!'
    }
    getUserInput( options, (err, phonenumber) =>{
        if (phonenumber) {
            Logger.info (`[i] Fetching DID Information for ${phonenumber}`)
            getPortDetails(access_token, phonenumber)
        }
    });
}

// Get Order Id from user
function LookUpOrder(access_token){
    
    let options = {
        message: 'Please enter Order Id',
        name: 'Confirm',
        validator: '[0-9-a-z]{36}',
        warning: 'Oder ID must have a length of 36 characters incuding hyphens'
    }
    getUserInput( options, (err, orderId) =>{
        if (orderId && orderId != '') {
            GetPortinJobByOrderID(access_token, orderId)
        }
    });
};

getToken( (error, response, body) =>{
    if (!error)
    {
        var tokenObject = JSON.parse(body);
        Logger.info('LNP TOOL');
        term.cyan( 'Please select the option you would like to run this for.\n' ) ;
        var items = [
            '1. Single Number' ,
            '2. Full Order' ,
        ] ;
        
        term.singleColumnMenu( items , ( error , response )=> {
            if (response.selectedIndex === 0) {
                Logger.info (`You selected single number mode`);
                LookUpNumber(tokenObject.access_token);
            };
            if (response.selectedIndex === 1) {
                Logger.info (`You selected full Order mode`);
                LookUpOrder(tokenObject.access_token);
            };
        });  
    } else{
        Logger.error(`Unable to get Token!`);
    }
});