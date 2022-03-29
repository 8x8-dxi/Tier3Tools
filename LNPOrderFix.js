#!/usr/bin/env node
const chalk = require('chalk');
const clear = require('clear');
const figlet = require('figlet');
var request = require("request");
var prompt = require('prompt');
const term = require( 'terminal-kit' ).terminal ;
const { isNull, isNullOrUndefined } = require('util');
const { peachpuff } = require('color-name');
const { lookup } = require('dns');
const e = require('express');

// Credentials and Environment
const AuthToken = 'R0FTX3RlYW06ZWJmMzkwMWI4ODRk';
const SSOHOST = 'https://sso.8x8.com/oauth2/v1/token';
const SSOAUTHHOST = 'sso.8x8.com';
const APIHOST = 'platform.8x8.com';

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
        return callback(error, JSON.parse(body));
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
        url: 'https://'+APIHOST+'/vo/config/v1/customers/' + BindingDetails.customerId + '/pbxes/' + BindingDetails.pbxId + '/didbindings',
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
            console.info("Error:", error);
            console.info("createDIDBinding payload", BindingDetails);
            throw new Error(error);
        }
        var result = body;
        if (result.failed) {
            console.error(chalk.red.bold("[*] Could not create DID Binding.", result.failed));
        } else if (result.success && result.success[0].message === 'Success') {
            swapTempDID(access_token, BindingDetails);
        }
    });
}

// Temp DID binding Deletion
function deleteDidBinding(access_token, BindingDetails) {
    let options = {
        method: 'DELETE',
        url: 'https://'+APIHOST+'/vo/config/v1/customers/' + BindingDetails.customerId + '/pbxes/' + BindingDetails.pbxId + '/didbindings/' + BindingDetails.didBindingId,
        headers:{
            Host: APIHOST,
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + access_token
        }
    };
    console.info('"DELETING didBinding [ %s ]', BindingDetails.didBindingId);
    
    DELETEDATA(options, (error, result)=> {
        if (!error && result.failed) {
            console.error("[*] Failed to delete didBinding. ", result.failed[0]);
        } else {
            if (result.success) {
                console.info(chalk.green("[i] Successfully DELETED didBinding ", JSON.stringify(result.success[0])));
                return createDIDBinding(access_token, BindingDetails);
            }
        }
    });
}

