class UserController {
    constructor(firebaseService) {
        this.auth = firebaseService.getAuth();
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

module.exports = UserController;
