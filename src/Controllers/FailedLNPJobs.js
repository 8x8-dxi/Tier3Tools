/* 
 * @author      Christian Augustine
 * @DATE        28/01/2020
 * @description This this is a wrapper class which sents a simple get requst to SMP to fetch
 * LNP Port Jobs. It sents email to some alias if there are failed jobs
 * Collaborator Iulian Danilet
 *              Georgian Ludescu
 */

const CONFIG = require('../Config/config');
const request = require("request");
const logger = require('../utils/app-logger');
const LNPCollection = require('./LnpDBController')

const AuthToken = CONFIG.authKey;
const SSOHOST = CONFIG.SSOHOST;
const SSOAUTHHOST = CONFIG.SSOAUTHHOST;
const APIHOST = CONFIG.APIHOST;

class LNPJobs {
    constructor (redisClient, MailClient,fs){
        this.mailer = MailClient;
        this.redis = redisClient;
        this.fs = fs;
    }

    sendEmail(data, cb) {
        if (data.from && data.from === data.to){
            data.from = "ecn-helpdesk@8x8.com";
        }
        const mail = {
            from: data.from || "8x8 Support <support@easycontactnow.com>",
            to: data.to,
            subject: data.subject,
            cc: data.cc || '',
            bcc: data.bcc || ''
        };
        if (data.html) {
            mail.html = data.html;
        }
        if (data.text) {
            mail.text = data.text;
        }
        // if (data.attachment) {
        //     mail.attachments = [{
        //             filename: data.filename,
        //             content: fs.createReadStream(data.file)//data.file includes the file path
        //         }];
        // }

        this.mailer.sendMail(mail, (error, response) => {
            if (error) {
                logger.error("Error sending email. Error: ", error);
            } else {
                logger.info("Email sent. ", response);
            }
            this.mailer.close();
        });
    }

    email(customer_id, message, subject) {
        if (!subject) {
            subject = "Automatic Port swap done | (GAS/LNP) No Action required | Customer ID : " + customer_id;
        }
        self.sendEmail({
            from: 'noreply@8x8.com',
            to: "caugustine@8x8.com, georgian-andrei.ludescu@8x8.com ",
            //to: "caugustine@8x8.com, hugh.davie@8x8.com, Brian.Holt@8x8.com",
//            to: "gas@8x8.com,hugh.davie@8x8.com",
            subject: subject,
//            cc: 'Brian.Holt@8x8.com',
            text: '',
            html: message
        });
    }

    makeTable(data) {
        const table = `<!DOCTYPE html>
        <html>
            <head>
                <style>
                table {
                  font-family: arial, sans-serif;
                  border-collapse: collapse;
                  width: 100%;
                }

                td, th {
                  border: 1px solid #dddddd;
                  text-align: left;
                  padding: 8px;
                }

                tr:nth-child(even) {
                  background-color: #dddddd;
                }
                </style>
            </head>
                    
            <body><h2>Failed Port details.</h2>
                    <table style='width:100%; text-align:left'>
              <tr>
                <th>Customer ID</th>
                <td>${data.customer_id}</td>
              </tr>
              <tr>
                <th>Account Name</th>
                <td>${data.customer_name}</td>
              </tr>
                <tr>
                <th>Job Status</th>
                <td>${data.job_status}</td>
              </tr>
              <tr>
                <th>Port Status</th>
                <td>${data.status}</td>
              </tr>
              <tr>
                <th>Portin Uuid</th>
                <td>${data.portin_uuid}</td>
              </tr>
              <tr>
                <th>Failed DIDs</th>
                <td style="color:red"><strong>${data.failed_numbers.join('<br>')}</strong> </td>
              </tr>
              <tr>
                <th>Order Link</th>
                <td>${data.order_url}</td>
              </tr>
              <tr>
                <th>Create Date</th>
                <td>${this.currentDate(true, data.create_date)}</td>
              </tr>
               <tr>
                <th>Last Update</th>
                <td>${this.currentDate(true, data.last_update)}</td>
              </tr>
              <tr>
                <th>Job Error</th>
                <td style="color:red">
                    ${data.error} <br> ${data.errors_list.join('<br>')}
                </td>
              </tr>
            </table></body> 
            <h3>This code can be found the Git Repo (https://github.com/8x8-dxi/Tier3Tools)</h3>`;

        return table;
    };

