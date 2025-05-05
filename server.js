const express = require('express');
const cors = require('cors');
require('dotenv').config();
const admin = require('firebase-admin');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_JSON);

const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const router = express.Router();
const { OpenAI } = require('openai');
const app = express();
const PORT = process.env.PORT || 5000;
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// 🧩 Middleware
app.use(cors());
app.use(express.json());

// 🔐 Firebase init
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

// 🏠 Головна
app.get('/', (req, res) => {
    res.send('Grinfood API is working ✅');
});

// 🍔 Отримати всі позиції меню
app.get('/api/menu', async (req, res) => {
    try {
        const snapshot = await db.collection('menuItems').get();
        const items = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        res.json(items);
    } catch (error) {
        console.error('❌ Error fetching menu:', error);
        res.status(500).json({ error: 'Failed to fetch menu' });
    }
});

// ➕ Додати позицію меню
app.post('/api/menu', async (req, res) => {
    try {
        const { name, price, image, category, description } = req.body;

        if (!name || !price || !image || !category) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        const docRef = await db.collection('menuItems').add({
            name,
            price,
            image,
            category,
            description: description || '' // Додаємо опис
        });

        res.status(201).json({ id: docRef.id, name, price, image, category, description });
    } catch (error) {
        console.error('❌ Error adding item:', error);
        res.status(500).json({ error: 'Failed to add item' });
    }
});



app.post('/api/orders', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(403).json({ error: 'Невірний токен авторизації' });
    }

    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        const userId = decodedToken.uid;

        const { items, total, customer, address, paymentMethod } = req.body;

        if (!items || !total || !customer || !address || !paymentMethod) {
            return res.status(400).json({ error: 'Missing order data' });
        }

        const order = {
            items,
            total,
            customer,
            address,
            paymentMethod,
            userId,
            createdAt: admin.firestore.Timestamp.now(),

            status: 'pending',
        };

        const docRef = await db.collection('orders').add(order);
        res.status(201).json({ id: docRef.id, ...order });
    } catch (error) {
        console.error('❌ Error creating order:', error.message);
        res.status(500).json({ error: error.message || 'Failed to create order' });
    }
});


// 💳 Створити платежний намір через Stripe
app.post('/api/create-payment-intent', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(403).json({ error: 'Невірний токен авторизації' });
    }

    try {
        await admin.auth().verifyIdToken(token);
        const { amount } = req.body;

        const paymentIntent = await stripe.paymentIntents.create({
            amount,
            currency: 'uah',
            payment_method_types: ['card'],
        });

        res.send({ clientSecret: paymentIntent.client_secret });
    } catch (error) {
        console.error('❌ Error creating payment intent:', error.message);
        res.status(500).json({ error: error.message || 'Failed to create payment intent' });
    }
});

// ✅ Реєстрація користувача
app.post('/api/signup', async (req, res) => {
    const { name, email, password, role = 'user' } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Потрібно вказати ім’я, email і пароль' });
    }

    try {
        // Створення користувача
        const userRecord = await admin.auth().createUser({
            email,
            password,
            displayName: name
        });

        console.log("🟢 Користувач створений:", userRecord.uid);

        // Запис ролі у Firestore
        const roleRef = db.collection('roles').doc(userRecord.uid);
        await roleRef.set({ role });

        const writtenRole = await roleRef.get();
        if (!writtenRole.exists) {
            throw new Error("❗Роль не збереглась у Firestore");
        }

        console.log("📄 Роль збережена:", writtenRole.data());

        // Генерація токена
        const token = await admin.auth().createCustomToken(userRecord.uid);

        return res.status(201).json({
            message: 'User created successfully',
            user: userRecord,
            token: token
        });
    } catch (error) {
        console.error('❌ Помилка під час реєстрації користувача:', error);
        return res.status(500).json({ error: error.message || 'Failed to register user' });
    }
});



// Вхід користувача
app.post('/api/signin', async (req, res) => {
    const { email, password } = req.body;

    try {
        const userRecord = await admin.auth().getUserByEmail(email);
        const token = await admin.auth().createCustomToken(userRecord.uid);

        res.status(200).json({ message: 'User signed in successfully', token });
    } catch (error) {
        console.error('❌ Error signing in user:', error);
        res.status(400).json({ error: 'Failed to sign in user' });
    }
});

// Перевірка користувача
app.get('/api/check-auth', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(403).json({ error: 'No token provided' });
    }

    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        const uid = decodedToken.uid;

        res.status(200).json({ message: 'User is authorized', uid });
    } catch (error) {
        console.error('❌ Error verifying token:', error);
        res.status(403).json({ error: 'Invalid token' });
    }
});

