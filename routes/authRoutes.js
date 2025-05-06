const express = require('express');

module.exports = (authController) => {
    const router = express.Router();

    router.post('/signup', authController.signup.bind(authController));
    router.post('/signin', authController.signin.bind(authController));
    router.get('/check-auth', authController.checkAuth.bind(authController));
    router.post('/update-email', authController.updateEmail.bind(authController));
    router.get('/get-role', authController.getRole.bind(authController));
    router.get('/check-user-exists', authController.checkUserExists.bind(authController));
    router.post('/check-user-by-email', authController.checkUserByEmail.bind(authController));
    router.post('/forgot-password', authController.forgotPassword.bind(authController));
    router.post('/notify-profile-updated', authController.notifyProfileUpdated.bind(authController));
    router.post('/send-verification-email', authController.sendVerificationEmail.bind(authController));
    router.get('/check-email-verified/:uid', authController.checkEmailVerified.bind(authController));
    router.post('/delete-user', authController.deleteUser.bind(authController));

    return router;
};
