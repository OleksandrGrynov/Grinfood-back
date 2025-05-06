const admin = require('firebase-admin');

class FirebaseService {
    constructor(serviceAccount) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });

        this.db = admin.firestore();
        this.auth = admin.auth();
    }

    getDb() {
        return this.db;
    }

    getAuth() {
        return this.auth;
    }
}

module.exports = FirebaseService;
