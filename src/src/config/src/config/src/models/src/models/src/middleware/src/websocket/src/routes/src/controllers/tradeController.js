const Trade = require('../models/Trade');
const { getHistoricalData } = require('../config/binance');

const createTrade = async (req, res) => {
  try {
    const { symbol, type, amount, price, expirationTime } = req.body;
    const userId = req.userId;
    
    // Validate input
    if (!type || !amount || !price || !expirationTime) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }
    
    // Check user balance
    const user = req.user;
    if (user.balance < amount * price) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance'
      });
    }
    
    // Create trade
    let trade;
    if (process.env.DB_TYPE === 'mongodb') {
      trade = await Trade.create({
        userId,
        symbol: symbol || 'BTCUSDT',
        type,
        amount,
        price,
        expirationTime: new Date(expirationTime),
        status: 'PENDING'
      });
    } else {
      trade = await Trade.create({
        userId,
        symbol: symbol || 'BTCUSDT',
        type,
        amount,
        price,
        expirationTime: new Date(expirationTime),
        status: 'PENDING'
      });
    }
    
    // Update user balance (reserve funds)
    user.balance -= amount * price;
    await user.save();
    
    res.status(201).json({
      success: true,
      message: 'Trade created successfully',
      data: trade
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create trade',
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
    
    let trade;
    if (process.env.DB_TYPE === 'mongodb') {
      trade = await Trade.findOne({ _id: tradeId, userId });
    } else {
      trade = await Trade.findOne({ where: { id: tradeId, userId } });
    }
    
    if (!trade) {
      return res.status(404).json({
        success: false,
        message: 'Trade not found'
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

const cancelTrade = async (req, res) => {
  try {
    const { tradeId } = req.params;
    const userId = req.userId;
    
    let trade;
    if (process.env.DB_TYPE === 'mongodb') {
      trade = await Trade.findOne({ _id: tradeId, userId });
    } else {
      trade = await Trade.findOne({ where: { id: tradeId, userId } });
    }
    
    if (!trade) {
      return res.status(404).json({
        success: false,
        message: 'Trade not found'
      });
    }
    
    if (trade.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        message: 'Trade cannot be cancelled'
      });
    }
    
    // Update trade status
    trade.status = 'CANCELLED';
    await trade.save();
    
    // Refund user balance
    const user = req.user;
    user.balance += trade.amount * trade.price;
    await user.save();
    
    res.status(200).json({
      success: true,
      message: 'Trade cancelled successfully',
      data: trade
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to cancel trade',
      error: error.message
    });
  }
};

const getTradeStatistics = async (req, res) => {
  try {
    const userId = req.userId;
    
    let totalTrades, completedTrades, totalProfitLoss;
    
    if (process.env.DB_TYPE === 'mongodb') {
      totalTrades = await Trade.countDocuments({ userId });
      completedTrades = await Trade.countDocuments({ userId, status: 'COMPLETED' });
      
      const result = await Trade.aggregate([
        { $match: { userId, status: 'COMPLETED' } },
        { $group: { _id: null, total: { $sum: '$profitLoss' } } }
      ]);
      totalProfitLoss = result.length > 0 ? result[0].total : 0;
    } else {
      const { Op } = require('sequelize');
      totalTrades = await Trade.count({ where: { userId } });
      completedTrades = await Trade.count({ where: { userId, status: 'COMPLETED' } });
      
      const result = await Trade.sum('profitLoss', { 
        where: { userId, status: 'COMPLETED' } 
      });
      totalProfitLoss = result || 0;
    }
    
    res.status(200).json({
      success: true,
      data: {
        totalTrades,
        completedTrades,
        pendingTrades: totalTrades - completedTrades,
        totalProfitLoss,
        winRate: completedTrades > 0 ? 
          (await getWinRate(userId)) * 100 : 0
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get statistics',
      error: error.message
    });
  }
};

// Helper function to calculate win rate
const getWinRate = async (userId) => {
  try {
    let trades;
    if (process.env.DB_TYPE === 'mongodb') {
      trades = await Trade.find({ userId, status: 'COMPLETED' });
    } else {
      trades = await Trade.findAll({ where: { userId, status: 'COMPLETED' } });
    }
    
    if (trades.length === 0) return 0;
    
    const profitableTrades = trades.filter(t => t.profitLoss > 0);
    return profitableTrades.length / trades.length;
  } catch (error) {
    return 0;
  }
};

module.exports = {
  createTrade,
  getUserTrades,
  getTradeById,
  cancelTrade,
  getTradeStatistics
};
