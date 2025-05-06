class ReviewController {
    constructor(firebaseService) {
        this.db = firebaseService.getDb();
        this.auth = firebaseService.getAuth();
    }

    async add(req, res) {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(403).json({ error: 'Немає токену' });

        try {
            const decoded = await this.auth.verifyIdToken(token);
            const uid = decoded.uid;
            const { comment, ratingMenu, ratingStaff, ratingDelivery } = req.body;

            if (
                typeof ratingMenu !== 'number' ||
                typeof ratingStaff !== 'number' ||
                typeof ratingDelivery !== 'number'
            ) {
                return res.status(400).json({ error: 'Всі оцінки мають бути числами' });
            }

            const user = await this.auth.getUser(uid);
            const userName = user.displayName || user.email;

            const review = {
                userId: uid,
                userName,
                comment: comment || '',
                ratingMenu,
                ratingStaff,
                ratingDelivery,
                createdAt: this._now()
            };

            const docRef = await this.db.collection('reviews').add(review);
            res.status(201).json({ id: docRef.id, ...review });
        } catch (err) {
            console.error('❌ Error adding review:', err);
            res.status(500).json({ error: 'Не вдалося додати відгук' });
        }
    }

    async getAll(req, res) {
        try {
            const snapshot = await this.db.collection('reviews')
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
    }

    async delete(req, res) {
        const token = req.headers.authorization?.split(' ')[1];
        const { id } = req.params;

        if (!token) return res.status(403).json({ error: 'Немає токену' });

        try {
            const decoded = await this.auth.verifyIdToken(token);
            const uid = decoded.uid;

            const doc = await this.db.collection('reviews').doc(id).get();
            if (!doc.exists) return res.status(404).json({ error: 'Відгук не знайдено' });

            const review = doc.data();
            const isOwner = review.userId === uid;

            const roleDoc = await this.db.collection('roles').doc(uid).get();
            const isManager = roleDoc.exists && roleDoc.data().role === 'manager';

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

    _now() {
        return require('firebase-admin').firestore.Timestamp.now();
    }
}

module.exports = ReviewController;
