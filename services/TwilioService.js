const twilio = require('twilio');

class TwilioService {
    constructor() {
        this.client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    }

    getClient() {
        return this.client;
    }
}

module.exports = TwilioService;
