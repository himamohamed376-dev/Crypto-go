const jwt = require('jsonwebtoken');
const User = require('../models/User');
const TradeService = require('../services/tradeService');

let connectedClients = new Map();
let tradeService = null;

const setupSocketHandlers = (io, logger) => {
  // Initialize trade service
  tradeService = new TradeService(logger);
  
  // Set socket emit function for trade service
  tradeService.setSocketEmitFunction((userId, event, data) => {
    io.to(`user:${userId}`).emit(event, data);
  });

  // Authentication middleware for Socket.IO
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication required'));
      }
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Verify user exists
      let user;
      if (process.env.DB_TYPE === 'mongodb') {
        user = await User.findById(decoded.id);
      } else {
        user = await User.findByPk(decoded.id);
      }
      
      if (!user) {
        return next(new Error('User not found'));
      }
      
      socket.userId = decoded.id;
      next();
    } catch (error) {
      next(new Error('Authentication failed'));
    }
  });
  
  io.on('connection', (socket) => {
    const userId = socket.userId;
    logger.info(`User ${userId} connected with socket ID: ${socket.id}`);
    
    // Store client connection
    connectedClients.set(userId, {
      id: socket.id,
      socket: socket
    });
    
    // Join user-specific room
    socket.join(`user:${userId}`);
    
    // Send user's active trades on connection
    sendActiveTrades(socket, userId);
    
    // Handle creating a new trade
    socket.on('createTrade', async (tradeData, callback) => {
      try {
        const { direction, amount, duration } = tradeData;
        
        // Validate input
        if (!direction || !amount || !duration) {
          const error = { success: false, message: 'Missing required fields: direction, amount, duration' };
          if (callback) callback(error);
          return;
        }
        
        // Validate direction
        if (!['UP', 'DOWN'].includes(direction)) {
          const error = { success: false, message: 'Direction must be UP or DOWN' };
          if (callback) callback(error);
          return;
        }
        
        // Validate amount
        if (amount < 1 || amount > 10000) {
          const error = { success: false, message: 'Amount must be between $1 and $10,000' };
          if (callback) callback(error);
          return;
        }
        
        // Validate duration
        const validDurations = [30, 60, 120, 300, 600];
        if (!validDurations.includes(duration)) {
          const error = { success: false, message: 'Duration must be one of: 30, 60, 120, 300, 600 seconds' };
          if (callback) callback(error);
          return;
        }
        
        // Create trade using trade service
        const trade = await tradeService.createTrade(userId, {
          direction,
          amount,
          duration
        });
        
        // Emit trade created event
        io.to(`user:${userId}`).emit('tradeCreated', {
          tradeId: trade.id,
          direction: trade.direction,
          amount: trade.amount,
          entryPrice: trade.entryPrice,
          duration: trade.duration,
          expirationTime: trade.expirationTime,
          status: trade.status,
          timestamp: new Date().toISOString()
        });
        
        // Update user balance in client
        const user = await tradeService.getUser(userId);
        io.to(`user:${userId}`).emit('balanceUpdate', {
          balance: user.balance
        });
        
        if (callback) {
          callback({
            success: true,
            trade: {
              id: trade.id,
              direction: trade.direction,
              amount: trade.amount,
              entryPrice: trade.entryPrice,
              duration: trade.duration,
              expirationTime: trade.expirationTime,
              status: trade.status
            }
          });
        }
        
        logger.info(`Trade created: ${trade.id} for user ${userId}`);
        
      } catch (error) {
        logger.error(`Error creating trade for user ${userId}:`, error);
        if (callback) {
          callback({
            success: false,
            message: error.message || 'Failed to create trade'
          });
        }
      }
    });
    
    // Handle cancelling a trade
    socket.on('cancelTrade', async (tradeId, callback) => {
      try {
        if (!tradeId) {
          const error = { success: false, message: 'Trade ID required' };
          if (callback) callback(error);
          return;
        }
        
        const trade = await tradeService.cancelTrade(tradeId, userId);
        
        io.to(`user:${userId}`).emit('tradeCancelled', {
          tradeId: trade.id,
          status: 'CANCELLED',
          timestamp: new Date().toISOString()
        });
        
        // Update user balance
        const user = await tradeService.getUser(userId);
        io.to(`user:${userId}`).emit('balanceUpdate', {
          balance: user.balance
        });
        
        if (callback) {
          callback({
            success: true,
            message: 'Trade cancelled successfully',
            trade: {
              id: trade.id,
              status: trade.status
            }
          });
        }
        
        logger.info(`Trade ${tradeId} cancelled by user ${userId}`);
        
      } catch (error) {
        logger.error(`Error cancelling trade ${tradeId}:`, error);
        if (callback) {
          callback({
            success: false,
            message: error.message || 'Failed to cancel trade'
          });
        }
      }
    });
    
    // Handle getting trade history
    socket.on('getTradeHistory', async (filters, callback) => {
      try {
        const trades = await getTradeHistory(userId, filters);
        
        if (callback) {
          callback({
            success: true,
            trades: trades
          });
        }
        
      } catch (error) {
        logger.error(`Error getting trade history for user ${userId}:`, error);
        if (callback) {
          callback({
            success: false,
            message: error.message || 'Failed to get trade history'
          });
        }
      }
    });
    
    // Handle getting trade statistics
    socket.on('getTradeStatistics', async (callback) => {
      try {
        const statistics = await tradeService.getTradeStatistics(userId);
        
        if (callback) {
          callback({
            success: true,
            statistics
          });
        }
        
      } catch (error) {
        logger.error(`Error getting trade statistics for user ${userId}:`, error);
        if (callback) {
          callback({
            success: false,
            message: error.message || 'Failed to get statistics'
          });
        }
      }
    });
    
    // Handle subscription to price updates
    socket.on('subscribePrice', (symbol = 'BTCUSDT') => {
      logger.info(`User ${userId} subscribed to ${symbol}`);
      socket.join(`price:${symbol}`);
      socket.emit('subscribed', { symbol, status: 'success' });
    });
    
    // Handle unsubscription
    socket.on('unsubscribePrice', (symbol = 'BTCUSDT') => {
      logger.info(`User ${userId} unsubscribed from ${symbol}`);
      socket.leave(`price:${symbol}`);
      socket.emit('unsubscribed', { symbol, status: 'success' });
    });
    
    // Handle disconnection
    socket.on('disconnect', () => {
      logger.info(`User ${userId} disconnected`);
      connectedClients.delete(userId);
    });
    
    // Error handling
    socket.on('error', (error) => {
      logger.error(`Socket error for user ${userId}:`, error);
    });
  });
  
  // Broadcast price updates to subscribed clients
  const broadcastPriceUpdate = (priceData) => {
    const symbol = priceData.symbol || 'BTCUSDT';
    io.to(`price:${symbol}`).emit('priceUpdate', priceData);
  };
  
  return {
    broadcastPriceUpdate,
    getConnectedClients: () => {
      return Array.from(connectedClients.keys());
    },
    tradeService
  };
};

