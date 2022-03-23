


const LNPCollection = require('../Model/LNPFailedJobs');
const logger = require('../utils/app-logger');


const Controller = {}

Controller.getJobByOrderId = (order_uuid) =>{
    return LNPCollection.find({order_uuid:order_uuid}, cb)
}

Controller.getFailedJobs = (filter) =>{
    if(!filter) filter = {}
    return LNPCollection.find(filter, cb)
}

Controller.SaveFailedOrder = (order,cb) => {
    let newOrder= new LNPCollection(order);
    return newOrder.save(cb)
}

module.exports = exports = Controller;