    GetToken(callback){
        if (typeof callback !== 'function') {
            throw new Error('Please pass a valid callback function!');
        }
        const options = {
            method: 'POST',
            url: SSOHOST,
            headers: {
                Host: SSOAUTHHOST,
                Authorization: `Basic ${AuthToken}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },

            form: {
                grant_type: 'client_credentials',
                scope: 'vo'
            }
        };

        return request(options, callback);
    }

    DELETEDATA (options, callback) {
        request(options, (error, response, body) => {
            if (error) {
                throw new Error("Fail to delete data. Error:", error);
            }
            return callback(error, JSON.parse(body));
        });
    }

    GETDATA (options, callback) {
        request(options, (error, response, body) => {
            if (error)
                throw new Error(error);
            return callback(error, JSON.parse(body));
        });
    }

    GET(requestOptions, cb) {
        request(requestOptions, (error, response, body) => {
            if (body){
                return cb(error, JSON.parse(body));
            }
            return cb(error, null);
        });
    }


    GetCustomer (token, cid, cb) {
        if (!cid || typeof cid !== 'string') {
            logger.error("Invalid customer ID", cid);
            throw new Error("Invalid customer ID");
        }

        const options = {
            method: 'GET',
            url: `${APIHOST}/vo/config/v1/customers/${cid}?scope=expand`,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            }
        };
        return this.GETDATA(options, cb);
    }


    currentDate(includeTime, dateObject) {
        let currentdate = new Date();
        if (dateObject) {
            currentdate = new Date(dateObject);
        }
        let month = ((currentdate.getMonth() + 1) < 10) ? '0' + (currentdate.getMonth() + 1) : (currentdate.getMonth() + 1);
        let hr = (currentdate.getHours() < 10) ? '0' + currentdate.getHours() : currentdate.getHours();
        let min = (currentdate.getMinutes() < 10) ? '0' + currentdate.getMinutes() : currentdate.getMinutes();
        let sec = (currentdate.getSeconds() < 10) ? '0' + currentdate.getSeconds() : currentdate.getSeconds();
        let day = (currentdate.getDate() < 10) ? '0' + currentdate.getDate() : currentdate.getDate();
        let date = currentdate.getFullYear() + '-' + month + '-' + day;
        let time = ' ' + hr + ':' + min + ':' + sec;
        return  includeTime ? date + time : date;
    }

    GetFailedActivationJob (token, order, payLoad, callback) {
        const options = {
            method: 'GET',
            url: '',
            headers: {
                Authorization: `Bearer  ${token}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        };

        const key = 'Order-ID-' + order.uuid;
        payLoad['order_status'] = order.status;
        payLoad['order_uuid'] = order.uuid;
        payLoad['order_bulk_id'] = order.bulkUuid;
        payLoad['order_phonenumber'] = order.phoneNumbers.join(',');
        payLoad['order_url'] = `https://dmw.8x8.com/orders/lnp/${order.uuid}`;

        options.url = `${APIHOST}/dms/v2/management/bulkportins/${order.bulkUuid}/portins/${order.uuid}/jobs/portcomplete`;

        // Get the activation job
        this.GET(options, (error, job) => {

            if ((job.errors && job.errors.length > 0) || job.status && job.status === 'FAILED')
            {
                logger.info("-------JOB STATUS : %s", job.status);

                payLoad['job_status'] = job.status;
                payLoad['error'] = job.errors && job.errors.length > 0 ? job.errors[0].message : "";
                payLoad['failed_numbers'] = job.detailedStatus.failed && job.detailedStatus.failed.length ? job.detailedStatus.failed : [];
                payLoad['completed_numbers'] = job.detailedStatus.completed && job.detailedStatus.completed.length ? job.detailedStatus.completed : [];
                payLoad['errors'] = {};
                payLoad['errors_list'] = [];
                payLoad['job_errors'] = job.errors;

                if(!job.errors){
                    logger.info('No Message! ', job.errors);
                }else{
                    if (job.errors.length > 0 && payLoad['failed_numbers'].length){
                        logger.warn(`DPS LAST ERROR: ${JSON.stringify(job.errors.pop().message)}`);
                    }
                }

                // Some order status may not have failed but still has error
                if (payLoad['failed_numbers'].length === 0 && (job.detailedStatus.pending && job.detailedStatus.pending.length > 0))
                {
                    payLoad['failed_numbers'] = job.detailedStatus.pending;
                    logger.warn(`The order [${order.uuid}] status is in pending status which seem to have been stucked`);
                }

                if (payLoad['failed_numbers'].length){

                    const FailedPort = {
                        customer_id:payLoad.customer_id,
                        customer_name:payLoad.customer_name,
                        job_status:payLoad.job_status,
                        port_status:payLoad.status,
                        port_uuid:payLoad.portin_uuid,
                        order_uuid : order.uuid,
                        order_bulk_id :order.bulkUuid,
                        failed_numbers: JSON.stringify(payLoad.failed_numbers),
                        completed_numbers: JSON.stringify(payLoad.completed_numbers),
                        web_link:payLoad.order_url,
                        create_date:this.currentDate(true, payLoad.create_date),
                        last_update:this.currentDate(true, payLoad.last_update),
                        error:JSON.stringify(payLoad.errors_list),
                        restart_counter:0,
                        done:false,
                        can_restart:true
                    };
                    LNPCollection.SaveFailedOrder(FailedPort, (err, res)=>{
                        if (err) console.info("DB error", err)
                    })
                }else{
                    logger.info(`No failed numbers for order Uuid ${order.uuid}`)
                }


                return callback(false, key, payLoad, job);
            }
            return callback(true, key, payLoad, job);
        });
    }

    NotifyByEmail(token, order, orderPayLoad){

        this.GetFailedActivationJob(token, order, orderPayLoad, (err, key, payLoad, job) => {
            
            if (!err && (payLoad.job_status === 'FAILED' || payLoad['failed_numbers']))
            {   
                if (payLoad.job_status != 'RUNNING' && payLoad['failed_numbers'] && payLoad['failed_numbers'].length > 0)
                {
                    for (let x in payLoad['failed_numbers']) {
                        let number = payLoad['failed_numbers'][x];
                        payLoad['errors'][number] = '';
                    }
                    let job_errors = payLoad['job_errors'];
                    
                    for (let j in job_errors) {
                        let error = job_errors[j];
                        if (payLoad.errors.hasOwnProperty(error.identifier.value)) {
                            payLoad['errors_list'].push(error.identifier.value + ' : ' + error.message);
                        }
                    }
    
                    // send email
                    this.sendEmail({
                        from: 'christian.augustine@8x8.com',
                        to: "gas@8x8.com,LNP-escalations@8x8.com,christian.augustine@8x8.com",
                        //to: "caugustine@8x8.com, steve.ohara@8x8.com,liviu.munteanu@8x8.com,hector.mayorga@8x8.com,andrei.larionescu@8x8.com,neil.lavelle@8x8.com",
                        subject: `Sev 1 - Action required: Customer (${payLoad.customer_name})`,
                        text: "Some Details.",
                        html: this.makeTable(payLoad)
                    });
                }
            } 
            // else {
            //     let failed_numbers, completed_numbers = [];
            //     if (job){
            //         failed_numbers = job.detailedStatus.failed && job.detailedStatus.failed.length ? job.detailedStatus.failed : [];
            //         completed_numbers = job.detailedStatus.completed && job.detailedStatus.completed.length ? job.detailedStatus.completed : [];
            //     }
            //     logger.info(`Order ID: ${order.uuid} \nStatus: ${order.status} \nCompleted List : ${completed_numbers.length} \nFailed List: ${JSON.stringify(failed_numbers)}`);
            // }
        });
    }

    getJobHistory(cb){
        let History ={};
        let lastCreateDate = new Date(new Date().setDate(new Date().getDate() - 60));
        LNPCollection.getFailedJobs({}, (err, res)=>{
            if (!err && res && res.length > 0){
                for (let x =0, l=res.length; x <l; ++x){
                    if (x == 0) lastCreateDate = res[x].last_update
                    if(!History[res[x].order_uuid]){
                        History[res[x].order_uuid] ={
                            port_uuid:res[x].port_uuid,
                            job_status:res[x].job_status
                        }
                    }
                }
            }
            return cb(this.currentDate(false,lastCreateDate), History)
        })
    }
    
    GenerateToken (callback) {
        this.GetToken((error, response, body) => {
            if (error) {
                logger.error("Unable to get SMP token", error, body);
                return;
            }

            const tokenObject = JSON.parse(body);
            return callback(tokenObject.access_token);
        });
    }

    GetPortinsByUUID(token, portin){
        let customerid = portin.customerId;
        let phonenumber = portin.phoneNumbers;
        this.GetCustomer(token, customerid, (err, customerResponse) => {

            if (!err && customerResponse && customerResponse.content) {
                var customer = customerResponse.content[0];

                const payLoad = {
                    customer_id: customerid,
                    customer_name: customer.name,
                    phone: phonenumber,
                    portin_uuid: portin.uuid,
                    status: portin.status,
                    origin: portin.origin,
                    create_date: portin.createdDateTime,
                    last_update: portin.lastUpdatedDateTime,
                    temp_phonenumber: portin.temporaryDid ? portin.temporaryDid.phoneNumber : ''
                };

                this.NotifyByEmail(token, portin, payLoad);
            }
        });
    }

    doNext(token, lastCreateDate, History){
        return (error, body) => {
            
            if (error) {
                throw new Error(error);
            }

            if (body && body.content && body.content.length > 0)
            {
                let content = body.content;

                logger.info("---Found %d portin records", content.length);
                for (var i in content) {
                    const portin = content[i];
                    const orderID = portin.uuid;
                    // Prevent processing multiple order as each DID in an order shares one orderId
                    if (!History[orderID]) {
                        this.GetPortinsByUUID(token, portin);
                    }
                    // Skip
                }

                if (body.nextPageKey){

                    const options = {
                        method: 'GET',
                        url: `${body.nextPageLink}`,
                        headers: {
                            Authorization: `Bearer  ${token}`,
                            'Content-Type': 'application/x-www-form-urlencoded'
                        }
                    }
                    logger.info(`Getting next batch - ${body.nextPageLink}`)
                    this.GET(options, this.doNext(token, lastCreateDate, History));
                }
            } else {
                logger.info("---------- It's good news! No stuck Portins!!! -----------");
            }
        }
    }

    CheckFailedPortin(){
        this.getJobHistory((lastCreateDate, history)=>{
            logger.info(`Checking for failed LNP Port: Last Created Date ${lastCreateDate}`)
            this.GetToken((error, response, body) => {
                if (error) {
                    logger.error("Unable to get SMP token", error, body);
                    return;
                }
                const tokenObject = JSON.parse(body);
                const token = tokenObject.access_token;
    
                const options = {
                    method: 'GET',
                    url: `${APIHOST}/dms/v2/portins`,
                    headers: {
                        Authorization: `Bearer  ${token}`,
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                };
                const query = {
                    pageKey: '0',
                    limit: '200',
                    filter: `status==COMPLETED;lastUpdatedDateTime=ge=${lastCreateDate}T00:00:00`
                };
    
                options.qs = query;
    
                this.GET(options, this.doNext(token,lastCreateDate, history));
            });
        })
    }
}

module.exports = exports = LNPJobs;