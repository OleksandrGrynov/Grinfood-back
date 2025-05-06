// ✅ OOP-реалізація всього сервера в одному файлі

const express = require('express');
const cors = require('cors');
require('dotenv').config();
const admin = require('firebase-admin');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const twilio = require('twilio');
const sgMail = require('@sendgrid/mail');
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_JSON);

const app = express();
const PORT = process.env.PORT || 5000;

// 🔐 Firebase init
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

app.use(cors());
app.use(express.json());

// 📦 FirebaseService
class FirebaseService {
    constructor(adminInstance) {
        this.db = adminInstance.firestore();
        this.auth = adminInstance.auth();
    }
    getDb() {
        return this.db;
    }
    getAuth() {
        return this.auth;
    }
}

// 🧠 Controllers

class BaseController {
    constructor(firebaseService) {
        this.db = firebaseService.getDb();
        this.auth = firebaseService.getAuth();
    }

    async checkToken(req, res) {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            res.status(403).json({ error: 'Немає токену' });
            return null;
        }

        try {
            const decoded = await this.auth.verifyIdToken(token);
            if (!decoded?.uid) {
                res.status(403).json({ error: 'UID не знайдено в токені' });
                return null;
            }
            return decoded.uid;
        } catch (e) {
            console.error('❌ Token verification error:', e.message);
            res.status(403).json({ error: 'Невірний токен' });
            return null;
        }
    }


    async getUserRole(uid) {
        if (!uid) {
            throw new Error('❌ UID не передано в getUserRole');
        }

        const roleDoc = await this.db.collection('roles').doc(uid).get();
        return roleDoc.exists ? roleDoc.data().role : 'user';
    }

}

class StatsController extends BaseController {
    async getPopularProducts(req, res) {
        const uid = await this.checkToken(req, res);
        if (!uid) return;

        const role = await this.getUserRole(uid);
        if (role !== 'manager') return res.status(403).json({ error: 'Недостатньо прав' });

        try {
            const snapshot = await this.db.collection('orders').get();
            const productCount = {};
            snapshot.forEach(doc => {
                const items = doc.data().items || [];
                items.forEach(item => {
                    const name = item.name;
                    productCount[name] = (productCount[name] || 0) + (item.quantity || 1);
                });
            });
            const result = Object.entries(productCount)
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count);
            res.json(result);
        } catch (err) {
            console.error('❌ Error fetching stats:', err);
            res.status(500).json({ error: 'Не вдалося отримати статистику' });
        }
    }
    async getRevenueInPeriod(req, res) {
        const uid = await this.checkToken(req, res);
        if (!uid) return;

        const role = await this.getUserRole(uid);
        if (role !== 'manager') return res.status(403).json({ error: 'Недостатньо прав' });

        const { startDate, endDate } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Потрібні startDate та endDate у форматі YYYY-MM-DD' });
        }

        try {
            // ✅ Примусово встановлюємо час в UTC для точного фільтрування
            const start = admin.firestore.Timestamp.fromDate(new Date(`${startDate}T00:00:00Z`));
            const end = admin.firestore.Timestamp.fromDate(new Date(`${endDate}T23:59:59Z`));

            const snapshot = await this.db.collection('orders')
                .where('createdAt', '>=', start)
                .where('createdAt', '<=', end)
                .where('status', '==', 'confirmed')
                .get();

            let totalRevenue = 0;
            snapshot.forEach(doc => {
                const data = doc.data();
                totalRevenue += data.total || 0;
            });

            res.json({ revenue: totalRevenue });
        } catch (err) {
            console.error('❌ Revenue fetch error:', err);
            res.status(500).json({ error: 'Не вдалося отримати виручку' });
        }
    }


}

class MenuController extends BaseController {
    async getMenuItems(req, res) {
        try {
            const snapshot = await this.db.collection('menuItems').get();
            const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            res.json(items);
        } catch (err) {
            console.error('❌ Error fetching menu:', err);
            res.status(500).json({ error: 'Failed to fetch menu' });
        }
    }