// 🔥 Оновлення email користувача через бекенд
app.post('/api/update-email', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(403).json({ error: 'Немає токену авторизації' });
    }

    const { newEmail } = req.body;

    if (!newEmail) {
        return res.status(400).json({ error: 'Не вказана нова пошта' });
    }

    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        const uid = decodedToken.uid;

        await admin.auth().updateUser(uid, {
            email: newEmail
        });
        console.log(`📧 Updating user ${uid} email to ${newEmail}`);

        return res.status(200).json({ message: 'Пошта оновлена успішно' });
    } catch (error) {
        console.error('❌ Error updating email:', error);
        return res.status(500).json({ error: error.message || 'Помилка оновлення email' });
    }
});

// 🆕 Отримати роль користувача
app.get('/api/get-role', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(403).json({ error: 'No token provided' });

    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        const uid = decodedToken.uid;

        console.log(`📝 Отримання ролі для користувача ${uid}`);

        const roleDoc = await db.collection('roles').doc(uid).get();

        if (!roleDoc.exists) {
            return res.json({ role: 'user' });
        }

        return res.json({ role: roleDoc.data().role || 'user' });
    } catch (error) {
        console.error('❌ Error getting role:', error);
        return res.status(500).json({ error: 'Failed to get role' });
    }
});

// 🧾 Отримати замовлення за статусом (pending / confirmed)
app.get('/api/orders/by-status/:status', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { status } = req.params;

    if (!token) return res.status(403).json({ error: 'Немає токену' });

    try {
        const decoded = await admin.auth().verifyIdToken(token);
        const uid = decoded.uid;

        const roleDoc = await db.collection('roles').doc(uid).get();
        if (!roleDoc.exists || roleDoc.data().role !== 'manager') {
            return res.status(403).json({ error: 'Недостатньо прав' });
        }

        const snapshot = await db.collection('orders')
            .where('status', '==', status)
            .get();

        let orders = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        // 🕐 Ручне сортування за createdAt ↓
        orders = orders.sort((a, b) => {
            const aTime = a.createdAt?.toMillis?.() || 0;
            const bTime = b.createdAt?.toMillis?.() || 0;
            return bTime - aTime;
        });

        res.json(orders);
    } catch (err) {
        console.error('❌ Order fetch error:', err);
        res.status(500).json({ error: 'Помилка отримання замовлень' });
    }
});



// 🔄 Оновити статус замовлення (тільки для менеджера)
app.patch('/api/orders/:id/status', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { id } = req.params;
    const { status } = req.body;

    if (!token) return res.status(403).json({ error: 'Немає токену' });
    if (!['confirmed', 'cancelled'].includes(status)) {
        return res.status(400).json({ error: 'Недійсний статус' });
    }

    try {
        const decoded = await admin.auth().verifyIdToken(token);
        const uid = decoded.uid;

        const roleDoc = await db.collection('roles').doc(uid).get();
        if (!roleDoc.exists || roleDoc.data().role !== 'manager') {
            return res.status(403).json({ error: 'Недостатньо прав' });
        }

        await db.collection('orders').doc(id).update({ status });

        res.json({ message: `Статус замовлення оновлено до "${status}"` });
    } catch (err) {
        console.error('❌ Update order error:', err);
        res.status(500).json({ error: 'Помилка оновлення замовлення' });
    }
});




// 📝 Оновити пункт меню
app.put('/api/menu/:id', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(403).json({ error: 'Немає токену' });

    try {
        const { id } = req.params;
        const { name, price, image, category, description } = req.body;

        await db.collection('menuItems').doc(id).update({
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
});



// ❌ Видалити пункт меню
app.delete('/api/menu/:id', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(403).json({ error: 'Немає токену' });

    try {
        const { id } = req.params;
        await db.collection('menuItems').doc(id).delete();
        res.json({ message: 'Видалено' });
    } catch (err) {
        console.error('❌ Menu delete error:', err);
        res.status(500).json({ error: 'Помилка видалення' });
    }
});





// 📣 Роутери для акцій (promotions)

// ➕ Створити акцію
app.post('/api/promotions', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(403).json({ error: 'Немає токену' });

    try {
        const decoded = await admin.auth().verifyIdToken(token);
        const uid = decoded.uid;
        const roleDoc = await db.collection('roles').doc(uid).get();

        if (!roleDoc.exists || roleDoc.data().role !== 'manager') {
            return res.status(403).json({ error: 'Недостатньо прав' });
        }

        const { title, description, image, startDate, endDate, active } = req.body;

        console.log('📥 Отримано тіло запиту на створення акції:', req.body);

        if (!title || !description || !image || !startDate || !endDate) {
            return res.status(400).json({ error: 'Всі поля обов’язкові' });
        }

        const docRef = await db.collection('promotions').add({
            title,
            description,
            image,
            active: !!active,
            startDate: admin.firestore.Timestamp.fromDate(new Date(startDate)),
            endDate: admin.firestore.Timestamp.fromDate(new Date(endDate)),
            createdAt: admin.firestore.Timestamp.now()
        });

        console.log('✅ Акцію створено з ID:', docRef.id);

        res.status(201).json({ id: docRef.id });
    } catch (err) {
        console.error('❌ Error adding promotion:', err);
        res.status(500).json({ error: 'Не вдалося додати акцію' });
    }
});