// Recreation of Temp DID Binding (GET, DELETE, POST)
function getDIDBinding(access_token, customerId, permanentDidId, callback) {
    let options = {
        method: 'GET',
        url: 'https://'+APIHOST+'/vo/config/v1/customers/' + customerId + '/didbindings',
        qs: {filter: `permanentDidId==${permanentDidId}`},
        headers: {
            Host: APIHOST,
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + access_token
        }
    };

    console.info('[i] Getting didbindings...');
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

            console.info("[i] Found didbinding [ %s ] for subscriptionId [ %s ] on PBX [ %s ]  ", didBindingId, pbxId, subscriptionId);

            if (BindingDetails.customerId && didBindingId && pbxId) {
                deleteDidBinding(access_token, BindingDetails)
            }
        }else{
            console.error(`No result find with TempUuid and PermUuid`);
        }
    }

    getDIDBinding(access_token, BindingDetails.customerId, BindingDetails.tempUUID, (error, result)=>{

        if (!error && result.pageResultSize === 0){
            console.info(`DID Binding could not be found with TempUuid ${BindingDetails.tempUUID} Attempting with permUuid ${BindingDetails.permUUID}`);
            getDIDBinding(access_token, BindingDetails.customerId , BindingDetails.permUUID, (error, result)=>{

                BindingDetails.actualTempUUID = BindingDetails.tempUUID;
                if (BindingDetails.permUUID !== BindingDetails.tempUUID){
                    BindingDetails.tempUUID = BindingDetails.permUUID;
                    console.warn(`We are using the PermUUID to recreate the DID bining as the TemUUID data could not be found!`)
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
        url: `https://${APIHOST}/vo/config/v1/customers/${BindingDetails.customerId}/pbxes/${BindingDetails.pbxId}/vccsites/${BindingDetails.siteId}/channels`,
        headers:{
            Host: APIHOST,
            'Content-Type': 'application/json',
            Authorization: `Bearer ${access_token}`
        },
        body: [{"siteId": BindingDetails.siteId,
              "phoneNumber": BindingDetails.portedNumber}],
        json: true  
    };
    request(options, function (error, result, body) {
        if (body.failed) {
            console.error(chalk.red.bold(`[*] Channel creation FAILED for ${BindingDetails.portedNumber} with error:\n ${body}`));
        } else if (body.success){
            console.info (`Channel ${body.success[0].resourceId} successfully created for ${BindingDetails.portedNumber}`)
        }
    })
};

// function to assign PERM to VCC
function assignToVCC (access_token, BindingDetails) {
    let options = {
        method: 'POST',
        url: `https://${APIHOST}/dms/v2/customers/${BindingDetails.customerId}/bulkassignments`,
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
                console.info(chalk.green.bold(`[i] Number ${BindingDetails.portedNumber} successfully assigned to VCC.`));
                createChannel (access_token, BindingDetails);
            } else {
                console.error(`[*] Owner unassignment FAILED`);
            }
    })
};

// function to unassign owner
function unassignDMS (access_token, BindingDetails) {
    let options = {
        method: 'POST',
        url: `https://${APIHOST}/dms/v2/customers/${BindingDetails.customerId}/bulkunassignments`,
        headers: {
          'Content-Type': 'application/json',
          clientid: BindingDetails.tempOwner,
          Authorization: 'Bearer '+ access_token
        },
        body: [{"didUuid": BindingDetails.tempUUID}],
        json: true
    }
        request(options, function (error, result, body) {
            if (!error && body.orders[0].status === 'COMPLETED') {
                console.info(chalk.green.bold(`[i] Number successfully unassigned. Claiming Temp`));
                ClaimTemp (access_token, BindingDetails);
            } else {
                console.error(`[*] Owner unassignment FAILED`);
            }
    })
};

// Toggle DMS
function toggleDms (access_token, BindingDetails) {
    let options = {
        method: 'POST',
        url: `https://${APIHOST}/dms/v2/customers/${BindingDetails.customerId}/bulkassignments`,
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
        options.url = `https://${APIHOST}/dms/v2/customers/${BindingDetails.customerId}/bulkunassignments`;
        request(options, function (error, response, body) {
            if (BindingDetails.vccChannelflag === true) {
                assignToVCC (access_token, BindingDetails)
            }
        })
    });      
}

// check if number stuck in PORTED status
function VerifyNumberStatusAfterClaim(access_token, BindingDetails) {
    let options = {
        method: 'GET',
        url: `https://${APIHOST}/dms/v2/dids`,
        qs: {
            pageKey: 0,
            limit: 1,
            filter: 'phoneNumber==' + BindingDetails.portedNumber
        },
        headers:
        {
            Host: APIHOST,
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: 'Bearer ' + access_token
        }
    }
    GETDATA(options, (err, result)=>{
       if (!err && BindingDetails.vccChannelflag === true){
            assignToVCC (access_token, BindingDetails);
       } else if (!err && result.content[0].status === 'PORTED'){
            toggleDms (access_token, BindingDetails);
       } else {
            console.info(chalk.green.bold(`Operation ended.`));
       }
    })
};

// function to claim temp number back to DMS
function ClaimTemp(access_token, BindingDetails) {
        if (!BindingDetails && !BindingDetails.customerId && !BindingDetails.tempUUID) {
        console.error("[*] Missing DID Information (customerId;tempUUID)", BindingDetails);
    }
    let options = {
        method: 'POST',
        url: 'https://'+APIHOST+'/dms/v2/customers/' + BindingDetails.customerId + '/bulkquitclaims',
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
            console.error(chalk.red.bold("[*] Claim FAILED with error: ", result.failed));
        } else if (body.success)
        {
                console.info("body", body)
            var result = body.success[0];
            if (result.message === 'Success') {
                console.info(chalk.green.bold(`[i] Temp ${BindingDetails.tempNumber} was successfully claimed`));
                //Verify the number status in DMS is not stuck in PORTED
                VerifyNumberStatusAfterClaim(access_token, BindingDetails)
            }
        } else if (body.status === 'CREATED') {
            console.info(chalk.green.bold(`[i] Temp ${BindingDetails.tempNumber} was successfully claimed`));
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
        url: 'https://'+APIHOST+'/vo/config/v1/customers/' + BindingDetails.customerId + '/dids/_portcomplete',
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
        if (body.failed) {
            var result = body.failed[0];
            if (result.code === 'INVALID_DID_BINDING')
            {
                console.info("[*] INVALID_DID_BINDING. Attempting to recreate didBinding");
                recreateDIDBinding(access_token, BindingDetails);
            } else {
                //console.info("swapTempDID failure response", body)
                unassignDMS(access_token, BindingDetails)
            }
        } else if (body.success) {
            var result = body.success[0];
            if (result.message === 'Success') {
                console.info(chalk.greenBright(`[i] Number SWAP successfull. (permanentDid put into service)`));
                //Call to claim the Temp
                ClaimTemp(access_token, BindingDetails);
            }
        }
    });
}

