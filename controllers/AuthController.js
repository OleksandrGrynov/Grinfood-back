class AuthController {
    constructor(firebaseService, emailService) {
        this.auth = firebaseService.getAuth();
        this.db = firebaseService.getDb();
        this.emailService = emailService;
    }

    async signup(req, res) {
        const { name, email, password, role = 'user' } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Потрібно вказати ім’я, email і пароль' });
        }

        try {
            const userRecord = await this.auth.createUser({
                email,
                password,
                displayName: name
            });

            await this.db.collection('roles').doc(userRecord.uid).set({ role });
            const token = await this.auth.createCustomToken(userRecord.uid);

            res.status(201).json({ message: 'User created', user: userRecord, token });
        } catch (err) {
            console.error('❌ Signup error:', err);
            res.status(500).json({ error: err.message });
        }
    }

    async signin(req, res) {
        const { email } = req.body;

        try {
            const userRecord = await this.auth.getUserByEmail(email);
            const token = await this.auth.createCustomToken(userRecord.uid);
            res.status(200).json({ message: 'User signed in', token });
        } catch (err) {
            console.error('❌ Signin error:', err);
            res.status(400).json({ error: 'Failed to sign in' });
        }
    }

    async checkAuth(req, res) {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(403).json({ error: 'No token provided' });

        try {
            const decoded = await this.auth.verifyIdToken(token);
            res.status(200).json({ message: 'Authorized', uid: decoded.uid });
        } catch (err) {
            res.status(403).json({ error: 'Invalid token' });
        }
    }

    async updateEmail(req, res) {
        const token = req.headers.authorization?.split(' ')[1];
        const { newEmail } = req.body;

        if (!token || !newEmail) {
            return res.status(400).json({ error: 'Invalid request' });
        }

        try {
            const decoded = await this.auth.verifyIdToken(token);
            await this.auth.updateUser(decoded.uid, { email: newEmail });
            res.status(200).json({ message: 'Email updated' });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }

    async getRole(req, res) {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(403).json({ error: 'No token provided' });

        try {
            const decoded = await this.auth.verifyIdToken(token);
            const doc = await this.db.collection('roles').doc(decoded.uid).get();
            res.json({ role: doc.exists ? doc.data().role : 'user' });
        } catch (err) {
            res.status(500).json({ error: 'Failed to get role' });
        }
    }

    async checkUserExists(req, res) {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(403).json({ error: 'No token provided' });

        try {
            const decoded = await this.auth.verifyIdToken(token);
            const user = await this.auth.getUser(decoded.uid);
            const roleDoc = await this.db.collection('roles').doc(decoded.uid).get();

            if (!user.email || !roleDoc.exists) {
                return res.status(404).json({ error: 'User not registered or role not found' });
            }

            res.json({ exists: true });
        } catch (err) {
            res.status(500).json({ error: 'User not found' });
        }
    }

    async checkUserByEmail(req, res) {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email required' });

        try {
            await this.auth.getUserByEmail(email);
            res.json({ exists: true });
        } catch {
            res.status(404).json({ error: 'User not found' });
        }
    }

    async forgotPassword(req, res) {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email required' });

        try {
            const link = await this.auth.generatePasswordResetLink(email, {
                url: process.env.RESET_REDIRECT_URL || 'https://grinfood-c34ac.web.app/reset-password'
            });

            await this.emailService.sendResetEmail(email, link);
            res.status(200).json({ message: 'Reset email sent' });
        } catch (err) {
            res.status(500).json({ error: 'Failed to send email' });
        }
    }

    async notifyProfileUpdated(req, res) {
        const { email, name } = req.body;
        if (!email || !name) return res.status(400).json({ error: 'Missing name or email' });

        try {
            await this.emailService.sendProfileUpdatedEmail(email, name);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Failed to send notification' });
        }
    }

    async sendVerificationEmail(req, res) {
        const { email, uid } = req.body;
        if (!email || !uid) return res.status(400).json({ error: 'Missing email or uid' });

        try {
            const link = await this.auth.generateEmailVerificationLink(email, {
                url: `${process.env.APP_BASE_URL}/profile`,
                handleCodeInApp: false
            });

            await this.emailService.sendVerificationEmail(email, link);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Failed to send verification email' });
        }
    }

    async checkEmailVerified(req, res) {
        try {
            const user = await this.auth.getUser(req.params.uid);
            res.json({ email: user.email, emailVerified: user.emailVerified });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }

    async deleteUser(req, res) {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(403).json({ error: 'No token' });

        try {
            const decoded = await this.auth.verifyIdToken(token);
            const uid = decoded.uid;

            await this.auth.deleteUser(uid);
            await this.db.collection('roles').doc(uid).delete().catch(() => {});
            await this._deleteUserData('orders', 'userId', uid);
            await this._deleteUserData('reviews', 'userId', uid);

            res.json({ message: 'User deleted' });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }

    async _deleteUserData(collection, field, value) {
        const snapshot = await this.db.collection(collection).where(field, '==', value).get();
        const batch = this.db.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
    }
}

module.exports = AuthController;
