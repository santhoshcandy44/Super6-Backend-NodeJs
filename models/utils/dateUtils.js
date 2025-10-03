const moment = require('moment');

const formatToMySQLDate = (millis) => {
    if (!millis) return null; 
    return moment(millis).format('YYYY-MM-DD');
};

const formatMySQLDateToInitialCheckAt = (date) => {
    if (!date) return null; 
    return moment(millis).format('YYYY-MM-DD HH:mm:ss');
};

module.exports = {
    formatToMySQLDate,
    formatMySQLDateToInitialCheckAt
}