const Trade = require('../models/Trade');
const { getCurrentPrice, getHistoricalData } = require('../config/binance');
const TradeService = require('../services/tradeService');

// Initialize trade service
const tradeService = new TradeService();

const createTrade = async (req, res) => {
  try {
    const { direction, amount, duration } = req.body;
    const userId = req.userId;
    
    // Validate input
    if (!direction || !amount || !duration) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: direction, amount, duration'
      });
    }
    
    // Validate direction
    if (!['UP', 'DOWN'].includes(direction)) {
      return res.status(400).json({
        success: false,
        message: 'Direction must be UP or DOWN'
      });
    }
    
    // Validate amount
    if (amount < 1 || amount > 10000) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be between $1 and $10,000'
      });
    }
    
    // Validate duration
    const validDurations = [30, 60, 120, 300, 600];
    if (!validDurations.includes(duration)) {
      return res.status(400).json({
        success: false,
        message: 'Duration must be one of: 30, 60, 120, 300, 600 seconds'
      });
    }
    
    // Create trade using trade service
    const trade = await tradeService.createTrade(userId, {
      direction,
      amount,
      duration
    });
    
    res.status(201).json({
      success: true,
      message: 'Trade created successfully',
      data: {
        id: trade.id,
        direction: trade.direction,
        amount: trade.amount,
        entryPrice: trade.entryPrice,
        duration: trade.duration,
        expirationTime: trade.expirationTime,
        status: trade.status
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create trade',
      error: error.message
    });
  }
};

const cancelTrade = async (req, res) => {
  try {
    const { tradeId } = req.params;
    const userId = req.userId;
    
    const trade = await tradeService.cancelTrade(tradeId, userId);
    
    res.status(200).json({
      success: true,
      message: 'Trade cancelled successfully',
      data: {
        id: trade.id,
        status: trade.status
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to cancel trade',
      error: error.message
    });
  }
};

const getUserTrades = async (req, res) => {
  try {
    const userId = req.userId;
    const { status, limit = 50, offset = 0 } = req.query;
    
    let query = { userId };
    if (status) query.status = status;
    
    let trades;
    if (process.env.DB_TYPE === 'mongodb') {
      trades = await Trade.find(query)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip(parseInt(offset));
    } else {
      trades = await Trade.findAll({
        where: query,
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
    }
    
    res.status(200).json({
      success: true,
      data: trades,
      count: trades.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get trades',
      error: error.message
    });
  }
};

const getTradeById = async (req, res) => {
  try {
    const { tradeId } = req.params;
    const userId = req.userId;
    
    const trade = await tradeService.getTradeById(tradeId);
    
    if (!trade) {
      return res.status(404).json({
        success: false,
        message: 'Trade not found'
      });
    }
    
    if (trade.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to view this trade'
      });
    }
    
    res.status(200).json({
      success: true,
      data: trade
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get trade',
      error: error.message
    });
  }
};

const getTradeStatistics = async (req, res) => {
  try {
    const userId = req.userId;
    const statistics = await tradeService.getTradeStatistics(userId);
    
    res.status(200).json({
      success: true,
      data: statistics
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get statistics',
      error: error.message
    });
  }
};

const getActiveTrades = async (req, res) => {
  try {
    const userId = req.userId;
    const trades = await tradeService.getActiveTrades(userId);
    
    res.status(200).json({
      success: true,
      data: trades,
      count: trades.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get active trades',
      error: error.message
    });
  }
};

module.exports = {
  createTrade,
  cancelTrade,
  getUserTrades,
  getTradeById,
  getTradeStatistics,
  getActiveTrades
};
