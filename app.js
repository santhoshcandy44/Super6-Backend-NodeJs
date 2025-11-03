const express = require('express');
const session = require('express-session');
const cors = require('cors');

const rateLimitRoutes = require('./routes/security/rateLimiter');

const authRoutes = require('./routes/authRoutes');
const profileProtectedAppRoutes = require('./routes/profileProtectedAppRoutes');
const protectedAppRoutes = require('./routes/appProtectedRoutes');
const serviceProtectedAppRoutes = require('./routes/serviceProtectedAppRoutes');
const usedProtectProtectedAppRoutes = require('./routes/usedProductsProtectedAppRoutes');
const localJobProtectedAppRoutes = require('./routes/localJobsProtectedAppRoutes.js');
const jobProtectedAppRoutes = require('./routes/jobProtectedAppRoutes');

const accountSettingsProtectedRoutes = require('./routes/accountSettingsProtectedAppRoutes');
const industriesSettingsProtectedRoutes = require('./routes/industriesSettingsProtectedAppRoutes');
const boardsSettingsProtectedRoutes = require('./routes/boardsSettingsProtectedAppRoutes');

const mediaStreamingRoutes = require('./routes/media/mediaStreaming')
const imagesStreamingRoutes = require('./routes/media/imagesStreaming')
const uploadsStreamingRoutes = require('./routes/media/uploadsStreaming');

const { SESSION_SECRET, NODE_ENV} = require('./config/config.js');

const app = express();
const port = 3000;

app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: NODE_ENV === 'production',
        httpOnly: true
    }
}));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const allowedOrigins = [
    'https://api.lts360.com',
    'https://ucontent.lts360.com',
    'http://localhost:3000',
];

const corsOptions = {
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));

app.use('/api/auth-app/ip-country', rateLimitRoutes);

app.use('/api/auth', authRoutes);
app.use('/api/app/serve/services', serviceProtectedAppRoutes); 
app.use('/api/app/serve/used-product-listings', usedProtectProtectedAppRoutes); 
app.use('/api/app/serve/local-jobs', localJobProtectedAppRoutes); 
app.use('/api/app/serve/jobs', jobProtectedAppRoutes); 
app.use('/api/serve/profile', profileProtectedAppRoutes);
app.use('/api/app/serve', protectedAppRoutes);
app.use('/api/app/serve/account-settings', accountSettingsProtectedRoutes); 
app.use('/api/app/serve/industries-settings', industriesSettingsProtectedRoutes);
app.use('/api/app/serve/boards-settings', boardsSettingsProtectedRoutes);

app.use('/media', mediaStreamingRoutes)
app.use('/images', imagesStreamingRoutes)
app.use('/uploads', uploadsStreamingRoutes)


app.get('/', (req, res) => {
    res.status(403).send('Access forbidden');
});

app.listen(port, async () => {
    console.log(`Server is running on http://localhost:${port}`);
});