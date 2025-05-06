const express = require('express');

module.exports = (controller) => {
    const router = express.Router();

    router.get('/:uid', controller.getUserName.bind(controller));

    return router;
};