// Check Channels
function checkChannels (access_token, BindingDetails) {
    BindingDetails.tempNumber = BindingDetails.tempNumber.replace(/[+]/g, "");
    let options = {
        method: 'GET',
        url: `https://${APIHOST}/vo/config/v1/customers/${BindingDetails.customerId}/pbxes/${BindingDetails.pbxId}/vccsites/${BindingDetails.siteId}/channels?filter=phoneNumber==${BindingDetails.tempNumber}`,
        headers:{
            Host: APIHOST,
            'Content-Type': 'application/json',
            Authorization: `Bearer ${access_token}`
        }
    };
    GETDATA(options, (error, response)=>{
        if (!error && response.pageResultSize > 0){
            var channel = response.content.pop();
            console.info('[i] Found Channel info: \n', channel);
            let options = {
                method: 'DELETE',
                url: `https://${APIHOST}/vo/config/v1/customers/${BindingDetails.customerId}/pbxes/${BindingDetails.pbxId}/vccsites/${BindingDetails.siteId}/channels/${channel.channelId}`,
                headers:{
                    Host: APIHOST,
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + access_token
                }
            };
            DELETEDATA(options, function (error, result) {
                if (!error && result.failed) {
                    console.error("[*] Failed to delete. ", result.failed[0]);
                } else {
                    if (result.success) {
                        console.info(chalk.green.bold(`[i] Successfully removed Temp ${BindingDetails.tempNumber} from channel list`));
                        console.info(`[i] Unassigning Temp ${BindingDetails.tempNumber} from VCC service`)
                        unassignDMS (access_token, BindingDetails);
                    }
                }
            });
        } else {
            console.info(chalk.red.bold("[*] Channel NOT found."));
            console.warn(chalk.yellow.bold(`[i] Going to unassign TEMP from ${BindingDetails.tempOwner}`));
            unassignDMS (access_token, BindingDetails);
        }
    })
};

function checkSiteResult (access_token, siteResult, pbxlistLength, BindingDetails) {
    if (siteResult.size === pbxlistLength) {
        for ( let [key, value] of siteResult) {
            if (value === false){
                console.info (`[i] None found for pbx: "${[key]}"`)
            } else {
                console.info (chalk.green(`[i] Found site: ${BindingDetails.siteId} for pbx: "${[key]}"`))
                console.info (`[i] Looking for Temp number in channel list`)
                checkChannels (access_token, BindingDetails)
            }
        
        }   
    }
}

// GET VCC site
function getVCCsite (access_token, customerId, pbxId, pbxName, siteResult, pbxlistLenght, BindingDetails) {
    let options = {
        method: 'GET',
        url: `https://${APIHOST}/vo/config/v1/customers/${customerId}/pbxes/${pbxId}/vccsites`,
        headers:{
            Host: APIHOST,
            'Content-Type': 'application/json',
            Authorization: `Bearer ${access_token}`
        }
    };
    request (options, function (error, result, body) {
        var data = JSON.parse(body);
        var content = data.content[0];
        if (!error && data.pageResultSize === 0) {
            siteResult.set(pbxName, false);
        }
        if (!error && data.pageResultSize === 1) {
            siteResult.set(pbxName, true)
            var siteId = content.siteId;
            BindingDetails.siteId = siteId;
        } 
        checkSiteResult (access_token, siteResult, pbxlistLenght, BindingDetails)
    });
};

// GET Pbx if VCC
function getCustomerDetails (access_token, BindingDetails) {
    let options = {
        method: 'GET',
        url: `https://${APIHOST}/vo/config/v1/customers/${BindingDetails.customerId}/pbxes?`,
        headers:{
            Host: APIHOST,
            'Content-Type': 'application/json',
            Authorization: `Bearer ${access_token}`
        }
    };
    console.info(chalk.grey(`[i] Getting PBX info for: ${BindingDetails.customerId}`));
    request(options, function (error, response, body) {
        if (error){
            throw new Error(error);
        }
        if (body){
            var data = JSON.parse(body);
            if (data.pageResultSize > 0 ){ 
                console.warn(`[i] Looking up VCC Site`);
                let pbxlist = data.content;
                var siteResult = new Map ();
                pbxlist.forEach ((item) => {
                        BindingDetails.pbxId = item.pbxId;
                        BindingDetails.pbxName = item.name;
                        getVCCsite (access_token, BindingDetails.customerId, item.pbxId, BindingDetails.pbxName, siteResult, pbxlist.length, BindingDetails);
                });
            }else{
                console.info (chalk.redBright.bold(`[**[error]] Could not find PBX for ${BindingDetails.customerId}`));
            }
        }
    });
};

