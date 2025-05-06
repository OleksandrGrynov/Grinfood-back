class VerifyController {
    constructor(twilioService) {
        this.client = twilioService.getClient();
    }

    async sendOTP(req, res) {
        const { phone } = req.body;
        if (!phone) return res.status(400).json({ error: 'Missing phone number' });

        try {
            const verification = await this.client.verify.v2
                .services(process.env.TWILIO_VERIFY_SERVICE_SID)
                .verifications.create({ to: phone, channel: 'sms' });

            res.json({ success: true, status: verification.status });
        } catch (err) {
            console.error('❌ Send OTP error:', err.message);
            res.status(500).json({ error: err.message });
        }
    }

    async verifyOTP(req, res) {
        const { phone, code } = req.body;
        if (!phone || !code) return res.status(400).json({ error: 'Missing phone or code' });

        try {
            const result = await this.client.verify.v2
                .services(process.env.TWILIO_VERIFY_SERVICE_SID)
                .verificationChecks.create({ to: phone, code });

            res.json({ success: result.status === 'approved', status: result.status });
        } catch (err) {
            console.error('❌ Verify OTP error:', err.message);
            res.status(500).json({ error: err.message });
        }
    }
}

module.exports = VerifyController;
