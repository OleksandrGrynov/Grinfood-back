class PromotionController {
    constructor(firebaseService) {
        this.db = firebaseService.getDb();
        this.auth = firebaseService.getAuth();
    }

    async create(req, res) {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(403).json({ error: 'Немає токену' });

        try {
            const decoded = await this.auth.verifyIdToken(token);
            const uid = decoded.uid;

            const roleDoc = await this.db.collection('roles').doc(uid).get();
            if (!roleDoc.exists || roleDoc.data().role !== 'manager') {
                return res.status(403).json({ error: 'Недостатньо прав' });
            }

            const { title, description, image, startDate, endDate, active } = req.body;
            if (!title || !description || !image || !startDate || !endDate) {
                return res.status(400).json({ error: 'Всі поля обов’язкові' });
            }

            const docRef = await this.db.collection('promotions').add({
                title,
                description,
                image,
                active: !!active,
                startDate: this._ts(startDate),
                endDate: this._ts(endDate),
                createdAt: this._now()
            });

            res.status(201).json({ id: docRef.id });
        } catch (err) {
            console.error('❌ Create promotion error:', err);
            res.status(500).json({ error: 'Не вдалося додати акцію' });
        }
    }

    async getAll(req, res) {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(403).json({ error: 'Немає токену' });

        try {
            const decoded = await this.auth.verifyIdToken(token);
            const uid = decoded.uid;

            const roleDoc = await this.db.collection('roles').doc(uid).get();
            if (!roleDoc.exists || roleDoc.data().role !== 'manager') {
                return res.status(403).json({ error: 'Недостатньо прав' });
            }

            const snapshot = await this.db.collection('promotions').orderBy('startDate', 'desc').get();
            const promotions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            res.json(promotions);
        } catch (err) {
            res.status(500).json({ error: 'Помилка отримання акцій' });
        }
    }

    async getActive(req, res) {
        try {
            const now = this._now();

            const snapshot = await this.db.collection('promotions')
                .where('active', '==', true)
                .where('startDate', '<=', now)
                .where('endDate', '>=', now)
                .orderBy('startDate', 'desc')
                .get();

            const promotions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            res.json(promotions);
        } catch (err) {
            console.error('❌ Error fetching active promotions:', err);
            res.status(500).json({ error: 'Помилка отримання акцій' });
        }
    }

    async update(req, res) {
        const token = req.headers.authorization?.split(' ')[1];
        const { id } = req.params;

        if (!token) return res.status(403).json({ error: 'Немає токену' });

        try {
            const decoded = await this.auth.verifyIdToken(token);
            const uid = decoded.uid;

            const roleDoc = await this.db.collection('roles').doc(uid).get();
            if (!roleDoc.exists || roleDoc.data().role !== 'manager') {
                return res.status(403).json({ error: 'Недостатньо прав' });
            }

            const { title, description, image, startDate, endDate, active } = req.body;
            if (!title || !description || !image || !startDate || !endDate) {
                return res.status(400).json({ error: 'Всі поля обов’язкові' });
            }

            await this.db.collection('promotions').doc(id).update({
                title,
                description,
                image,
                startDate: this._ts(startDate),
                endDate: this._ts(endDate),
                active: !!active
            });

            res.json({ message: 'Акцію оновлено' });
        } catch (err) {
            res.status(500).json({ error: 'Не вдалося оновити акцію' });
        }
    }

    async delete(req, res) {
        const token = req.headers.authorization?.split(' ')[1];
        const { id } = req.params;

        if (!token) return res.status(403).json({ error: 'Немає токену' });

        try {
            const decoded = await this.auth.verifyIdToken(token);
            const uid = decoded.uid;

            const roleDoc = await this.db.collection('roles').doc(uid).get();
            if (!roleDoc.exists || roleDoc.data().role !== 'manager') {
                return res.status(403).json({ error: 'Недостатньо прав' });
            }

            await this.db.collection('promotions').doc(id).delete();
            res.json({ message: 'Акцію видалено' });
        } catch (err) {
            res.status(500).json({ error: 'Не вдалося видалити акцію' });
        }
    }

    _ts(date) {
        return require('firebase-admin').firestore.Timestamp.fromDate(new Date(date));
    }

    _now() {
        return require('firebase-admin').firestore.Timestamp.now();
    }
}

module.exports = PromotionController;
