// db.js
const mysql = require('mysql2');
const { DATABASE_URL, DATABASE_USERNAME, DATABASE_PASSWORD, JOB_DATABASE_NAME } = require('./config');

// const pool = mysql.createPool({
//     host: 'localhost', 
//     port:3307,
//     user: 'root',
//     password: '',
//     database: 'lts360_jobs', 
// });

const pool = mysql.createPool({
    host: DATABASE_URL,
    user: DATABASE_USERNAME,
    password: DATABASE_PASSWORD, 
    database: JOB_DATABASE_NAME, 
    charset: 'utf8mb4' 
});   

module.exports = pool.promise();