// 🔐 Отримати всі акції (для менеджера)
app.get('/api/promotions/all', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(403).json({ error: 'Немає токену' });

    try {
        const decoded = await admin.auth().verifyIdToken(token);
        const uid = decoded.uid;
        const roleDoc = await db.collection('roles').doc(uid).get();

        if (!roleDoc.exists || roleDoc.data().role !== 'manager') {
            return res.status(403).json({ error: 'Недостатньо прав' });
        }

        const snapshot = await db.collection('promotions').orderBy('startDate', 'desc').get();
        const promotions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        res.json(promotions);
    } catch (err) {
        console.error('❌ Error fetching all promotions:', err);
        res.status(500).json({ error: 'Помилка отримання акцій' });
    }
});

// 🔓 Отримати всі активні акції (доступно всім користувачам)
app.get('/api/promotions', async (req, res) => {
    try {
        const now = admin.firestore.Timestamp.now();
        const snapshot = await db.collection('promotions')
            .where('active', '==', true)
            .where('startDate', '<=', now)
            .where('endDate', '>=', now)
            .orderBy('startDate', 'desc')
            .get();

        const items = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        res.json(items);
    } catch (err) {
        console.error('❌ Error fetching promotions:', err);
        res.status(500).json({ error: 'Помилка отримання акцій' });
    }
});

// 📝 Оновити акцію
app.put('/api/promotions/:id', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(403).json({ error: 'Немає токену' });

    try {
        const decoded = await admin.auth().verifyIdToken(token);
        const uid = decoded.uid;
        const roleDoc = await db.collection('roles').doc(uid).get();

        if (!roleDoc.exists || roleDoc.data().role !== 'manager') {
            return res.status(403).json({ error: 'Недостатньо прав' });
        }

        const { id } = req.params;
        const { title, description, image, startDate, endDate, active } = req.body;

        console.log(`✏️ Запит на оновлення акції ${id}:`, req.body);

        if (!title || !description || !image || !startDate || !endDate) {
            return res.status(400).json({ error: 'Всі поля обов’язкові' });
        }

        await db.collection('promotions').doc(id).update({
            title,
            description,
            image,
            startDate: admin.firestore.Timestamp.fromDate(new Date(startDate)),
            endDate: admin.firestore.Timestamp.fromDate(new Date(endDate)),
            active: !!active
        });

        console.log('🆗 Акцію оновлено:', id);

        res.json({ message: 'Акцію оновлено' });
    } catch (err) {
        console.error('❌ Error updating promotion:', err);
        res.status(500).json({ error: 'Не вдалося оновити акцію' });
    }
});

// 🗑 Видалити акцію (тільки для менеджера)
app.delete('/api/promotions/:id', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(403).json({ error: 'Немає токену' });

    try {
        const decoded = await admin.auth().verifyIdToken(token);
        const uid = decoded.uid;
        const roleDoc = await db.collection('roles').doc(uid).get();

        if (!roleDoc.exists || roleDoc.data().role !== 'manager') {
            return res.status(403).json({ error: 'Недостатньо прав' });
        }

        const { id } = req.params;
        await db.collection('promotions').doc(id).delete();

        console.log('🗑 Акцію видалено:', id);

        res.json({ message: 'Акцію видалено' });
    } catch (err) {
        console.error('❌ Error deleting promotion:', err);
        res.status(500).json({ error: 'Не вдалося видалити акцію' });
    }
});



