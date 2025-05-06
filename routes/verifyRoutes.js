const express = require('express');

module.exports = (controller) => {
    const router = express.Router();

    router.post('/send-otp', controller.sendOTP.bind(controller));
    router.post('/verify-otp', controller.verifyOTP.bind(controller));

    return router;
};
