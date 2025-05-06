class MenuController {
    constructor(db) {
        this.db = db;
    }

    // GET /api/menu
    async getAll(req, res) {
        try {
            const snapshot = await this.db.collection('menuItems').get();
            const items = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            res.json(items);
        } catch (error) {
            console.error('❌ Error fetching menu:', error);
            res.status(500).json({ error: 'Failed to fetch menu' });
        }
    }

    // POST /api/menu
    async create(req, res) {
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
        } catch (error) {
            console.error('❌ Error adding item:', error);
            res.status(500).json({ error: 'Failed to add item' });
        }
    }

    // PUT /api/menu/:id
    async update(req, res) {
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

    // DELETE /api/menu/:id
    async delete(req, res) {
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

module.exports = MenuController;