// GET fax service info
function getFaxDID(access_token, BindingDetails){
        let options = {
            method: 'GET',
            url: `https://${APIHOST}/fax/v1/customers/${BindingDetails.customerId}/dids?filter=didId==${BindingDetails.tempUUID}`,
            headers: {
                Host: APIHOST,
                Authorization: 'Bearer ' + access_token,
                'Content-Type': 'application/json'
            }
        }
        GETDATA(options, (error, response)=>{
            if (!error && response.pageResultSize > 0){
                var fax = response.content.pop();
                console.info('FAX: ', fax)
                if (fax.status === 'AVAILABLE') {
                    let options = {
                        method: 'DELETE',
                        url: `https://${APIHOST}/fax/v1/customers/${BindingDetails.customerId}/dids/${BindingDetails.tempUUID}`,
                        headers:{
                            Host: APIHOST,
                            'Content-Type': 'application/json',
                            Authorization: 'Bearer ' + access_token
                        }
                    };
                    DELETEDATA(options, function (error, result) {
                        if (!error && result.failed) {
                            console.error("[*] Failed to delete didBinding. ", result.failed[0]);
                        } else {
                            if (result.success) {
                                console.info(chalk.green.bold("[i] Successfully DELETED Temp DID from FAX service %o", JSON.stringify(result.success[0])));
                                swapTempDID(access_token, BindingDetails); 
                            }
                        }
                    });
                }else{
                    //Todo
                    //What else????
                    //console.info(chalk.redBright.bold(`Work in progess! We detected Stataus ${fax.status} which is not yet implemented!`));
                    console.warn(chalk.yellow.bold(`[i] Going to unassign TEMP from ${BindingDetails.tempOwner}`));
                    unassignDMS (access_token, BindingDetails);
                }
            }
        })
    }

