const Stripe = require('stripe');

class StripeService {
    constructor(secretKey) {
        this.stripe = Stripe(secretKey);
    }

    get paymentIntents() {
        return this.stripe.paymentIntents;
    }
}

module.exports = StripeService;
