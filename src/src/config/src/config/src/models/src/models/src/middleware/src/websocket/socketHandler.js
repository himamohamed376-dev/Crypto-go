const jwt = require('jsonwebtoken');
const User = require('../models/User');

let connectedClients = new Map();

const setupSocketHandlers = (io, logger) => {
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
    logger.info(`User ${socket.userId} connected with socket ID: ${socket.id}`);
    
    // Store client connection
    connectedClients.set(socket.userId, {
      id: socket.id,
      socket: socket
    });
    
    // Join user-specific room
    socket.join(`user:${socket.userId}`);
    
    // Handle trade creation
    socket.on('createTrade', (tradeData) => {
      logger.info(`User ${socket.userId} created trade:`, tradeData);
      // Broadcast to user's room
      io.to(`user:${socket.userId}`).emit('tradeCreated', {
        ...tradeData,
        userId: socket.userId,
        timestamp: Date.now()
      });
    });
    
    // Handle trade cancellation
    socket.on('cancelTrade', (tradeId) => {
      logger.info(`User ${socket.userId} cancelled trade: ${tradeId}`);
      // Broadcast to user's room
      io.to(`user:${socket.userId}`).emit('tradeCancelled', {
        tradeId,
        userId: socket.userId,
        timestamp: Date.now()
      });
    });
    
    // Handle subscription to price updates
    socket.on('subscribePrice', (symbol = 'BTCUSDT') => {
      logger.info(`User ${socket.userId} subscribed to ${symbol}`);
      socket.join(`price:${symbol}`);
      socket.emit('subscribed', { symbol, status: 'success' });
    });
    
    // Handle unsubscription
    socket.on('unsubscribePrice', (symbol = 'BTCUSDT') => {
      logger.info(`User ${socket.userId} unsubscribed from ${symbol}`);
      socket.leave(`price:${symbol}`);
      socket.emit('unsubscribed', { symbol, status: 'success' });
    });
    
    // Handle disconnection
    socket.on('disconnect', () => {
      logger.info(`User ${socket.userId} disconnected`);
      connectedClients.delete(socket.userId);
    });
    
    // Error handling
    socket.on('error', (error) => {
      logger.error(`Socket error for user ${socket.userId}:`, error);
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
    }
  };
};

module.exports = { setupSocketHandlers };
