class OrderController {
    constructor(firebaseService, stripeService) {
        this.db = firebaseService.getDb();
        this.auth = firebaseService.getAuth();
        this.stripe = stripeService;
    }

    async createOrder(req, res) {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(403).json({ error: 'Невірний токен авторизації' });

        try {
            const decodedToken = await this.auth.verifyIdToken(token);
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
                status: 'pending',
                createdAt: this._now()
            };

            const docRef = await this.db.collection('orders').add(order);
            res.status(201).json({ id: docRef.id, ...order });
        } catch (error) {
            console.error('❌ Error creating order:', error.message);
            res.status(500).json({ error: error.message });
        }
    }

    async getOrdersByStatus(req, res) {
        const token = req.headers.authorization?.split(' ')[1];
        const { status } = req.params;
        if (!token) return res.status(403).json({ error: 'Немає токену' });

        try {
            const decoded = await this.auth.verifyIdToken(token);
            const uid = decoded.uid;

            const roleDoc = await this.db.collection('roles').doc(uid).get();
            if (!roleDoc.exists || roleDoc.data().role !== 'manager') {
                return res.status(403).json({ error: 'Недостатньо прав' });
            }

            const snapshot = await this.db.collection('orders')
                .where('status', '==', status)
                .get();

            let orders = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

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
    }

    async updateOrderStatus(req, res) {
        const token = req.headers.authorization?.split(' ')[1];
        const { id } = req.params;
        const { status } = req.body;

        if (!token) return res.status(403).json({ error: 'Немає токену' });
        if (!['confirmed', 'cancelled'].includes(status)) {
            return res.status(400).json({ error: 'Недійсний статус' });
        }

        try {
            const decoded = await this.auth.verifyIdToken(token);
            const uid = decoded.uid;

            const roleDoc = await this.db.collection('roles').doc(uid).get();
            if (!roleDoc.exists || roleDoc.data().role !== 'manager') {
                return res.status(403).json({ error: 'Недостатньо прав' });
            }

            await this.db.collection('orders').doc(id).update({ status });
            res.json({ message: `Статус замовлення оновлено до "${status}"` });
        } catch (err) {
            console.error('❌ Update order error:', err);
            res.status(500).json({ error: 'Помилка оновлення замовлення' });
        }
    }

    async createPaymentIntent(req, res) {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(403).json({ error: 'Невірний токен авторизації' });

        try {
            await this.auth.verifyIdToken(token);
            const { amount } = req.body;

            const paymentIntent = await this.stripe.paymentIntents.create({
                amount,
                currency: 'uah',
                payment_method_types: ['card'],
            });

            res.send({ clientSecret: paymentIntent.client_secret });
        } catch (error) {
            console.error('❌ Error creating payment intent:', error.message);
            res.status(500).json({ error: error.message });
        }
    }

    _now() {
        return require('firebase-admin').firestore.Timestamp.now();
    }
}

module.exports = OrderController;
