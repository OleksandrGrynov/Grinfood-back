const express = require('express');

module.exports = (controller) => {
    const router = express.Router();

    router.post('/', controller.add.bind(controller));
    router.get('/', controller.getAll.bind(controller));
    router.delete('/:id', controller.delete.bind(controller));

    return router;
};
