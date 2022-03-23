/* 
 * @author      Christian Augustine
 * @DATE        24/01/2022
 * @description LNP collection.
 */

const CONF = require('../Config/config');
const Mongoose = require('mongoose');
const Schema = Mongoose.Schema;

const LNPSchema = new Schema(
    {
        customer_id:{type:String, required:true},
        customer_name:{type:String, required:true},
        job_status:{type:String, required:true},
        port_status:{type:String, required:true},
        port_uuid:{type:String, required:true, unique:true},
        order_uuid:{type:String, required:true, unique:true},
        order_bulk_id:{type:String, index:true},
        failed_numbers:String,
        completed_numbers:String,
        web_link:String,
        create_date:Date,
        last_update:Date,
        local_update:{type:Date, default:Date.now()},
        last_restart_date:Date,
        error:String,
        restart_counter:Number,
        done:Boolean,
        can_restart:Boolean
    },
    {
        collection: 'LNPPortJobs'
    }
)
module.exports = exports = Mongoose.model('LNPPortJobs', LNPSchema);