const Trade = require('../models/Trade');
const User = require('../models/User');
const { getCurrentPrice } = require('../config/binance');
const { Op } = require('sequelize');

class TradeService {
  constructor(logger) {
    this.logger = logger || console;
    this.tradeTimers = new Map(); // Store timers for automatic validation
  }

  /**
   * Create a new trade
   */
  async createTrade(userId, tradeData) {
    const { direction, amount, duration } = tradeData;
    
    try {
      // Get current price
      const currentPrice = await getCurrentPrice('BTCUSDT');
      if (!currentPrice) {
        throw new Error('Unable to fetch current price');
      }

      // Validate user balance
      const user = await this.getUser(userId);
      if (!user) {
        throw new Error('User not found');
      }

      if (user.balance < amount) {
        throw new Error('Insufficient balance');
      }

      // Validate duration
      const validDurations = [30, 60, 120, 300, 600];
      if (!validDurations.includes(duration)) {
        throw new Error('Invalid duration. Choose from: 30, 60, 120, 300, 600 seconds');
      }

      // Calculate expiration time
      const expirationTime = new Date(Date.now() + duration * 1000);

      // Create trade
      const trade = await this.saveTrade({
        userId,
        symbol: 'BTCUSDT',
        direction,
        amount,
        entryPrice: currentPrice,
        duration,
        expirationTime,
        status: 'PENDING'
      });

      // Deduct balance
      await this.deductBalance(userId, amount);

      // Set timer for automatic validation
      this.scheduleTradeValidation(trade.id, expirationTime);

      this.logger.info(`Trade created: ${trade.id} for user ${userId}, amount: ${amount}, direction: ${direction}`);

      return trade;
    } catch (error) {
      this.logger.error('Error creating trade:', error);
      throw error;
    }
  }

  /**
   * Schedule automatic trade validation
   */
  scheduleTradeValidation(tradeId, expirationTime) {
    const now = Date.now();
    const delay = expirationTime.getTime() - now;

    if (delay <= 0) {
      // Trade already expired, validate immediately
      setTimeout(() => this.validateTrade(tradeId), 1000);
      return;
    }

    // Clear existing timer if any
    if (this.tradeTimers.has(tradeId)) {
      clearTimeout(this.tradeTimers.get(tradeId));
    }

    // Set new timer
    const timer = setTimeout(async () => {
      await this.validateTrade(tradeId);
      this.tradeTimers.delete(tradeId);
    }, delay);

    this.tradeTimers.set(tradeId, timer);

    this.logger.info(`Trade ${tradeId} scheduled for validation in ${delay/1000} seconds`);
  }

  /**
   * Validate trade result
   */
  async validateTrade(tradeId) {
    try {
      const trade = await this.getTradeById(tradeId);
      
      if (!trade) {
        this.logger.error(`Trade ${tradeId} not found`);
        return;
      }

      // Check if trade is already processed
      if (trade.status !== 'PENDING') {
        this.logger.info(`Trade ${tradeId} already processed with status: ${trade.status}`);
        return;
      }

      // Get current price
      const currentPrice = await getCurrentPrice('BTCUSDT');
      if (!currentPrice) {
        this.logger.error(`Unable to fetch current price for trade ${tradeId}`);
        // Reschedule validation after 5 seconds
        setTimeout(() => this.validateTrade(tradeId), 5000);
        return;
      }

      // Determine if trade is win or loss
      const isWin = this.checkTradeResult(trade.direction, trade.entryPrice, currentPrice);
      const profitLoss = isWin 
        ? trade.amount * trade.payoutMultiplier 
        : -trade.amount;

      // Update trade
      const updatedTrade = await this.updateTradeResult(tradeId, {
        exitPrice: currentPrice,
        status: isWin ? 'WIN' : 'LOSS',
        profitLoss: profitLoss
      });

      // Update user balance
      if (isWin) {
        await this.addBalance(trade.userId, trade.amount + profitLoss);
      } else {
        // Balance already deducted, no need to deduct again
        this.logger.info(`Trade ${tradeId} resulted in loss, balance already deducted`);
      }

      // Emit result to user via WebSocket
      this.emitTradeResult(trade.userId, {
        tradeId: tradeId,
        direction: trade.direction,
        entryPrice: trade.entryPrice,
        exitPrice: currentPrice,
        isWin: isWin,
        profitLoss: profitLoss,
        amount: trade.amount,
        timestamp: new Date().toISOString()
      });

      this.logger.info(`Trade ${tradeId} validated: ${isWin ? 'WIN' : 'LOSS'}, profitLoss: ${profitLoss}`);

      return updatedTrade;
    } catch (error) {
      this.logger.error(`Error validating trade ${tradeId}:`, error);
      // Retry after 10 seconds on error
      setTimeout(() => this.validateTrade(tradeId), 10000);
    }
  }

  /**
   * Check if trade is win or loss
   */
  checkTradeResult(direction, entryPrice, exitPrice) {
    if (direction === 'UP') {
      return exitPrice > entryPrice;
    } else if (direction === 'DOWN') {
      return exitPrice < entryPrice;
    }
    return false;
  }

  /**
   * Get trade by ID
   */
  async getTradeById(tradeId) {
    if (process.env.DB_TYPE === 'mongodb') {
      return await Trade.findById(tradeId);
    } else {
      return await Trade.findByPk(tradeId);
    }
  }

