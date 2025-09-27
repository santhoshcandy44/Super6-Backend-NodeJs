const moment = require('moment');

const formatToMySQLDate = (millis) => {
    if (!millis) return null; 
    return moment(millis).format('YYYY-MM-DD');
};

module.exports = {
    formatToMySQLDate
}