// Helper function to send active trades on connection
const sendActiveTrades = async (socket, userId) => {
  try {
    const activeTrades = await tradeService.getActiveTrades(userId);
    
    if (activeTrades && activeTrades.length > 0) {
      socket.emit('activeTrades', {
        trades: activeTrades.map(trade => ({
          id: trade.id,
          direction: trade.direction,
          amount: trade.amount,
          entryPrice: trade.entryPrice,
          duration: trade.duration,
          expirationTime: trade.expirationTime,
          status: trade.status
        })),
        count: activeTrades.length
      });
    }
  } catch (error) {
    console.error('Error sending active trades:', error);
  }
};

// Helper function to get trade history
const getTradeHistory = async (userId, filters = {}) => {
  const { limit = 50, offset = 0, status } = filters;
  
  let query = { userId };
  if (status) query.status = status;
  
  if (process.env.DB_TYPE === 'mongodb') {
    const trades = await Trade.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset));
    
    return trades.map(trade => ({
      id: trade.id,
      direction: trade.direction,
      amount: trade.amount,
      entryPrice: trade.entryPrice,
      exitPrice: trade.exitPrice,
      duration: trade.duration,
      status: trade.status,
      profitLoss: trade.profitLoss,
      createdAt: trade.createdAt,
      expirationTime: trade.expirationTime
    }));
  } else {
    const trades = await Trade.findAll({
      where: query,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    
    return trades.map(trade => ({
      id: trade.id,
      direction: trade.direction,
      amount: trade.amount,
      entryPrice: trade.entryPrice,
      exitPrice: trade.exitPrice,
      duration: trade.duration,
      status: trade.status,
      profitLoss: trade.profitLoss,
      createdAt: trade.createdAt,
      expirationTime: trade.expirationTime
    }));
  }
};

module.exports = { setupSocketHandlers };
