const express = require('express');

module.exports = (menuController) => {
    const router = express.Router();

    router.get('/', menuController.getAll.bind(menuController));
    router.post('/', menuController.create.bind(menuController));
    router.put('/:id', menuController.update.bind(menuController));
    router.delete('/:id', menuController.delete.bind(menuController));

    return router;
};
