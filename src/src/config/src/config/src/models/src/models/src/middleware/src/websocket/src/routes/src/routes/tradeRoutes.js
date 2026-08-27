const express = require('express');
const router = express.Router();
const tradeController = require('../controllers/tradeController');

// Protected routes (all require authentication)
router.post('/', tradeController.createTrade);
router.get('/', tradeController.getUserTrades);
router.get('/:tradeId', tradeController.getTradeById);
router.put('/:tradeId/cancel', tradeController.cancelTrade);
router.get('/statistics/summary', tradeController.getTradeStatistics);

module.exports = router;
