const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authMiddleware = async (req, res, next) => {
  try {
    // Get token from header
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided. Please authenticate.'
      });
    }
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Find user
    let user;
    if (process.env.DB_TYPE === 'mongodb') {
      user = await User.findById(decoded.id);
    } else {
      // For PostgreSQL
      user = await User.findByPk(decoded.id);
    }
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found. Authentication failed.'
      });
    }
    
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated. Please contact support.'
      });
    }
    
    // Attach user to request
    req.user = user;
    req.token = token;
    req.userId = decoded.id;
    
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token. Authentication failed.'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired. Please login again.'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Authentication failed.',
      error: error.message
    });
  }
};

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

module.exports = authMiddleware;
module.exports.generateToken = generateToken;
