/* 
 * @author      Christian Augustine
 * @DATE        22/03/2022
 * @description Server
 */


const CONFIG = require('./src/Config/config');
const mailerTransport = require('nodemailer');
const redis = require("redis");
const Logger = require('winston');
const mongoose = require('mongoose');
const fs = require('fs');
const Agenda = require('agenda');

const {createLogger, format, transports} = require('winston');
const {combine, timestamp, label, prettyPrint, printf, colorize, splat} = format;

mongoose.Promise = global.Promise;
mongoose.set('useCreateIndex', true);
mongoose.set('useUnifiedTopology', true);
mongoose.connect(CONFIG.db_host, CONFIG.db_options);
//mongodb.createConnection(CONFIG.db_host, { db: { safe: true } });


const myFormat = printf(info => {
    return `${info.timestamp} [${info.label}] ${info.level}: ${info.message}`;
});

const logger = createLogger({
    format: combine(
            label({label: 'SMP JOB'}),
            colorize(),
            splat(),
            timestamp(),
            myFormat
            ),
    transports: [
        new transports.Console({json: false, timestamp: true}), // setting json = false prevent outputting json object to log
        new transports.File({filename: CONFIG.log_path + '/log.log', json: true})
    ],
    exceptionHandlers: [
        new transports.Console({json: false, timestamp: true, handleExceptions: true, humanReadableUnhandledException: true}),
        new transports.File({filename: CONFIG.log_path + '/exceptions.log', json: true, humanReadableUnhandledException: true, handleExceptions: true})
    ],
    exitOnError: false
});

logger.info('Starting log');

var agenda = new Agenda({db: {address: "mongodb://" + CONFIG.db_user + ':' + CONFIG.db_pass + CONFIG.mongo_host, collection: 'agendaJobs'}});


const redisClient = redis.createClient(CONFIG.redis_port, CONFIG.redis_host);

var smtpConfig = CONFIG.mail_config;
//var smtpConfig = {port: 25};

const mailTransporter = mailerTransport.createTransport(smtpConfig);

const PortinController = require('./src/Controllers/FailedLNPJobs');

const JobController = new PortinController(redisClient, mailTransporter, fs);


//JobController.CheckFailedPortin('2022-02-11');

agenda.define('Scan SMP Failed Portins', (job, done) =>{
   JobController.CheckFailedPortin();
   done();
});

agenda.on('ready', function () {
   logger.info('---starting Agenda Jobs---');
   agenda.start();
   agenda.every('1 hour', 'Scan SMP Failed Portins');
});


// Print message to scren on manual shutdown.
process.on('SIGINT', function () {
    // Gracefully stop all agenda jobs on process.kil
    agenda.stop(function () {});

    logger.info('Ctrl-c Command detetcted. PROCESS PID [%d]. THIS SERVER IS NOW SHUTTING DOWN... in 3 seconda!', process.pid);
    setTimeout(function () {
        logger.warn('SERVER IS NOW DOWN... Goodbye!', process.pid);
        process.exit(0);
    }, 3000);
});

process.on('SIGTERM', function () {
    // Gracefully stop all agenda jobs on process.kil
    agenda.stop(function () {});

    logger.info('Ctrl-c Command detetcted. PROCESS PID [%d]. THIS SERVER IS NOW SHUTTING DOWN... in 3 seconda!', process.pid);
    setTimeout(function () {
        logger.warn('SERVER IS NOW DOWN... Goodbye!', process.pid);
        process.exit(0);
    }, 3000);
});