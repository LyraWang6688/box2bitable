const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');

router.get('/sales/today', analyticsController.getTodaySalesAnalytics);

module.exports = router;
