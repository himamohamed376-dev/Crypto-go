const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { generateToken } = require('../middleware/auth');

const register = async (req, res) => {
  try {
    const { email, password, username } = req.body;
    
    // Validate input
    if (!email || !password || !username) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email, password, and username'
      });
    }
    
    // Check if user exists
    let existingUser;
    if (process.env.DB_TYPE === 'mongodb') {
      existingUser = await User.findOne({ $or: [{ email }, { username }] });
    } else {
      existingUser = await User.findOne({ 
        where: { 
          [Op.or]: [{ email }, { username }] 
        } 
      });
    }
    
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'User with this email or username already exists'
      });
    }
    
    // Create user
    let user;
    if (process.env.DB_TYPE === 'mongodb') {
      user = await User.create({ email, password, username });
    } else {
      user = await User.create({ email, password, username });
    }
    
    // Generate token
    const token = generateToken(user.id);
    
    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          balance: user.balance
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: error.message
    });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }
    
    // Find user
    let user;
    if (process.env.DB_TYPE === 'mongodb') {
      user = await User.findOne({ email });
    } else {
      user = await User.findOne({ where: { email } });
    }
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    // Update last login
    user.lastLogin = new Date();
    await user.save();
    
    // Generate token
    const token = generateToken(user.id);
    
    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          balance: user.balance
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
};

const refreshToken = async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'No token provided'
      });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const newToken = generateToken(decoded.id);
    
    res.status(200).json({
      success: true,
      data: { token: newToken }
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
};

const logout = async (req, res) => {
  try {
    // In a stateless JWT system, logout is handled client-side
    // But we can add token blacklist here if needed
    
    res.status(200).json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Logout failed'
    });
  }
};

const getProfile = async (req, res) => {
  try {
    const user = req.user;
    
    res.status(200).json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        username: user.username,
        balance: user.balance,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get profile'
    });
  }
};

const updateProfile = async (req, res) => {
  try {
    const { username } = req.body;
    const user = req.user;
    
    if (username) {
      // Check if username is taken
      let existingUser;
      if (process.env.DB_TYPE === 'mongodb') {
        existingUser = await User.findOne({ 
          username, 
          _id: { $ne: user.id } 
        });
      } else {
        existingUser = await User.findOne({ 
          where: { 
            username,
            id: { [Op.ne]: user.id } 
          } 
        });
      }
      
      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: 'Username already taken'
        });
      }
      
      user.username = username;
      await user.save();
    }
    
    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        id: user.id,
        email: user.email,
        username: user.username
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Profile update failed',
      error: error.message
    });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = req.user;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide current and new password'
      });
    }
    
    // Verify current password
    const isPasswordValid = await user.comparePassword(currentPassword);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }
    
    // Update password
    user.password = newPassword;
    await user.save();
    
    res.status(200).json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Password change failed',
      error: error.message
    });
  }
};

module.exports = {
  register,
  login,
  refreshToken,
  logout,
  getProfile,
  updateProfile,
  changePassword
};
