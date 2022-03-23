'use strict';


var CONFIG = function (){
return {
        db_host: 'mongodb://tc-lv-supportbitools-01.int.dxi.eu:27017/support',
        mongo_host: '@tc-lv-supportbitools-01.int.dxi.eu:27017/support',
        mongodb_host: "tc-lv-supportbitools-01.int.dxi.eu:27017",
        db_user: 'support_tool',
        db_pass: 'PASS',
        db_options: {
            native_parser: true,
            user: 'support_tool',
            pass: 'PASS',
            poolSize: 10,
            ssl: false,
            sslValidate: false,
            keepAlive: 3000000,
            connectTimeoutMS: 30000,
            useNewUrlParser: true,
            useUnifiedTopology: true
        },
        authKey:"",//SMP TOKEN
        SSOHOST: 'https://sso.8x8.com/oauth2/v1/token',
        SSOAUTHHOST: 'sso.8x8.com',
        APIHOST: 'https://platform.8x8.com',
        mail_config: {
            host: 'smtp.gmail.com',
            port: 465,
            secure: true, // use SSL
            auth: {
                user: 'YOUR EMAIL',
                pass: 'PASS' // https://myaccount.google.com/u/0/apppasswords?rapt=AEjHL4NGHfTJflJsnaMnGTm4yWC1xvgv1cF89xAB0hUd5_scjBNZVoCeY_IfmFiCtpxushis3L2W130R49jrVu39lo0qsgTI8Q            
            }
        },
        server_port : 8080,
        host : 'localhost',
        redis_host  :  'localhost',
        redis_port  :  6379,
        log_path    : '/tmp',
        debug       : false,
        ttl         : 28800,
        test_mode   : true,
        logFileName : 'log.log',
        execptionFile : 'exceptions.log',
        sessionPrefix:'sesssess',
        DEBUG:true
    }
    
}();
module.exports = CONFIG;