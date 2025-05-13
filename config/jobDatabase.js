// db.js
const mysql = require('mysql2');
const { DATABASE_URL, DATABASE_USERNAME, DATABASE_PASSWORD, JOB_DATABASE_NAME } = require('./config');

const pool = mysql.createPool({
    host: 'localhost', // your database host
    port:3307,
    user: 'root', // default XAMPP MySQL username
    password: '', // default XAMPP MySQL password (usually empty)
    database: 'lts360_jobs', // replace with your actual database name
});


// const pool = mysql.createPool({
//     host: DATABASE_URL, // your database host
//     user: DATABASE_USERNAME, // default XAMPP MySQL username
//     password: DATABASE_PASSWORD, // default XAMPP MySQL password (usually empty)
//     database: JOB_DATABASE_NAME, // replace with your actual database name
//     charset: 'utf8mb4' // This sets the character set to utf8mb4

// });   




module.exports = pool.promise(); // Use promise-based queries