    async addMenuItem(req, res) {
        try {
            const { name, price, image, category, description } = req.body;
            if (!name || !price || !image || !category) {
                return res.status(400).json({ error: 'All fields are required' });
            }
            const docRef = await this.db.collection('menuItems').add({
                name,
                price,
                image,
                category,
                description: description || ''
            });
            res.status(201).json({ id: docRef.id, name, price, image, category, description });
        } catch (err) {
            console.error('❌ Error adding item:', err);
            res.status(500).json({ error: 'Failed to add item' });
        }
    }

    async updateMenuItem(req, res) {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(403).json({ error: 'Немає токену' });
        try {
            const { id } = req.params;
            const { name, price, image, category, description } = req.body;
            await this.db.collection('menuItems').doc(id).update({
                name,
                price,
                image,
                category,
                description: description || ''
            });
            res.json({ message: 'Оновлено' });
        } catch (err) {
            console.error('❌ Menu update error:', err);
            res.status(500).json({ error: 'Помилка оновлення' });
        }
    }

    async deleteMenuItem(req, res) {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(403).json({ error: 'Немає токену' });
        try {
            const { id } = req.params;
            await this.db.collection('menuItems').doc(id).delete();
            res.json({ message: 'Видалено' });
        } catch (err) {
            console.error('❌ Menu delete error:', err);
            res.status(500).json({ error: 'Помилка видалення' });
        }
    }
}




class OrderController extends BaseController {
    async createOrder(req, res) {
        const uid = await this.checkToken(req, res);
        if (!uid) return;

        const { items, total, customer, address, paymentMethod } = req.body;
        if (!items || !total || !customer || !address || !paymentMethod) {
            return res.status(400).json({ error: 'Missing order data' });
        }

        try {
            const order = {
                items,
                total,
                customer,
                address,
                paymentMethod,
                userId: uid,
                createdAt: admin.firestore.Timestamp.now(),
                status: 'pending',
            };
            const docRef = await this.db.collection('orders').add(order);
            res.status(201).json({ id: docRef.id, ...order });
        } catch (error) {
            console.error('❌ Error creating order:', error.message);
            res.status(500).json({ error: error.message || 'Failed to create order' });
        }
    }

    async getOrdersByStatus(req, res) {
        const uid = await this.checkToken(req, res);
        if (!uid) return;

        const role = await this.getUserRole(uid);
        if (role !== 'manager') return res.status(403).json({ error: 'Недостатньо прав' });

        const { status } = req.params;

        try {
            const snapshot = await this.db.collection('orders').where('status', '==', status).get();
            let orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            orders.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
            res.json(orders);
        } catch (err) {
            console.error('❌ Order fetch error:', err);
            res.status(500).json({ error: 'Помилка отримання замовлень' });
        }
    }

    async updateOrderStatus(req, res) {
        const uid = await this.checkToken(req, res);
        if (!uid) return;

        const role = await this.getUserRole(uid);
        if (role !== 'manager') return res.status(403).json({ error: 'Недостатньо прав' });

        const { id } = req.params;
        const { status } = req.body;
        if (!['confirmed', 'cancelled'].includes(status)) {
            return res.status(400).json({ error: 'Недійсний статус' });
        }

        try {
            await this.db.collection('orders').doc(id).update({ status });
            res.json({ message: `Статус замовлення оновлено до \"${status}\"` });
        } catch (err) {
            console.error('❌ Update order error:', err);
            res.status(500).json({ error: 'Помилка оновлення замовлення' });
        }
    }
}







class AuthController extends BaseController {
    async signup(req, res) {
        const { name, email, password, role = 'user' } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Потрібно вказати ім’я, email і пароль' });
        }

        try {
            const userRecord = await this.auth.createUser({ email, password, displayName: name });
            await this.db.collection('roles').doc(userRecord.uid).set({ role });

            const token = await this.auth.createCustomToken(userRecord.uid);
            res.status(201).json({ message: 'User created successfully', user: userRecord, token });
        } catch (error) {
            console.error('❌ Signup error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async signin(req, res) {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email обов’язковий' });

