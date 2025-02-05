// db.js
const mysql = require('mysql2');

// const pool = mysql.createPool({
//     host: 'localhost', // your database host
//     user: 'root', // default XAMPP MySQL username
//     password: '', // default XAMPP MySQL password (usually empty)
//     database: 'super6_test', // replace with your actual database name
// });


const pool = mysql.createPool({
    host: 'app-database-mariadb.cp0aumiwgnc1.ap-south-1.rds.amazonaws.com', // your database host
    user: 'admin', // default XAMPP MySQL username
    password: 'a*58cSG%x5Y4*Tn62e&zp7pT', // default XAMPP MySQL password (usually empty)
    database: 'super6_test', // replace with your actual database name
});   


module.exports = pool.promise(); // Use promise-based queries
