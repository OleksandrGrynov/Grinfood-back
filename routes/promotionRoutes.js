const express = require('express');

module.exports = (controller) => {
    const router = express.Router();

    router.post('/', controller.create.bind(controller));
    router.get('/all', controller.getAll.bind(controller));         // менеджер
    router.get('/', controller.getActive.bind(controller));         // публічні
    router.put('/:id', controller.update.bind(controller));
    router.delete('/:id', controller.delete.bind(controller));

    return router;
};