        try {
            const userRecord = await this.auth.getUserByEmail(email);
            const token = await this.auth.createCustomToken(userRecord.uid);
            res.status(200).json({ message: 'User signed in successfully', token });
        } catch (error) {
            console.error('❌ Signin error:', error);
            res.status(400).json({ error: 'Failed to sign in user' });
        }
    }

    async checkAuth(req, res) {
        const uid = await this.checkToken(req, res);
        if (!uid) return;
        res.status(200).json({ message: 'User is authorized', uid });
    }

    async getRole(req, res) {
        const uid = await this.checkToken(req, res);
        if (!uid) return;

        try {
            const role = await this.getUserRole(uid);
            res.json({ role });
        } catch (error) {
            console.error('❌ Get role error:', error);
            res.status(500).json({ error: 'Failed to get role' });
        }
    }

    async updateEmail(req, res) {
        const uid = await this.checkToken(req, res);
        if (!uid) return;

        const { newEmail } = req.body;
        if (!newEmail) return res.status(400).json({ error: 'Не вказана нова пошта' });

        try {
            await this.auth.updateUser(uid, { email: newEmail });
            res.status(200).json({ message: 'Пошта оновлена успішно' });
        } catch (error) {
            console.error('❌ Update email error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async deleteUser(req, res) {
        const uid = await this.checkToken(req, res);
        if (!uid) return;

        try {
            await this.auth.deleteUser(uid);
            await this.db.collection('roles').doc(uid).delete().catch(() => {});
            await this.db.collection('orders').where('userId', '==', uid).get().then(snapshot => {
                snapshot.forEach(doc => doc.ref.delete());
            });
            await this.db.collection('reviews').where('userId', '==', uid).get().then(snapshot => {
                snapshot.forEach(doc => doc.ref.delete());
            });

            res.json({ message: 'Користувача повністю видалено' });
        } catch (error) {
            console.error('❌ Delete user error:', error);
            res.status(500).json({ error: error.message });
        }
    }
}




class PromotionController extends BaseController {
    async createPromotion(req, res) {
        const uid = await this.checkToken(req, res);
        if (!uid) return;

        const role = await this.getUserRole(uid);
        if (role !== 'manager') return res.status(403).json({ error: 'Недостатньо прав' });

        const { title, description, image, startDate, endDate, active } = req.body;
        if (!title || !description || !image || !startDate || !endDate) {
            return res.status(400).json({ error: 'Всі поля обов’язкові' });
        }

        try {
            const docRef = await this.db.collection('promotions').add({
                title,
                description,
                image,
                active: !!active,
                startDate: admin.firestore.Timestamp.fromDate(new Date(startDate)),
                endDate: admin.firestore.Timestamp.fromDate(new Date(endDate)),
                createdAt: admin.firestore.Timestamp.now()
            });
            res.status(201).json({ id: docRef.id });
        } catch (err) {
            console.error('❌ Error adding promotion:', err);
            res.status(500).json({ error: 'Не вдалося додати акцію' });
        }
    }

    async getAllPromotions(req, res) {
        const uid = await this.checkToken(req, res);
        if (!uid) return;

        const role = await this.getUserRole(uid);
        if (role !== 'manager') return res.status(403).json({ error: 'Недостатньо прав' });

        try {
            const snapshot = await this.db.collection('promotions').orderBy('startDate', 'desc').get();
            const promotions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            res.json(promotions);
        } catch (err) {
            console.error('❌ Error fetching promotions:', err);
            res.status(500).json({ error: 'Помилка отримання акцій' });
        }
    }

    async getActivePromotions(req, res) {
        try {
            const now = admin.firestore.Timestamp.now();
            const snapshot = await this.db.collection('promotions')
                .where('active', '==', true)
                .where('startDate', '<=', now)
                .where('endDate', '>=', now)
                .orderBy('startDate', 'desc')
                .get();

            const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            res.json(items);
        } catch (err) {
            console.error('❌ Error fetching active promotions:', err);
            res.status(500).json({ error: 'Помилка отримання акцій' });
        }
    }

    async updatePromotion(req, res) {
        const uid = await this.checkToken(req, res);
        if (!uid) return;

        const role = await this.getUserRole(uid);
        if (role !== 'manager') return res.status(403).json({ error: 'Недостатньо прав' });

        const { id } = req.params;
        const { title, description, image, startDate, endDate, active } = req.body;

        if (!title || !description || !image || !startDate || !endDate) {
            return res.status(400).json({ error: 'Всі поля обов’язкові' });
        }

        try {
            await this.db.collection('promotions').doc(id).update({
                title,
                description,
                image,
                startDate: admin.firestore.Timestamp.fromDate(new Date(startDate)),
                endDate: admin.firestore.Timestamp.fromDate(new Date(endDate)),
                active: !!active
            });
            res.json({ message: 'Акцію оновлено' });
        } catch (err) {
            console.error('❌ Error updating promotion:', err);
            res.status(500).json({ error: 'Не вдалося оновити акцію' });
        }
    }

    async deletePromotion(req, res) {
        const uid = await this.checkToken(req, res);
        if (!uid) return;

        const role = await this.getUserRole(uid);
        if (role !== 'manager') return res.status(403).json({ error: 'Недостатньо прав' });

        try {
            const { id } = req.params;
            await this.db.collection('promotions').doc(id).delete();
            res.json({ message: 'Акцію видалено' });
        } catch (err) {
            console.error('❌ Error deleting promotion:', err);
            res.status(500).json({ error: 'Не вдалося видалити акцію' });
        }
    }
}





class ReviewController extends BaseController {
    async addReview(req, res) {
        const uid = await this.checkToken(req, res);
        if (!uid) return;

        const { comment, ratingMenu, ratingStaff, ratingDelivery } = req.body;

        if (
            typeof ratingMenu !== 'number' ||
            typeof ratingStaff !== 'number' ||
            typeof ratingDelivery !== 'number'
        ) {
            return res.status(400).json({ error: 'Всі оцінки мають бути числами' });
        }

        try {
            const userRecord = await this.auth.getUser(uid);
            const userName = userRecord.displayName || userRecord.email;

            const review = {
                userId: uid,
                userName,
                comment: comment || '',
                ratingMenu,
                ratingStaff,
                ratingDelivery,
                createdAt: admin.firestore.Timestamp.now()
            };

            const docRef = await this.db.collection('reviews').add(review);
            res.status(201).json({ id: docRef.id, ...review });
        } catch (err) {
            console.error('❌ Error adding review:', err);
            res.status(500).json({ error: 'Не вдалося додати відгук' });
        }
    }

    async getReviews(req, res) {
        try {
            const snapshot = await this.db.collection('reviews')
                .orderBy('createdAt', 'desc')
                .get();

            const reviews = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            res.json(reviews);
        } catch (err) {
            console.error('❌ Error fetching reviews:', err);
            res.status(500).json({ error: 'Не вдалося отримати відгуки' });
        }
    }

    async deleteReview(req, res) {
        const uid = await this.checkToken(req, res);
        if (!uid) return;

        const { id } = req.params;

        try {
            const doc = await this.db.collection('reviews').doc(id).get();
            if (!doc.exists) {
                return res.status(404).json({ error: 'Відгук не знайдено' });
            }

            const review = doc.data();
            const isOwner = review.userId === uid;
            const role = await this.getUserRole(uid);
            const isManager = role === 'manager';

            if (!isOwner && !isManager) {
                return res.status(403).json({ error: 'Недостатньо прав для видалення відгуку' });
            }

            await this.db.collection('reviews').doc(id).delete();
            res.json({ message: 'Відгук видалено' });
        } catch (err) {
            console.error('❌ Review delete error:', err);
            res.status(500).json({ error: 'Не вдалося видалити відгук' });
        }
    }
}







class PaymentController extends BaseController {
    async createPaymentIntent(req, res) {
        const uid = await this.checkToken(req, res);
        if (!uid) return;

        const { amount } = req.body;
        if (!amount) return res.status(400).json({ error: 'Amount is required' });

        try {
            const paymentIntent = await stripe.paymentIntents.create({
                amount,
                currency: 'uah',
                payment_method_types: ['card'],
            });
            res.send({ clientSecret: paymentIntent.client_secret });
        } catch (err) {
            console.error('❌ Error creating payment intent:', err.message);
            res.status(500).json({ error: err.message || 'Failed to create payment intent' });
        }
    }
}





class VerificationController {
    async sendOtp(req, res) {
        const { phone } = req.body;
        if (!phone) return res.status(400).json({ error: 'Missing phone number' });

        try {
            const verification = await client.verify.v2
                .services(process.env.TWILIO_VERIFY_SERVICE_SID)
                .verifications.create({ to: phone, channel: 'sms' });
            res.json({ success: true, status: verification.status });
        } catch (err) {
            console.error('❌ Send OTP error:', err.message);
            res.status(500).json({ error: err.message });
        }
    }

    async verifyOtp(req, res) {
        const { phone, code } = req.body;
        if (!phone || !code) return res.status(400).json({ error: 'Missing phone or code' });

        try {
            const check = await client.verify.v2
                .services(process.env.TWILIO_VERIFY_SERVICE_SID)
                .verificationChecks.create({ to: phone, code });
            res.json({ success: check.status === 'approved', status: check.status });
        } catch (err) {
            console.error('❌ Verify OTP error:', err.message);
            res.status(500).json({ error: err.message });
        }
    }
}







class EmailController extends BaseController {
    async forgotPassword(req, res) {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Пошта обов’язкова' });

        try {
            const resetLink = await this.auth.generatePasswordResetLink(email, {
                url: process.env.RESET_REDIRECT_URL || 'https://grinfood-c34ac.web.app/reset-password',
            });

            const msg = {
                to: email,
                from: process.env.SENDGRID_FROM_EMAIL,
                subject: '🔐 Скидання пароля до GrinFood',
                html: `Натисніть, щоб скинути пароль: <a href="${resetLink}">Скинути</a>`
            };
            await sgMail.send(msg);
            res.status(200).json({ message: '📩 Лист зі скиданням пароля надіслано' });
        } catch (error) {
            console.error('❌ SendGrid Error:', error.message);
            res.status(500).json({ error: 'Не вдалося надіслати лист' });
        }
    }

    async sendVerificationEmail(req, res) {
        const { email, uid } = req.body;
        if (!email || !uid) return res.status(400).json({ error: 'Необхідно вказати email та uid' });

        try {
            const link = await this.auth.generateEmailVerificationLink(email, {
                url: `${process.env.APP_BASE_URL}/profile`,
                handleCodeInApp: false
            });

            const msg = {
                to: email,
                from: process.env.SENDGRID_FROM_EMAIL,
                subject: '🔐 Підтвердження пошти GrinFood',
                html: `Підтвердити пошту: <a href="${link}">Натисни тут</a>`
            };
            await sgMail.send(msg);
            res.json({ success: true });
        } catch (error) {
            console.error('❌ Error sending verification email:', error);
            res.status(500).json({ error: 'Не вдалося надіслати лист' });
        }
    }

    async notifyProfileUpdated(req, res) {
        const { email, name } = req.body;
        if (!email || !name) return res.status(400).json({ error: 'email і name обов’язкові' });

        const msg = {
            to: email,
            from: process.env.SENDGRID_FROM_EMAIL,
            subject: '✅ Ваш профіль GrinFood оновлено',
            html: `<p>Привіт, <strong>${name}</strong>! Ваш профіль оновлено.</p>`
        };

        try {
            await sgMail.send(msg);
            res.json({ success: true });
        } catch (error) {
            console.error('❌ Notify error:', error.message);
            res.status(500).json({ error: 'Не вдалося надіслати повідомлення' });
        }
    }

    async checkEmailVerified(req, res) {
        try {
            const user = await this.auth.getUser(req.params.uid);
            res.json({ email: user.email, emailVerified: user.emailVerified });
        } catch (error) {
            console.error('❌ Email verify check error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async checkUserExists(req, res) {
        const uid = await this.checkToken(req, res);
        if (!uid) return;

        try {
            const user = await this.auth.getUser(uid);
            if (!user.email) return res.status(404).json({ error: 'User not registered' });

            const roleDoc = await this.db.collection('roles').doc(uid).get();
            if (!roleDoc.exists) return res.status(404).json({ error: 'User role not found' });

            res.json({ exists: true });
        } catch (error) {
            console.error('❌ User existence check error:', error);
            res.status(500).json({ error: 'User not found' });
        }
    }

    async checkUserByEmail(req, res) {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Пошта обов’язкова' });

        try {
            await this.auth.getUserByEmail(email);
            res.json({ exists: true });
        } catch (err) {
            res.status(404).json({ error: 'Користувача не знайдено' });
        }
    }

    async getUserName(req, res) {
        try {
            const user = await this.auth.getUser(req.params.uid);
            res.json({ name: user.displayName || user.email });
        } catch (err) {
            res.status(404).json({ name: 'Анонім' });
        }
    }
}








// Ініціалізація сервісів і контролерів
const firebaseService = new FirebaseService(admin);
const statsController = new StatsController(firebaseService);
const menuController = new MenuController(firebaseService);
const orderController = new OrderController(firebaseService);
const authController = new AuthController(firebaseService);
const promotionController = new PromotionController(firebaseService);
const reviewController = new ReviewController(firebaseService);
const paymentController = new PaymentController(firebaseService);
const verificationController = new VerificationController();
const emailController = new EmailController(firebaseService);


// 📌 Роутинг (тільки частина прикладна)
app.get('/', (req, res) => res.send('Grinfood API is working ✅'));
app.get('/api/stats/popular-products', (req, res) => statsController.getPopularProducts(req, res));
app.get('/api/menu', (req, res) => menuController.getMenuItems(req, res));
app.post('/api/menu', (req, res) => menuController.addMenuItem(req, res));
app.put('/api/menu/:id', (req, res) => menuController.updateMenuItem(req, res));
app.delete('/api/menu/:id', (req, res) => menuController.deleteMenuItem(req, res));
app.post('/api/orders', (req, res) => orderController.createOrder(req, res));
app.get('/api/orders/by-status/:status', (req, res) => orderController.getOrdersByStatus(req, res));
app.patch('/api/orders/:id/status', (req, res) => orderController.updateOrderStatus(req, res));
app.post('/api/signup', (req, res) => authController.signup(req, res));
app.post('/api/signin', (req, res) => authController.signin(req, res));
app.get('/api/check-auth', (req, res) => authController.checkAuth(req, res));
app.get('/api/get-role', (req, res) => authController.getRole(req, res));
app.post('/api/update-email', (req, res) => authController.updateEmail(req, res));
app.post('/api/delete-user', (req, res) => authController.deleteUser(req, res));
app.post('/api/promotions', (req, res) => promotionController.createPromotion(req, res));
app.get('/api/promotions/all', (req, res) => promotionController.getAllPromotions(req, res));
app.get('/api/promotions', (req, res) => promotionController.getActivePromotions(req, res));
app.put('/api/promotions/:id', (req, res) => promotionController.updatePromotion(req, res));
app.delete('/api/promotions/:id', (req, res) => promotionController.deletePromotion(req, res));
app.post('/api/reviews', (req, res) => reviewController.addReview(req, res));
app.get('/api/reviews', (req, res) => reviewController.getReviews(req, res));
app.delete('/api/reviews/:id', (req, res) => reviewController.deleteReview(req, res));
app.post('/api/create-payment-intent', (req, res) => paymentController.createPaymentIntent(req, res));
app.post('/api/verify/send-otp', (req, res) => verificationController.sendOtp(req, res));
app.post('/api/verify/verify-otp', (req, res) => verificationController.verifyOtp(req, res));
app.post('/api/forgot-password', (req, res) => emailController.forgotPassword(req, res));
app.post('/api/send-verification-email', (req, res) => emailController.sendVerificationEmail(req, res));
app.post('/api/notify-profile-updated', (req, res) => emailController.notifyProfileUpdated(req, res));
app.get('/api/check-email-verified/:uid', (req, res) => emailController.checkEmailVerified(req, res));
app.get('/api/check-user-exists', (req, res) => emailController.checkUserExists(req, res));
app.post('/api/check-user-by-email', (req, res) => emailController.checkUserByEmail(req, res));
app.get('/api/user/:uid', (req, res) => emailController.getUserName(req, res));
app.get('/api/stats/revenue', (req, res) => statsController.getRevenueInPeriod(req, res));




// ✅ Запуск сервера
app.listen(PORT, () => {
    console.log(`✅ Server is running at http://localhost:${PORT}`);
});
