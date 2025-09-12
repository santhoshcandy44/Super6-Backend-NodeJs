const mysql = require('mysql2');
const { DATABASE_URL, DATABASE_USERNAME, DATABASE_PASSWORD, DATABASE_NAME } = require('./config');

// const pool = mysql.createPool({
//     host: 'localhost', 
//     user: 'root',
//     password: '', 
//     database: 'super6_test'
// });

const pool = mysql.createPool({
    host: DATABASE_URL, 
    user: DATABASE_USERNAME, 
    password: DATABASE_PASSWORD, 
    database: DATABASE_NAME, 
    charset: 'utf8mb4'
});   

module.exports = pool.promise(); 