  /**
   * Get user by ID
   */
  async getUser(userId) {
    if (process.env.DB_TYPE === 'mongodb') {
      return await User.findById(userId);
    } else {
      return await User.findByPk(userId);
    }
  }

  /**
   * Save trade to database
   */
  async saveTrade(tradeData) {
    if (process.env.DB_TYPE === 'mongodb') {
      return await Trade.create(tradeData);
    } else {
      return await Trade.create(tradeData);
    }
  }

  /**
   * Update trade result
   */
  async updateTradeResult(tradeId, updateData) {
    if (process.env.DB_TYPE === 'mongodb') {
      return await Trade.findByIdAndUpdate(
        tradeId,
        { ...updateData, updatedAt: new Date() },
        { new: true }
      );
    } else {
      await Trade.update(
        { ...updateData, updatedAt: new Date() },
        { where: { id: tradeId } }
      );
      return await Trade.findByPk(tradeId);
    }
  }

  /**
   * Deduct balance from user
   */
  async deductBalance(userId, amount) {
    if (process.env.DB_TYPE === 'mongodb') {
      const user = await User.findById(userId);
      user.balance -= amount;
      await user.save();
      return user;
    } else {
      const user = await User.findByPk(userId);
      user.balance -= amount;
      await user.save();
      return user;
    }
  }

  /**
   * Add balance to user
   */
  async addBalance(userId, amount) {
    if (process.env.DB_TYPE === 'mongodb') {
      const user = await User.findById(userId);
      user.balance += amount;
      await user.save();
      return user;
    } else {
      const user = await User.findByPk(userId);
      user.balance += amount;
      await user.save();
      return user;
    }
  }

  /**
   * Emit trade result via WebSocket
   */
  emitTradeResult(userId, result) {
    // This will be set by the socket handler
    if (this.socketEmit) {
      this.socketEmit(userId, 'tradeResult', result);
    } else {
      this.logger.warn('Socket emit function not set');
    }
  }

  /**
   * Set socket emit function
   */
  setSocketEmitFunction(emitFunction) {
    this.socketEmit = emitFunction;
  }

  /**
   * Cancel trade (if still pending)
   */
  async cancelTrade(tradeId, userId) {
    const trade = await this.getTradeById(tradeId);
    
    if (!trade) {
      throw new Error('Trade not found');
    }

    if (trade.userId.toString() !== userId.toString()) {
      throw new Error('Unauthorized to cancel this trade');
    }

    if (trade.status !== 'PENDING') {
      throw new Error('Trade is already processed');
    }

    // Check if trade is about to expire
    const timeLeft = trade.expirationTime.getTime() - Date.now();
    if (timeLeft < 5000) {
      throw new Error('Cannot cancel trade: too close to expiration');
    }

    // Clear timer
    if (this.tradeTimers.has(tradeId)) {
      clearTimeout(this.tradeTimers.get(tradeId));
      this.tradeTimers.delete(tradeId);
    }

    // Update trade status
    const updatedTrade = await this.updateTradeResult(tradeId, {
      status: 'CANCELLED'
    });

    // Refund balance
    await this.addBalance(userId, trade.amount);

    this.logger.info(`Trade ${tradeId} cancelled by user ${userId}`);

    return updatedTrade;
  }

  /**
   * Clean up expired timers
   */
  cleanupExpiredTimers() {
    const now = Date.now();
    for (const [tradeId, timer] of this.tradeTimers.entries()) {
      try {
        clearTimeout(timer);
        this.tradeTimers.delete(tradeId);
      } catch (error) {
        this.logger.error(`Error cleaning up timer for trade ${tradeId}:`, error);
      }
    }
  }

  /**
   * Get user's active trades
   */
  async getActiveTrades(userId) {
    if (process.env.DB_TYPE === 'mongodb') {
      return await Trade.find({
        userId,
        status: 'PENDING'
      });
    } else {
      return await Trade.findAll({
        where: {
          userId,
          status: 'PENDING'
        }
      });
    }
  }

  /**
   * Get trade statistics
   */
  async getTradeStatistics(userId) {
    let totalTrades, winTrades, totalProfitLoss;
    
    if (process.env.DB_TYPE === 'mongodb') {
      totalTrades = await Trade.countDocuments({ userId });
      winTrades = await Trade.countDocuments({ userId, status: 'WIN' });
      
      const result = await Trade.aggregate([
        { $match: { userId, status: { $in: ['WIN', 'LOSS'] } } },
        { $group: { _id: null, total: { $sum: '$profitLoss' } } }
      ]);
      totalProfitLoss = result.length > 0 ? result[0].total : 0;
    } else {
      totalTrades = await Trade.count({ where: { userId } });
      winTrades = await Trade.count({ where: { userId, status: 'WIN' } });
      
      const result = await Trade.sum('profitLoss', {
        where: { userId, status: { [Op.in]: ['WIN', 'LOSS'] } }
      });
      totalProfitLoss = result || 0;
    }

    return {
      totalTrades,
      winTrades,
      lossTrades: totalTrades - winTrades,
      winRate: totalTrades > 0 ? (winTrades / totalTrades) * 100 : 0,
      totalProfitLoss,
      averageProfit: winTrades > 0 ? totalProfitLoss / winTrades : 0
    };
  }
}

module.exports = TradeService;