// Get Port Details
function getPortDetails(access_token, phoneNumber) {
    let options = {
        method: 'GET',
        url: `https://${APIHOST}/dms/v2/dids`,
        qs: {
            pageKey: 0,
            limit: 1,
            filter: 'phoneNumber==' + phoneNumber
        },
        headers:
                {
                    Host: APIHOST,
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
            if (content.temporaryDid!=null) {
                    BindingDetails.tempUUID = content.temporaryDid.uuid
                    BindingDetails.tempNumber = content.temporaryDid.phoneNumber
                    BindingDetails.tempStatus = content.temporaryDid.status
                    BindingDetails.tempOwner = content.temporaryDid.serviceOwner
                    console.info(`[i] PERM ${BindingDetails.portedNumber} :: uuid: ${BindingDetails.permUUID} || ${BindingDetails.permStatus}(${BindingDetails.permOwner})`);
                    console.info(chalk.green.dim(`[i] TEMP ${BindingDetails.tempNumber} :: uuid: ${BindingDetails.tempUUID} || ${BindingDetails.tempStatus}(${BindingDetails.tempOwner})`));
                    if (BindingDetails.tempStatus === 'AVAILABLE') {
                        console.info(chalk.yellow.bold("[i] Temp Number in status ") + chalk.green.bold(`${BindingDetails.tempStatus}`) +chalk.yellow.bold(", Claiming Temporary."));
                        ClaimTemp(access_token, BindingDetails);
                    } else {
                            // Handle VO failures
                        if (BindingDetails.tempOwner === 'vo') {
                            console.info('[i] Temporary owned by VO. Attempting number SWAP' );
                            swapTempDID(access_token, BindingDetails); 
                        }
                            // Handle fax failures
                        if (BindingDetails.tempOwner === 'fax'){
                            console.info(chalk.gray.bold("[i] Temporary assigned to FAX service. Getting VCC data"))
                            getFaxDID(access_token, BindingDetails)
                        }
                            // Handle VCC failures 
                        if ( BindingDetails.tempOwner === 'VCC' || BindingDetails.tempOwner === 'vcc') {
                            console.info(chalk.gray.bold("[i] Temporary assigned to VCC. Getting VCC data"))
                            BindingDetails.vccChannelflag = true;
                            getCustomerDetails(access_token, BindingDetails);
                        }
                    }
                } else {
                    console.info (chalk.redBright.bold(`[i] Number ${BindingDetails.portedNumber} has no temporary attached. No action to take.`));
                    VerifyNumberStatusAfterClaim(access_token, BindingDetails);
                    }
        } else {
            console.info (chalk.red.dim(`**[error] Number of ${phoneNumber} was not found in DMS. Please make sure the number is correct and try again`));
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
            console.info(chalk.greenBright(`Could not find any failed numbers for the mentioned Order`));
            LookUpOrder();
        }
    }

    const processResult = (error, result) =>{
        
        if (!error && result.status !== 'FAILED'){
            //check if there there are pending numbers
            let pendingList = result.detailedStatus.pending;
            console.info(chalk.yellowBright(`The Job status is "${result.status}" and there [${result.detailedStatus.failed}] numbers.`));
            //clear();
            term.yellow(`There ${pendingList.length} pending numbers. DO YOU WANT TO SWAP THE PENIDING LIST?\n`);

            let options = {
                message: chalk.yellowBright.bold('Please confirm YES of NO to continue'),
                name: 'Confirm',
            }
            getUserInput( options, (err, confirmation) =>{
                if (confirmation.toLowerCase() === 'yes') {
                    console.info (`You have selected to swap the Pending list!! I hope you know what your doing!`);
                    LoopList(access_token, pendingList);
                }else if(confirmation.toLowerCase() === 'no'){
                    console.info (`You choosed not to proceed! Wise choice ;)`);
                    return
                }else{
                    console.info (`Invalid choice!`);
                    return
                }
            });

        }else {
            if (!error && result.status  === 'FAILED'){
                // Get the list of failed numbers
                LoopList(access_token, result.detailedStatus.failed);
                
            } else {
                console.info (chalk.green.bold(`This is NOT a failed order`));
                LookUpOrder();
            }
        }
    }


    let options = {
        method: 'GET',
        url: 'https://' + APIHOST + '/dms/v2/management/bulkportins/' + CustomerOrder.bulkUuid + '/portins/' + CustomerOrder.orderId + '/jobs/portcomplete',
        headers: {
            Host: APIHOST,
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
        url: `https://${APIHOST}/dms/v2/portins?filter=uuid==${orderId}`,
        headers: {
            Host: APIHOST,
            Authorization: 'Bearer ' + access_token,
            'Content-Type': 'application/json'
        }
    }
    
    GETDATA(options, (err, body) => {
        if (!err && body.content && body.content.length > 0) {
            let order = body.content.pop();
            console.info(`[i] Getting Order Details`);
            let CustomerOrder = {
                customerId:order.customerId,
                bulkUuid : order.bulkUuid,
                orderId:orderId
            }
            // Get the Bulk Order
            getAffectedNumbers (access_token, CustomerOrder)
        
        }else{
            console.info(chalk.red.bold(`[*] Could not find any results. Please make sure Order ID is VALID`));
            LookUpOrder();
        }
    });
};

//Get number from user
function LookUpNumber(access_token){
    
    let options = {
        message: chalk.yellowBright.bold('Please enter Ported numer in international format'),
        name: 'Confirm',
        validator: /^\+(?:[0-9] ?){6,14}[0-9]$/,
        warning: '[WARNING] Phone number is not valid, please use international format!'
    }
    getUserInput( options, (err, phonenumber) =>{
        if (phonenumber) {
            console.info (`[i] Fetching DID Information for ${phonenumber}`)
            getPortDetails(access_token, phonenumber)
        }
    });
}

// Get Order Id from user
function LookUpOrder(access_token){
    
    let options = {
        message: chalk.yellowBright.bold('Please enter Order Id'),
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

// ===== RUN MENU =====
getToken( (error, response, body) =>{
    if (!error)
    {
        var tokenObject = JSON.parse(body);
        console.log(chalk.yellow(figlet.textSync('LNP TOOL', { horizontalLayout: 'full' })));
        term.cyan( 'Please select the option you would like to run this for.\n' ) ;
        var items = [
            '1. Single Number' ,
            '2. Full Order' ,
        ] ;
        
        term.singleColumnMenu( items , ( error , response )=> {
            if (response.selectedIndex === 0) {
                console.info (`You selected single number mode`);
                LookUpNumber(tokenObject.access_token);
            };
            if (response.selectedIndex === 1) {
                console.info (`You selected full Order mode`);
                LookUpOrder(tokenObject.access_token);
            };
        });  
    } else{
        console.error(`Unable to get Token!`);
    }
});