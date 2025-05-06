const express = require('express');

module.exports = (orderController) => {
    const router = express.Router();

    router.post('/', orderController.createOrder.bind(orderController));
    router.get('/by-status/:status', orderController.getOrdersByStatus.bind(orderController));
    router.patch('/:id/status', orderController.updateOrderStatus.bind(orderController));
    router.post('/create-payment-intent', orderController.createPaymentIntent.bind(orderController));

    return router;
};