// ➕ Додати відгук
app.post('/api/reviews', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(403).json({ error: 'Немає токену' });

    try {
        const decoded = await admin.auth().verifyIdToken(token);
        const uid = decoded.uid;

        const { comment, ratingMenu, ratingStaff, ratingDelivery } = req.body;

        if (
            typeof ratingMenu !== 'number' ||
            typeof ratingStaff !== 'number' ||
            typeof ratingDelivery !== 'number'
        ) {
            return res.status(400).json({ error: 'Всі оцінки мають бути числами' });
        }

        const userRecord = await admin.auth().getUser(uid);
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

        const docRef = await db.collection('reviews').add(review);
        res.status(201).json({ id: docRef.id, ...review });
    } catch (err) {
        console.error('❌ Error adding review:', err);
        res.status(500).json({ error: 'Не вдалося додати відгук' });
    }
});


// 📥 Отримати всі відгуки
app.get('/api/reviews', async (req, res) => {
    try {
        const snapshot = await db.collection('reviews')
            .orderBy('createdAt', 'desc')
            .get();

        const reviews = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        res.json(reviews);
    } catch (err) {
        console.error('❌ Error fetching reviews:', err);
        res.status(500).json({ error: 'Не вдалося отримати відгуки' });
    }
});




app.get('/api/user/:uid', async (req, res) => {
    try {
        const user = await admin.auth().getUser(req.params.uid);
        res.json({ name: user.displayName || user.email });
    } catch (err) {
        res.status(404).json({ name: 'Анонім' });
    }
});

// 📌 Перевірка чи існує користувач у Firebase
app.get('/api/check-user-exists', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(403).json({ error: 'No token provided' });

    try {
        const decoded = await admin.auth().verifyIdToken(token);
        const uid = decoded.uid;

        const user = await admin.auth().getUser(uid);

        // 👇 ключова перевірка — чи є хоча б 1 email
        if (!user.email) {
            return res.status(404).json({ error: 'User not registered' });
        }

        // ✅ опціонально перевірити, чи є роль в Firestore
        const roleDoc = await db.collection('roles').doc(uid).get();
        if (!roleDoc.exists) {
            return res.status(404).json({ error: 'User role not found' });
        }

        res.json({ exists: true });
    } catch (error) {
        console.error('❌ User existence check error:', error);
        res.status(500).json({ error: 'User not found' });
    }
});



// ✅ Надіслати SMS-код
app.post('/api/verify/send-otp', async (req, res) => {
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
});

// ✅ Перевірити код підтвердження
app.post('/api/verify/verify-otp', async (req, res) => {
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
});

// 📩 Скидання пароля через Firebase
app.post('/api/forgot-password', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Пошта обов’язкова' });
    }

    try {
        const resetLink = await admin.auth().generatePasswordResetLink(email, {
            url: process.env.RESET_REDIRECT_URL || 'https://grinfood-c34ac.web.app/reset-password',
        });

        const msg = {
            to: email,
            from: process.env.SENDGRID_FROM_EMAIL, // приклад: grinfood.support@gmail.com
            subject: '🔐 Скидання пароля до GrinFood',
            html: `
                <p>Вітаємо!</p>
                <p>Щоб скинути пароль, натисніть кнопку нижче:</p>
                <a href="${resetLink}" style="background:#4CAF50;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;">
                    Скинути пароль
                </a>
                <p>Якщо ви не запитували скидання — просто ігноруйте цей лист.</p>
                <br />
                <small>GrinFood Team</small>
            `,
        };

        await sgMail.send(msg);
        console.log(`📤 Email sent to ${email}`);
        res.status(200).json({ message: '📩 Лист зі скиданням пароля надіслано' });
    } catch (error) {
        console.error('❌ SendGrid Error:', error.message);
        res.status(500).json({ error: 'Не вдалося надіслати лист' });
    }
});




// ✅ Публічна перевірка, чи існує акаунт з такою поштою
app.post('/api/check-user-by-email', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Пошта обов’язкова' });
    }

    try {
        await admin.auth().getUserByEmail(email);
        res.json({ exists: true });
    } catch (err) {
        console.error('❌ Email не знайдено:', email);
        res.status(404).json({ error: 'Користувача не знайдено' });
    }
});




// ✅ Запуск сервера
app.listen(PORT, () => {
    console.log(`✅ Server is running at http://localhost:${PORT}`);

    // ✅ Лог для перевірки .env (тимчасово)
    console.log('🛠 TWILIO_VERIFY_SERVICE_SID:', process.env.TWILIO_VERIFY_SERVICE_SID || '❌ missing');
    console.log('🛠 TWILIO_ACCOUNT_SID:', process.env.TWILIO_ACCOUNT_SID ? '[OK]' : '❌ missing');
    console.log('🛠 TWILIO_AUTH_TOKEN:', process.env.TWILIO_AUTH_TOKEN ? '[OK]' : '❌ missing');
});