const CONF = require('../Config/config');
const fs = require('fs');
const {createLogger, format, transports} = require('winston');
const rotate = require('winston-daily-rotate-file');

const LogDir = CONF.log_path;

if (!fs.existsSync(LogDir)) {
    fs.mkdirSync(LogDir);
}

const {combine, timestamp, label, prettyPrint, printf, colorize, splat} = format;
const myFormat = printf(info => {
    return `${info.timestamp} [${info.label}] ${info.level}: ${info.message}`;
});

const logLabel = 'SMP Job Server';

const logger = createLogger({
    format: combine(
                label({label: logLabel}),
                colorize(),
                splat(),
                timestamp(),
                myFormat
            ),
    transports: [
        new transports.Console({
            json: false, // setting json = false prevent outputting json object to log
            timestamp: true
        }), 
        new transports.File({
            json: true,
            filename: `${LogDir}/${CONF.logFileName}`
        }),
        new transports.DailyRotateFile({
            filename: CONF.logFileName,
            dirname: LogDir,
            maxsize: 20971520, //20MB
            maxFiles: 25,
            datePattern: '.yyyy-MM-dd'
        }),
        new transports.DailyRotateFile({
            filename: CONF.execptionFile,
            dirname: LogDir,
            maxsize: 20971520, //20MB
            maxFiles: 25,
            datePattern: '.yyyy-MM-dd'
        })
    ],
    exceptionHandlers: [
        new transports.Console({json: false, timestamp: true, handleExceptions: true, humanReadableUnhandledException: true}),
        new transports.File({filename: `${CONF.log_path}/${CONF.execptionFile}`, json: true, humanReadableUnhandledException: true, handleExceptions: true})
    ],
    exitOnError: false
});

module.exports = logger;
//export default logger