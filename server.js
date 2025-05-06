require('dotenv').config();
const express = require('express');
const cors = require('cors');

// 🛠 Імпортуємо сервіси
const FirebaseService = require('./services/FirebaseService');
const StripeService = require('./services/StripeService');
const TwilioService = require('./services/TwilioService');
const EmailService = require('./services/EmailService');

// 🛠 Імпортуємо контролери
const AuthController = require('./controllers/AuthController');
const MenuController = require('./controllers/MenuController');
const OrderController = require('./controllers/OrderController');
const PromotionController = require('./controllers/PromotionController');
const ReviewController = require('./controllers/ReviewController');
const VerifyController = require('./controllers/VerifyController');
const UserController = require('./controllers/UserController');

// 🛠 Імпортуємо роутери
const createAuthRoutes = require('./routes/authRoutes');
const createMenuRoutes = require('./routes/menuRoutes');
const createOrderRoutes = require('./routes/orderRoutes');
const createPromotionRoutes = require('./routes/promotionRoutes');
const createReviewRoutes = require('./routes/reviewRoutes');
const createVerifyRoutes = require('./routes/verifyRoutes');
const createUserRoutes = require('./routes/userRoutes');

// 🔐 Firebase init
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_JSON);
const firebaseService = new FirebaseService(serviceAccount);

// 💳 Stripe init
const stripeService = new StripeService(process.env.STRIPE_SECRET_KEY);

// 📲 Twilio init
const twilioService = new TwilioService();

// 📧 Email (SendGrid)
const emailService = new EmailService();

const app = express();
const PORT = process.env.PORT || 5000;


app.use(cors({
    origin: ['https://grinfood-c34ac.web.app'], // або '*', якщо для всіх
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));

// 🧩 Middleware
app.use(cors());
app.use(express.json());

// 🚀 API routes
app.use('/api/auth', createAuthRoutes(new AuthController(firebaseService, emailService)));
app.use('/api/menu', createMenuRoutes(new MenuController(firebaseService.getDb())));
app.use('/api/orders', createOrderRoutes(new OrderController(firebaseService, stripeService)));
app.use('/api/promotions', createPromotionRoutes(new PromotionController(firebaseService)));
app.use('/api/reviews', createReviewRoutes(new ReviewController(firebaseService)));
app.use('/api/verify', createVerifyRoutes(new VerifyController(twilioService)));
app.use('/api/user', createUserRoutes(new UserController(firebaseService)));

// 🏠 Головна
app.get('/', (_, res) => {
    res.send('Grinfood API is working ✅');
});

// ✅ Запуск
app.listen(PORT, () => {
    console.log(`✅ Server is running at http://localhost:${PORT}`);
});
